/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-len */

import {
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  CameraController,
  CameraControllerOptions,
  CameraRecordingOptions,
  CameraStreamingDelegate,
  CameraStreamingOptions,
  EventTriggerOption,
  HAP,
  H264Level,
  H264Profile,
  MediaContainerType,
  PrepareStreamCallback,
  PrepareStreamRequest,
  Resolution,
  SnapshotRequest,
  SnapshotRequestCallback,
  SRTPCryptoSuites,
  StreamingRequest,
  StreamRequestCallback,
  PrepareStreamResponse,
  StartStreamRequest,
} from 'homebridge';

import {
  defaultFfmpegPath,
  reservePorts,
} from '@homebridge/camera-utils';

import CameraAccessory from '../accessory/CameraAccessory';

import {
  TuyaRecordingDelegate,
} from './TuyaRecordingDelegate';
import { spawn } from 'child_process';
import { createSocket, Socket } from 'dgram';
import { FfmpegStreamingProcess, StreamingDelegate as FfmpegStreamingDelegate, isFfmpegOptionSupported, isEncoderAvailable } from './FfmpegStreamingProcess';
import { logger, PrefixLogger } from './Logger';

interface SessionInfo {
    address: string; // address of the HAP controller
    addressVersion: 'ipv4' | 'ipv6';

    videoPort: number;
    videoIncomingPort: number;
    videoCryptoSuite: SRTPCryptoSuites; // should be saved if multiple suites are supported
    videoSRTP: Buffer; // key and salt concatenated
    videoSSRC: number; // rtp synchronisation source

    audioPort: number;
    audioIncomingPort: number;
    audioCryptoSuite: SRTPCryptoSuites;
    audioSRTP: Buffer;
    audioSSRC: number;
}

type ActiveSession = {
    mainProcess?: FfmpegStreamingProcess;
    returnProcess?: FfmpegStreamingProcess;
    timeout?: NodeJS.Timeout;
    socket?: Socket;
};

/*
interface SampleRateEntry {
    type: AudioRecordingCodecType;
    bitrateMode: number;
    samplerate: AudioRecordingSamplerate[];
    audioChannels: number;
}
*/
enum _H264Profile {
    BASELINE = 0,
    MAIN = 1,
    HIGH = 2
}
enum _H264Level {
    LEVEL3_1 = 0,
    LEVEL3_2 = 1,
    LEVEL4_0 = 2
}

const resolutions: Resolution[] = [
  [320, 180, 30],
  [320, 240, 15],
  [320, 240, 30],
  [480, 270, 30],
  [480, 360, 30],
  [640, 360, 30],
  [640, 480, 30],
  [1280, 720, 30],
  [1280, 960, 30],
  [1920, 1080, 30],
  [1600, 1200, 30],
];

export class TuyaStreamingDelegate implements CameraStreamingDelegate, FfmpegStreamingDelegate {
  public controller!: CameraController;

  private pendingSessions: { [index: string]: SessionInfo } = {};
  private ongoingSessions: { [index: string]: ActiveSession } = {};

  private readonly camera: CameraAccessory;
  private readonly hap: HAP;
  private log: PrefixLogger;

  private constructor(camera: CameraAccessory) {
    this.camera = camera;
    this.hap = camera.platform.api.hap;
    this.log = new PrefixLogger(logger(), `TuyaStreamingDelegate(${camera.accessory.displayName})`);
  }

  public static async create(camera: CameraAccessory): Promise<TuyaStreamingDelegate> {
    const delegate = new TuyaStreamingDelegate(camera);
    // this.recordingDelegate = new TuyaRecordingDelegate();

    const streamingOptions = await TuyaStreamingDelegate.createStreamingOptions(delegate);

    const recordingOptions: CameraRecordingOptions = {
      overrideEventTriggerOptions: [
        EventTriggerOption.MOTION,
        EventTriggerOption.DOORBELL,
      ],
      prebufferLength: 4 * 1000, // prebufferLength always remains 4s ?
      mediaContainerConfiguration: [
        {
          type: MediaContainerType.FRAGMENTED_MP4,
          fragmentLength: 4000,
        },
      ],
      video: {
        parameters: {
          profiles: [
            H264Profile.BASELINE,
            H264Profile.MAIN,
            H264Profile.HIGH,
          ],
          levels: [
            H264Level.LEVEL3_1,
            H264Level.LEVEL3_2,
            H264Level.LEVEL4_0,
          ],
        },
        resolutions: resolutions,
        type: camera.platform.api.hap.VideoCodecType.H264,
      },
      audio: {
        codecs: [
          {
            samplerate: camera.platform.api.hap.AudioRecordingSamplerate.KHZ_32,
            type: camera.platform.api.hap.AudioRecordingCodecType.AAC_LC,
          },
        ],
      },
    };

    const options: CameraControllerOptions = {
      delegate: delegate,
      streamingOptions: streamingOptions,
      // recording: {
      // options: recordingOptions,
      // delegate: this.recordingDelegate
      // }
    };

    delegate.controller = new camera.platform.api.hap.CameraController(options);

    return delegate;
  }

