import mqtt from 'mqtt';
import { createDecipheriv } from 'crypto';

import TuyaOpenAPI from './TuyaOpenAPI';
import Logger, { ExLogger, PrefixLogger } from '../../shared/util/Logger';
import { generateUUID } from '../../shared/util/util';
import dns from 'dns';

const GCM_TAG_LENGTH = 16;

interface TuyaMQTTConfigSourceTopic {
  device: string;
}

interface TuyaMQTTConfig {
  url: string;
  client_id: string;
  username: string;
  password: string;
  expire_time: number;
  source_topic: TuyaMQTTConfigSourceTopic;
  sink_topic: object;
}

type TuyaMQTTCallback = (topic: string, protocol: number, data) => void;

export default class TuyaOpenMQ {

  public client?: mqtt.MqttClient;
  public config?: TuyaMQTTConfig;
  public version = '1.0';
  public messageListeners = new Set<TuyaMQTTCallback>();
  public linkId = generateUUID();

  public timer?: NodeJS.Timeout;
  public log: ExLogger;

  constructor(
    public api: TuyaOpenAPI,
    public logger: Logger = new PrefixLogger(console, 'console', false),
    public debug = false,
    public forceIPv4 = api.forceIPv4,
  ) {
    this.log = new PrefixLogger(logger, TuyaOpenMQ.name, debug);
  }

