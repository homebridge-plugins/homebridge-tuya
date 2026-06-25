import { EOL } from 'os';
import net from 'net';
import { CommonConfig, TuyaPlatformConfig, TuyaPlatformDeviceConfig, TuyaPluginMode } from '../../config';
import { ExLogger, logger, PrefixLogger } from './Logger';
import configSchemaJson from '../../../config.schema.json';
import { sanitizeName } from './util';

export default class ConfigMigrator {
  private log: ExLogger;

  constructor(debugMode: boolean = false) {
    this.log = new PrefixLogger(logger(), this.constructor.name, debugMode);
  }

  migrate(config: TuyaPlatformConfig) {
    this.log.info('Migrating config...');
    let clonedConfig = structuredClone(config);

    this.migratePlatformConfig(clonedConfig);

    // To maintain backward compatibility, default values will also be set during the migration process.
    clonedConfig = this.applyDefaultConfig(clonedConfig);

    // Normalization of configuration formats.
    clonedConfig = this.normalizeConfig(clonedConfig);

    // Removal of unnecessary settings.
    clonedConfig = this.cleanupConfig(clonedConfig);

    // for log
    const diff = this.diffConfig(config, clonedConfig).join(EOL);
    if (diff) {
      this.log.warn(`migrated: ${diff}`);
    }

    return clonedConfig;
  }

  private migratePlatformConfig(config: TuyaPlatformConfig) {
    // debug options moved to common
    config.common = config.common ?? {} as CommonConfig;
    config.common.debug = config.common.debug !== undefined ? config.common.debug : (config as any).options?.debug ?? false;

    config.common.debugLevel = config.common.debugLevel !== undefined ? config.common.debugLevel : (config as any).options?.debugLevel;

    // options renamed to cloud
    config.cloud = config.cloud !== undefined ? config.cloud : (config as any).options;
    delete (config as any).options;
    delete (config as any).cloud?.debug;
    delete (config as any).cloud?.debugLevel;

    if (!!config.cloud) {
      config.cloud.deviceOverrides?.forEach(this.migrateDeviceConfig);
      // Updated deviceOverrides so it can be used in both cloud and local modes.
      const cloudDeviceOverrides = config.cloud.deviceOverrides?.filter(config => [TuyaPluginMode.cloud, TuyaPluginMode.both, undefined].includes(config.configFor as any));
      const localDeviceOverrides = config.cloud.deviceOverrides?.filter(config => [TuyaPluginMode.local, TuyaPluginMode.both].includes(config.configFor as any));
      config.cloud.deviceOverrides = cloudDeviceOverrides;
      if (!!config.local) {
        config.local.deviceOverrides = localDeviceOverrides;
      }
    }
  }

  private migrateDeviceConfig(config: TuyaPlatformDeviceConfig) {
    config.schema?.forEach(item => {
      if (item['oldCode']) {
        item.newCode = item.code;
        item.code = item['oldCode'];
        item['oldCode'] = undefined;
      }
    });
  }

  private applyDefaultConfig(config: TuyaPlatformConfig) {
    const defaultPlatformConfig = this.extractDefaultConfig(configSchemaJson.schema);
    this.log.debug('defaultPlatformConfig: %o', defaultPlatformConfig);
    const defaultCloudConfig = this.extractDefaultConfig(configSchemaJson.schema.properties.options);
    this.log.debug('defaultCloudConfig: %o', defaultCloudConfig);
    const defaultLocalConfig = this.extractDefaultConfig(configSchemaJson.schema.properties.local);
    this.log.debug('defaultLocalConfig: %o', defaultLocalConfig);
    const defaultCommonConfig = this.extractDefaultConfig(configSchemaJson.schema.properties.common);
    this.log.debug('defaultCommonConfig: %o', defaultCommonConfig);

    const newConfig = {...defaultPlatformConfig, ...config} as TuyaPlatformConfig;
    if ([TuyaPluginMode.cloud, TuyaPluginMode.both].includes(newConfig!.mode as TuyaPluginMode)) {
      newConfig.cloud = {...defaultCloudConfig, ...newConfig.cloud};
    }
    if ([TuyaPluginMode.local, TuyaPluginMode.both].includes(newConfig!.mode as TuyaPluginMode)) {
      newConfig.local = {...defaultLocalConfig, ...newConfig.local};
    }
    newConfig.common = {...defaultCommonConfig, ...newConfig.common};
    return newConfig;
  }