  private static async createStreamingOptions(delegate: TuyaStreamingDelegate): Promise<CameraStreamingOptions> {

    const opusCodec = {
      type: AudioStreamingCodecType.OPUS,
      samplerate: [AudioStreamingSamplerate.KHZ_16, AudioStreamingSamplerate.KHZ_24],
    };
    const aacELDCodec = {
      type: AudioStreamingCodecType.AAC_ELD,
      samplerate: [AudioStreamingSamplerate.KHZ_16, AudioStreamingSamplerate.KHZ_24],
    };

    const streamingOptions: CameraStreamingOptions = {
      supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
      video: {
        codec: {
          profiles: [H264Profile.BASELINE],
          levels: [H264Level.LEVEL3_1],
        },
        resolutions: resolutions,
      },
      audio: {
        twoWayAudio: false,
        codecs: [],
      },
    };

    streamingOptions.audio!.codecs.push(opusCodec);

    if (await isEncoderAvailable(defaultFfmpegPath, 'libfdk_aac')) {
      streamingOptions.audio!.codecs.push(aacELDCodec);
    } else {
      delegate.log.warn('ffmpeg libfdk_aac encoder not available. AAC-ELD audio streaming will not be supported.');
    }
    return streamingOptions;
  }

  stopStream(sessionId: string): void {
    const session = this.ongoingSessions[sessionId];

    if (session) {
      if (session.timeout) {
        clearTimeout(session.timeout);
      }

      try {
        session.socket?.close();
      } catch (error) {
        this.log.error(`Error occurred closing socket: ${error}`);
      }

      try {
        session.mainProcess?.stop();
      } catch (error) {
        this.log.error(`Error occurred terminating main FFmpeg process: ${error}`);
      }

      try {
        session.returnProcess?.stop();
      } catch (error) {
        this.log.error(`Error occurred terminating two-way FFmpeg process: ${error}`);
      }

      delete this.ongoingSessions[sessionId];

      this.log.info('Stopped video stream.');
    }
  }

  forceStopStream(sessionId: string) {
    this.controller.forceStopStreamingSession(sessionId);
  }