  start() {
    this._connect();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.client) {
      this.client.removeAllListeners();
      this.client.end(true);
      this.client = undefined;
    }
  }

  async _connect() {
    this.stop();

    const res = await this._getMQConfig('mqtt');
    if (!res.success) {
      this.log.warn('Get MQTT config failed. code = %s, msg = %s', res.code, res.msg);
      return;
    }
    this.log.success('MQTT config retrieved.');

    const { url, client_id, username, password, expire_time, source_topic } = res.result;
    this.log.debug('Connecting to:', url);
    const clientOptions: mqtt.IClientOptions = {
      clientId: client_id,
      username: username,
      password: password,
      keepalive: 300,
      reconnectPeriod: 5000,
    };

    if (this.forceIPv4) {
      this.log.debug('forcing ipv4 connection');
      clientOptions['family'] = 4;
      clientOptions['lookup'] = (hostname, options, callback) => {
        // Node v24 の multi-family 接続を避け、IPv4 のみ解決
        return dns.lookup(hostname, { family: 4 }, callback);
      };
    }
    const client = mqtt.connect(url, clientOptions);

    client.on('connect', this._onConnect.bind(this));
    client.on('error', this._onError.bind(this));
    client.on('end', this._onEnd.bind(this));
    client.on('message', this._onMessage.bind(this));

    this.client = client;
    this.config = res.result;

    // Reconnect before the token expires.
    this.timer = setTimeout(this._connect.bind(this), (expire_time - 60) * 1000);

  }

  async _getMQConfig(linkType: string) {
    return await this.api.post('/v1.0/iot-03/open-hub/access-config', {
      uid: this.api.tokenInfo.uid,
      link_id: this.linkId,
      link_type: linkType,
      topics: 'device',
      msg_encrypted_version: this.version,
    });
  }

  _onConnect() {
    this.log.debug('Connected');

    if (!this.client || !this.config) {
      return;
    }

    this.client.subscribe(this.config.source_topic.device, (err) => {
      if (err) {
        this.log.error('Subscribe error:', err);
      }
    });
  }

  _onError(error: Error) {
    this.log.error('MQTT Error:', error);

    if (this.client) {
      this.client.end(true);
    }
  }

  _onEnd() {
    this.log.warn('MQTT connection ended. Reconnecting...');
    setTimeout(() => this._connect(), 3000);
  }

  async _onMessage(topic: string, payload: Buffer) {
    const { protocol, data, t } = JSON.parse(payload.toString());
    const messageData = this._decodeMQMessage(data, this.config!.password, t);
    if (!messageData) {
      this.log.warn('Message decode failed:', payload.toString());
      return;
    }
    const message = JSON.parse(messageData);
    this.log.debug('onMessage:\ntopic = %s\nprotocol = %s\nmessage = %s\nt = %s', topic, protocol, JSON.stringify(message, null, 2), t);

    this._fixWrongOrderMessage(protocol, message, t);

    for (const listener of this.messageListeners) {
      listener(topic, protocol, message);
    }
  }

  private consumedQueue: any[] = [];
  _fixWrongOrderMessage(protocol: number, message, t: number) {
    if (protocol !== 4) {
      return;
    }

    const currentPayload = { protocol, message, t };
    const lastPayload = this.consumedQueue[this.consumedQueue.length - 1];

    if (lastPayload && currentPayload.t < lastPayload.t) {
      this.log.debug('Message received with wrong order.');
      this.log.debug('LastMessage: dataId = %s, t = %s', lastPayload.message.dataId, lastPayload.t);
      this.log.debug('CurrentMessage: dataId = %s, t = %s', message.dataId, t);
      this.log.debug('This may cause outdated device status update.');

      // Use newer status to override current status.
      for (const _status of message.status) {
        for (const payload of this.consumedQueue.reverse()) {
          if (message.devId !== payload.message.devId) {
            continue;
          }

          const latestStatus = payload.message.status.find(item => item.code === _status.code);
          if (latestStatus) {
            if (latestStatus.value !== _status.value) {
              this.log.debug('Override status %o => %o', latestStatus, _status);
              _status.value = latestStatus.value;
              _status.t = latestStatus.t;
            }
            break;
          }
        }
      }
      return;
    }

    this.consumedQueue.push(currentPayload);

    while (this.consumedQueue.length > 0) {
      let t = this.consumedQueue[0].t;
      if (t > 1e12) {
        t = t / 1000;
      }

      // Remove message older than 30 seconds
      if (Date.now() / 1000 > t + 30) {
        this.consumedQueue.shift();
      } else {
        break;
      }
    }
  }

  _decodeMQMessage_1_0(b64msg: string, password: string) {
    password = password.substring(8, 24);
    // Decode base64 to buffer
    const ciphertext = Buffer.from(b64msg, 'base64');

    // Create decipher: AES-128-ECB with PKCS7 padding
    const decipher = createDecipheriv('aes-128-ecb', Buffer.from(password, 'utf8'), '');

    // Decrypt
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }

  _decodeMQMessage_2_0(data: string, password: string, t: number) {
    // Base64 decoding generates Buffers
    const tmpbuffer = Buffer.from(data, 'base64');
    const key = password.substring(8, 24).toString();
    //get iv_length & iv_buffer
    const iv_length = tmpbuffer.readUIntBE(0, 4);
    const iv_buffer = tmpbuffer.slice(4, iv_length + 4);
    //Removes the IV bits of the head and 16 bits of the tail tags
    const data_buffer = tmpbuffer.slice(iv_length + 4, tmpbuffer.length - GCM_TAG_LENGTH);
    const cipher = createDecipheriv('aes-128-gcm', key, iv_buffer);
    //setAuthTag buffer
    cipher.setAuthTag(tmpbuffer.slice(tmpbuffer.length - GCM_TAG_LENGTH, tmpbuffer.length));
    //setAAD buffer
    const buf = Buffer.allocUnsafe(6);
    buf.writeUIntBE(t, 0, 6);
    cipher.setAAD(buf);

    const msg = cipher.update(data_buffer);
    return msg.toString('utf8');
  }

  _decodeMQMessage(data: string, password: string, t: number) {
    if (this.version === '2.0') {
      return this._decodeMQMessage_2_0(data, password, t);
    } else {
      return this._decodeMQMessage_1_0(data, password);
    }
  }

  addMessageListener(listener: TuyaMQTTCallback) {
    this.messageListeners.add(listener);
  }

  removeMessageListener(listener: TuyaMQTTCallback) {
    this.messageListeners.delete(listener);
  }

}