  private extractDefaultConfig(schema: any): any {
    const defaults: Record<string, any> = {};

    const props = schema.properties ?? {};

    for (const key of Object.keys(props)) {
      const prop = props[key];

      if (prop && Object.prototype.hasOwnProperty.call(prop, 'default')) {
        defaults[key] = prop.default;
      }
    }

    return defaults;
  }

  private normalizeConfig(config: TuyaPlatformConfig) {
    const clonedConfig = structuredClone(config);

    const cloudConfig = clonedConfig.cloud;

    const localConfig = clonedConfig.local;

    cloudConfig?.serviceInformationOverrides?.forEach(item => item.configuredName = sanitizeName(item.configuredName));
    localConfig?.devices?.forEach(item => item.name = sanitizeName(item.name));
    return clonedConfig;
  }

  private cleanupConfig(config: TuyaPlatformConfig) {
    const clonedConfig = structuredClone(config);

    // Since losing settings during Cloud/Local switching—especially during debugging—would be problematic,
    // the settings are preserved even if one side technically no longer needs them.
    // Unnecessary settings are then cleaned up internally.
    if (config.mode === TuyaPluginMode.cloud) {
      this.log.warn('local settings are unused in cloud mode.');
      delete clonedConfig.local;
    } else if (config.mode === TuyaPluginMode.local) {
      this.log.warn('cloud settings are unused in local mode.');
      delete clonedConfig.cloud;
    }


    const cloudConfig = clonedConfig.cloud;

    const localConfig = clonedConfig.local;

    const commonConfig = clonedConfig.common;

    if (cloudConfig) {
      cloudConfig.deviceOverrides = cloudConfig.deviceOverrides?.filter(i => !!i.id) ?? [];
      // Because the Homebridge configuration UI does not officially support nested tabs, unused tabs may sometimes be generated.
      cloudConfig.deviceOverrides?.forEach(i => i.schema = i.schema?.filter(j => j.code !== undefined) ?? []);
    }
    if (localConfig) {
      localConfig.devices = localConfig.devices?.filter(i => !!i.tuyaDeviceId) ?? [];
      localConfig.devices.forEach(device => {
        if (device.ip !== undefined && !net.isIP(device.ip)) {
          this.log.warn(`${device.name ?? device.tuyaDeviceId}: bad ip address: ${device.ip}`);
          device.ip = undefined;
        }
      });
      // Because the Homebridge configuration UI does not officially support nested tabs, unused tabs may sometimes be generated.
      localConfig.deviceOverrides?.forEach(i => i.schema = i.schema?.filter(j => j.code !== undefined) ?? []);

      // delete unset dpMapping
      localConfig.devices?.forEach(i => {
        for (const key of Object.keys(i.dpMapping ?? {})) {
          if (i.dpMapping![key] < 1) {
            delete i.dpMapping![key];
          }
        }
      });
    }
    if (commonConfig) {
      if (!commonConfig.debug) {
        commonConfig.debugLevel = undefined;
      }
    }
    return clonedConfig;
  }

  private diffConfig(a: any, b: any, path = ''): string[] {
    const changes: string[] = [];

    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const fullPath = path ? `${path}.${key}` : key;

      if (Object.hasOwn(a, key) && Object.hasOwn(b, key)) {
        if (typeof a[key] === 'object' && typeof b[key] === 'object') {
          changes.push(...this.diffConfig(a[key], b[key], fullPath));
        } else if (a[key] !== b[key]) {
          const left = JSON.stringify(a[key]);
          const right = JSON.stringify(b[key]);
          changes.push(`${fullPath}: ${left} -> ${right}`);
        }
      } else {
        if (Object.hasOwn(a, key)) {
          const left = JSON.stringify(a[key]);
          const right = '<<ignored>>';
          changes.push(`${fullPath}: ${left} -> ${right}`);
        } else {
          if (b[key] !== undefined) {
            const left = '<<undefined>>';
            const right = JSON.stringify(b[key]);
            changes.push(`${fullPath}: ${left} -> ${right}`);
          }
        }
      }
    }
    return changes;
  }
}