  async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ) {
    try {
      this.log.debug(`Snapshot requested: ${request.width} x ${request.height}`);

      const snapshot = await this.fetchSnapshot(request.width, request.height);

      this.log.debug('Sending snapshot');

      callback(undefined, snapshot);
    } catch (error) {
      callback(error as Error);
    }
  }

  async prepareStream(
    request: PrepareStreamRequest,
    callback: PrepareStreamCallback,
  ) {
    const videoIncomingPort = await reservePorts({
      count: 1,
    });
    const videoSSRC = this.hap.CameraController.generateSynchronisationSource();

    const audioIncomingPort = await reservePorts({
      count: 1,
    });
    const audioSSRC = this.hap.CameraController.generateSynchronisationSource();

    const sessionInfo: SessionInfo = {
      address: request.targetAddress,
      addressVersion: request.addressVersion,

      audioCryptoSuite: request.audio.srtpCryptoSuite,
      audioPort: request.audio.port,
      audioSRTP: Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]),
      audioSSRC: audioSSRC,
      audioIncomingPort: audioIncomingPort[0],

      videoCryptoSuite: request.video.srtpCryptoSuite,
      videoPort: request.video.port,
      videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
      videoSSRC: videoSSRC,
      videoIncomingPort: videoIncomingPort[0],
    };

    const response: PrepareStreamResponse = {
      video: {
        port: sessionInfo.videoIncomingPort,
        ssrc: videoSSRC,
        srtp_key: request.video.srtp_key,
        srtp_salt: request.video.srtp_salt,
      },
      audio: {
        port: sessionInfo.audioIncomingPort,
        ssrc: audioSSRC,
        srtp_key: request.audio.srtp_key,
        srtp_salt: request.audio.srtp_salt,
      },
    };

    this.pendingSessions[request.sessionID] = sessionInfo;
    callback(undefined, response);
  }

  async handleStreamRequest(
    request: StreamingRequest,
    callback: StreamRequestCallback,
  ) {
    switch (request.type) {
      case this.hap.StreamRequestTypes.START: {
        this.log.debug(`Start stream requested: ${request.video.width}x${request.video.height}, ${request.video.fps} fps, ${request.video.max_bit_rate} kbps`);

        await this.startStream(request, callback);
        break;
      }

      case this.hap.StreamRequestTypes.RECONFIGURE: {
        this.log.debug(`Reconfigure stream requested: ${request.video.width}x${request.video.height}, ${request.video.fps} fps, ${request.video.max_bit_rate} kbps (Ignored)`);

        callback();
        break;
      }

      case this.hap.StreamRequestTypes.STOP: {
        this.log.debug('Stop stream requested');

        this.stopStream(request.sessionID);
        callback();
        break;
      }
    }
  }

  private async getAudioEncodingArgs(requestedCodec: AudioStreamingCodecType): Promise<{ codec: string; args: string[] }> {
    if (requestedCodec === AudioStreamingCodecType.OPUS) {
      return {
        codec: 'libopus',
        args: ['-c:a', 'libopus', '-application', 'lowdelay', '-frame_duration', '20'],
      };
    }

    if (requestedCodec === AudioStreamingCodecType.AAC_ELD) {
      return {
        codec: 'libfdk_aac',
        args: ['-c:a', 'libfdk_aac', '-profile:a', 'aac_eld', '-flags:a', '+global_header'],
      };
    }

    throw new Error(`Unsupported audio codec requested: ${requestedCodec}`);
  }

  private async getVideoSyncArgs(): Promise<string[]> {
    const supportsFpsMode = await isFfmpegOptionSupported(defaultFfmpegPath, 'fps_mode');

    if (supportsFpsMode) {
      this.log.debug('Using ffmpeg fps_mode for stream synchronization.');
      return ['-fps_mode', 'cfr'];
    }

    this.log.debug('ffmpeg fps_mode is not available. Falling back to vsync.');
    return ['-vsync', '0'];
  }

  private async startStream(request: StartStreamRequest, callback: StreamRequestCallback) {
    const sessionInfo = this.pendingSessions[request.sessionID];

    if (!sessionInfo) {
      this.log.error('Error finding session information.');
      callback(new Error('Error finding session information'));
      return;
    }

    this.log.debug(`request: ${JSON.stringify(request)}`);

    const vcodec = 'libx264';
    const mtu = request.video.mtu || 1316;

    const fps = request.video.fps;
    const videoBitrate = request.video.max_bit_rate;

    const rtspUrl = await this.camera.deviceManager.retrieveDeviceRTSP(this.camera.device);

    const ffmpegArgs: string[] = [
      '-hide_banner',
      // '-re',
      // '-fflags', '+genpts',
      // '-fflags', '+genpts+discardcorrupt+igndts',
      // '-fflags', 'nobuffer',
      // '-fflags', 'flush_packets',
      // '-rtbufsize', '1M',
      // '-avoid_negative_ts', 'make_zero',
      // '-async', '1',
      // '-vsync', '0',
      // '-max_delay', '0',
      // '-thread_queue_size', '1024',
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
    ];

    if (this.log.debugMode) {
      ffmpegArgs.push('-loglevel', 'verbose');
      ffmpegArgs.push('-progress', 'pipe:1');
    }

    // Video Stream

    const videoSyncArgs = await this.getVideoSyncArgs();

    ffmpegArgs.push(
      '-map', '0:v:0',
      '-an',
      // '-fflags', '+genpts',
      // '-avoid_negative_ts', 'make_zero',
      '-profile:v', `${_H264Profile[request.video.profile].toLowerCase()}`,
      '-level:v', `${_H264Level[request.video.level].replace(/LEVEL(\d)_(\d)/, '$1.$2')}`,
      // '-r', fps.toString(),
      // '-g', `${fps * 2}`,
      ...videoSyncArgs,
      '-c:v', vcodec,
      '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-payload_type', `${request.video.pt}`,
      '-ssrc', `${sessionInfo.videoSSRC}`,
      '-f', 'rtp',
      '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80',
      '-srtp_out_params', sessionInfo.videoSRTP.toString('base64'),
    );

    if (videoBitrate > 0) {
      ffmpegArgs.push('-b:v', `${videoBitrate*1000}`);
    }

    ffmpegArgs.push(`srtp://${sessionInfo.address}:${sessionInfo.videoPort}?rtcpport=${sessionInfo.videoPort}&pkt_size=${mtu}`);

    // Setting up audio

    this.log.info(`Audio codec requested: ${request.audio.codec}`);
    if (
      request.audio.codec === AudioStreamingCodecType.OPUS ||
            request.audio.codec === AudioStreamingCodecType.AAC_ELD
    ) {
      ffmpegArgs.push(
        '-map', '0:a:0',
        '-vn',
      );

      const audioEncodingArgs = await this.getAudioEncodingArgs(request.audio.codec);
      ffmpegArgs.push(...audioEncodingArgs.args);

      ffmpegArgs.push(
        // '-thread_queue_size', '512',
        // '-max_delay', '0',
        // '-fflags', 'nobuffer',
        '-ar', `${request.audio.sample_rate*1000}`,
        '-b:a', `${request.audio.max_bit_rate*1000}`,
        '-ac', `${request.audio.channel}`,
        // '-af', 'aresample=async=1',
        '-af', 'aresample=async=1:min_hard_comp=0.100000:first_pts=0',
        // '-af', 'aresample=resampler=soxr',
        '-payload_type', `${request.audio.pt}`,
        '-ssrc', `${sessionInfo.audioSSRC}`,
        '-f', 'rtp',
        // '-cutoff', '12000',
        '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80',
        '-srtp_out_params', sessionInfo.audioSRTP.toString('base64'),
        `srtp://${sessionInfo.address}:${sessionInfo.audioPort}?rtcpport=${sessionInfo.audioPort}&pkt_size=188`,
      );
    } else {
      this.log.error(`Unsupported audio codec requested: ${request.audio.codec}`);
    }

    const activeSession: ActiveSession = {};

    activeSession.socket = createSocket(sessionInfo.addressVersion === 'ipv6' ? 'udp6' : 'udp4');

    activeSession.socket.on('error', (err: Error) => {
      this.log.error('Socket error: ' + err.message);
      this.stopStream(request.sessionID);
    });

    activeSession.socket.on('message', () => {
      if (activeSession.timeout) {
        clearTimeout(activeSession.timeout);
      }
      activeSession.timeout = setTimeout(() => {
        this.log.info('Device appears to be inactive. Stopping stream.');
        this.controller.forceStopStreamingSession(request.sessionID);
        this.stopStream(request.sessionID);
      }, request.video.rtcp_interval * 5 * 1000);
    });

    activeSession.socket.bind(sessionInfo.videoIncomingPort);

    activeSession.mainProcess = new FfmpegStreamingProcess(
      request.sessionID,
      defaultFfmpegPath,
      ffmpegArgs,
      this.log,
      this,
      callback,
    );

    this.ongoingSessions[request.sessionID] = activeSession;
    delete this.pendingSessions[request.sessionID];
  }

  private async fetchSnapshot(width: number, height: number): Promise<Buffer> {
    if (!this.camera.device.online) {
      this.log.debug('Device is currently offline.');
      throw new Error('Device is currently offline.');
    }

    // TODO: Check if there is a stream already running to fetch snapshot.

    const rtspUrl = await this.camera.deviceManager.retrieveDeviceRTSP(this.camera.device);
    const ffmpegArgs: string[] = [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', rtspUrl,
      // '-analyzeduration', '0',
      // '-probesize', '32',
      '-vframes:v', '1',
      '-vf', `scale=${width}:${height}`,
      // '-pix_fmt', 'yuvj422p',
      '-f', 'mjpeg',
      '-',
    ];
    // old version
    // const ffmpegArgs = [
    //   '-i', rtspUrl,
    //   '-frames:v', '1',
    //   '-hide_banner',
    //   '-loglevel',
    //   'error',
    //   '-f',
    //   'image2',
    //   '-',
    // ];

    return new Promise((resolve, reject) => {

      this.log.debug(`Running Snapshot command: ${defaultFfmpegPath} ${ffmpegArgs.map(value => JSON.stringify(value)).join(' ')}`);

      const ffmpeg = spawn(
        defaultFfmpegPath,
        ffmpegArgs.map(x => x.toString()),
        { env: process.env },
      );

      let errors: string[] = [];

      let snapshotBuffer = Buffer.alloc(0);

      ffmpeg.stdout.on('data', (data) => {
        snapshotBuffer = Buffer.concat([snapshotBuffer, data]);
      });

      ffmpeg.on('error', (error) => {
        this.log.error(`FFmpeg process creation failed: ${error.message} - Showing "offline" image instead.`);
        reject('Failed to fetch snapshot.');
      });

      ffmpeg.stderr.on('data', (data) => {
        errors = errors.slice(-5);
        errors.push(data.toString().replace(/(\r\n|\n|\r)/gm, ' '));
      });

      ffmpeg.on('close', () => {
        if (snapshotBuffer.length > 0) {
          resolve(snapshotBuffer);
        } else {
          this.log.error('Failed to fetch snapshot. Showing "offline" image instead.');

          if (errors.length > 0) {
            this.log.error(errors.join(' - '));
          }

          reject('Unable to fetch snapshot.');
        }
      });
    });
  }
}
