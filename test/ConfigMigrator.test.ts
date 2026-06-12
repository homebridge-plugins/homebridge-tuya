import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import ConfigMigrator from '../src/shared/util/ConfigMigrator';
import { CommonConfig, TuyaPlatformHomeConfig, TuyaPluginMode } from '../src/config';
import { ExLogger, initLogger } from '../src/shared/util/Logger';

// モック用のダミーロガー
const mockInfo = jest.fn();

// Mock Logger
const mockLog: ExLogger = {
  debug: jest.fn(),
  info: mockInfo,
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  success: jest.fn(),
} as unknown as ExLogger;

jest.mock('../config.schema.json', () => {
  return {
    schema: {
      properties: {
        mode: { default: 'cloud' },
        name: { default: 'Tuya' },
        options: {
          properties: {
            projectType: { default: '2' },
            appSchema: { default: 'tuyaSmart' },
            generateWeatherAccessory: { default: false },
            weatherAPI: { default: 'Open-Meteo' }
          },
        },
        local: {
          properties: {
            autoDiscoverDevices: { default: true },
            discoverTimeout: { default: 5 },
            rediscoverInterval: { default: 900 },
            devices: { default: [] }
          },
        },
        common: {
            debug: { default: false}
        }
      },
    },
  };
}, { virtual: true });

describe('ConfigMigrator migrate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initLogger(mockLog);
  });

  test('migrate should call logger.info and return config with defaults applied for cloud mode', () => {
    const migrator = new ConfigMigrator();

    const inputConfig = {
      mode: TuyaPluginMode.cloud,
    } as any;

    const result = migrator.migrate(inputConfig);

    expect(mockInfo).toHaveBeenNthCalledWith(1, '[ConfigMigrator] Migrating config...');

    expect(result.mode).toBe(TuyaPluginMode.cloud);

    // cloud
    const cloud = result.cloud as TuyaPlatformHomeConfig;
    const common = result.common as CommonConfig;
    expect(cloud).toBeDefined();
    expect(cloud.projectType).toBe('2');
    expect(cloud.appSchema).toBe('tuyaSmart');
    expect(cloud.generateWeatherAccessory).toBe(false);
    expect(cloud.weatherAPI).toBe('Open-Meteo');
    expect(common.debug).toBe(false);

    // local
    expect(result.local).toBeUndefined();
  });

  test('migrate should apply local defaults when mode is local', () => {
    const migrator = new ConfigMigrator();

    const inputConfig = {
      mode: TuyaPluginMode.local,
      // cloud intentionally provided to ensure it is not overwritten for local-only mode
      cloud: { projectType: '1' },
    } as any;

    const result = migrator.migrate(inputConfig);

    // local defaults applied
    const local = result.local;
    expect(local).toBeDefined();
    expect(local!.autoDiscoverDevices).toBe(true);
    expect(local!.discoverTimeout).toBe(5);
    expect(local!.rediscoverInterval).toBe(900);
    expect(local!.devices).toBeDefined();
    expect(local!.devices).toEqual([]);

    // Unnecessary settings are removed.
    expect(result.cloud).toBeUndefined();
  });

  test('migrate should apply both cloud and local defaults when mode is both', () => {
    const migrator = new ConfigMigrator();

    const inputConfig = {
      mode: TuyaPluginMode.both,
      // partially provided cloud/local to ensure merging with defaults
      cloud: { projectType: '2', generateWeatherAccessory: true, accessId: 'testID', accessKey: 'testKey' },
      local: { autoDiscoverDevices: true, discoverTimeout: 10 },
    } as any;

    const result = migrator.migrate(inputConfig);

    // cloud: retries preserved, timeout default applied
    const cloud = result.cloud as TuyaPlatformHomeConfig;
    const common = result.common as CommonConfig;
    expect(cloud).toBeDefined();
    expect(cloud.projectType).toBe('2');
    expect(cloud.appSchema).toBe('tuyaSmart');
    expect(cloud.generateWeatherAccessory).toBe(true);
    expect(cloud.weatherAPI).toBe('Open-Meteo');
    expect(common.debug).toBe(false);
    expect(cloud.accessId).toBe('testID');
    expect(cloud.accessKey).toBe('testKey');

    // local: port preserved, retryInterval default applied
    const local = result.local;
    expect(local).toBeDefined();
    expect(local!.autoDiscoverDevices).toBe(true);
    expect(local!.discoverTimeout).toBe(10);
    expect(local!.rediscoverInterval).toBe(900);
    expect(local!.devices).toBeDefined();
    expect(local!.devices).toEqual([]);
  });

  test('migrate should transform device schema oldCode -> code and set newCode', () => {
    const migrator = new ConfigMigrator();

    const deviceOverride = {
      id: 'dev1',
      schema: [
        { code: 'currentCode', oldCode: 'legacyCode', name: 'switch' },
        { code: 'onlyCurrent', name: 'sensor' },
      ],
    } as any;

    const inputConfig = {
      mode: TuyaPluginMode.cloud,
      cloud: {
        deviceOverrides: [deviceOverride],
      },
    } as any;

    const result = migrator.migrate(inputConfig);

    // deviceOverrides
    expect(result.cloud?.deviceOverrides).toBeDefined();
    const migrated = result.cloud?.deviceOverrides![0];

    // For the first schema item, replace code using oldCode and store the original code in newCode.
    const first = migrated?.schema![0];
    expect(first!.code).toBe('legacyCode'); // oldCode が code に移動
    expect(first!.newCode).toBe('currentCode'); // 元の code が newCode に保存
    expect((first as any)['oldCode']).toBeUndefined();

    // The second schema item remains unchanged.
    const second = migrated?.schema![1];
    expect(second!.code).toBe('onlyCurrent');
    expect(second!.newCode).toBeUndefined();
  });

  test('migrate old schema with options to cloud and etc. (config.schema.json v2.x -> v3.x)', () => {
    const migrator = new ConfigMigrator();

    const v2config = {
      name: 'Tuya',
      options: {
        projectType: '2',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: 'Open-Meteo',
        deviceOverrides: [],
        debug: false
      }
    } as any;

    const v3config = {
      mode: TuyaPluginMode.cloud,
      name: 'Tuya',
      cloud: {
        projectType: '2',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: 'Open-Meteo',
        deviceOverrides: []
      },
      common: {
        debug: false
      }
    } as any;

    const newConfig = migrator.migrate(v2config);

    expect(newConfig).toEqual(v3config);
  });

  test('priority v3.x settings > v2.x settings', () => {
    const migrator = new ConfigMigrator();

    const mixConfig = {
      mode: TuyaPluginMode.cloud,
      name: 'Tuya',
      options: {
        projectType: '2',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: 'Open-Meteo',
        deviceOverrides: [ { id: 'old' } ],
        debug: true,
        debugLevel: 'api'
      },
      cloud: {
        projectType: '2',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: 'Open-Meteo',
        deviceOverrides: [ { id: 'new', schema: [] } ]
      },
      common: {
        debug: false,
        debugLevel: undefined
      }
    } as any;

    const v3config = {
      mode: TuyaPluginMode.cloud,
      name: 'Tuya',
      cloud: {
        projectType: '2',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: 'Open-Meteo',
        deviceOverrides: [ { id: 'new', schema: [] } ]
      },
      common: {
        debug: false,
        debugLevel: undefined
      }
    } as any;

    const newConfig = migrator.migrate(mixConfig);

    expect(newConfig).toEqual(v3config);
  });

  test('Separated configuration options for local mode and cloud mode.', () => {
    const migrator = new ConfigMigrator();

    const bothConfig = {
      mode: TuyaPluginMode.both,
      name: 'Tuya',
      cloud: {
        projectType: '2',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: 'Open-Meteo',
        deviceOverrides: [
          { id: 'cloudID', schema: [], configFor: 'cloud' },
          { id: 'localID', schema: [], configFor: 'local' },
          { id: 'bothID',  schema: [], configFor: 'both' },
          { id: 'undefinedID', schema: [] }
        ]
      },
      local: {
        autoDiscoverDevices: false,
        devices: [ { tuyaDeviceId: 'localID', name: 'test name' } ],
        discoverTimeout: 1,
        rediscoverInterval: 100,
      },
      common: {
        debug: false
      }
    } as any;

    const expected = {
      mode: TuyaPluginMode.both,
      name: 'Tuya',
      cloud: {
        projectType: '2',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: 'Open-Meteo',
        deviceOverrides: [
          { id: 'cloudID', schema: [], configFor: 'cloud' },
          { id: 'bothID', schema: [],  configFor: 'both' },
          { id: 'undefinedID', schema: [] }
        ]
      },
      local: {
        autoDiscoverDevices: false,
        devices: [ { tuyaDeviceId: 'localID', name: 'test name' } ],
        discoverTimeout: 1,
        rediscoverInterval: 100,
        deviceOverrides: [
          { id: 'localID', schema: [], configFor: 'local' },
          { id: 'bothID', schema: [],  configFor: 'both' },
        ]
      },
      common: {
        debug: false
      }
    } as any;

    const newConfig = migrator.migrate(bothConfig);

    expect(newConfig).toEqual(expected);
  });

  test('no migration', () => {
    const migrator = new ConfigMigrator();

    const config = {
      mode: TuyaPluginMode.cloud,
      name: 'Tuya',
      cloud: {
        projectType: '2',
        appSchema: 'tuyaSmart',
        generateWeatherAccessory: false,
        weatherAPI: 'Open-Meteo',
        deviceOverrides: []
      },
      common: {
        debug: true,
        debugLevel: 'api'
      }
    } as any;

    const newConfig = migrator.migrate(config);

    expect(newConfig).toEqual(config);
  });

  describe('ConfigMigrator extractDefaultConfig', () => {
    test('schema without properties', () => {
      const migrator = new ConfigMigrator();
      const schema = {}

      const result = migrator['extractDefaultConfig'](schema);
      expect(result).toEqual(schema);
    });
  });

  describe('ConfigMigrator normalizeConfig', () => {
    test('sanitize names', () => {
      const migrator = new ConfigMigrator();
      const inputConfig = {
        cloud: {
          serviceInformationOverrides: [ { configuredName: 'test_configuredname' } ]
        },
        local: {
          devices: [ { name: 'test-name' } ]
        }
      };
      const outputConfig = {
        cloud: {
          serviceInformationOverrides: [ { configuredName: 'test configuredname' } ]
        },
        local: {
          devices: [ { name: 'test name' } ]
        }
      };
      

      const result = migrator['normalizeConfig'](inputConfig as any);
      expect(result).toEqual(outputConfig);
    });
  });

  describe('ConfigMigrator cleanupConfig', () => {
    test('remove config with undefined device id', () => {
      const migrator = new ConfigMigrator();
      const inputConfig = {
        cloud: {
          deviceOverrides: [ {  } ]
        },
        local: {
          devices: [ {  } ]
        }
      };
      const outputConfig = {
        cloud: {
          deviceOverrides: []
        },
        local: {
          devices: []
        }
      };

      const result = migrator['cleanupConfig'](inputConfig as any);
      expect(result).toEqual(outputConfig);
    });

    test('undefined device list will be initialized with an empty list.', () => {
      const migrator = new ConfigMigrator();
      const inputConfig = {
        cloud: {
        },
        local: {
        }
      };
      const outputConfig = {
        cloud: {
          deviceOverrides: []
        },
        local: {
          devices: []
        }
      };

      const result = migrator['cleanupConfig'](inputConfig as any);
      expect(result).toEqual(outputConfig);
    });

    test('delete bad ip.', () => {
      const migrator = new ConfigMigrator();
      const inputConfig = {
        local: {
          devices: [
            { tuyaDeviceId: 'tuyaDeviceId1', ip: '192.168.0.1' },
            { tuyaDeviceId: 'tuyaDeviceId2', ip: 'fe80::213:72ff:fe37:7f6e' },
            { tuyaDeviceId: 'tuyaDeviceId3', ip: '192.168.1' },
            { tuyaDeviceId: 'tuyaDeviceId4', ip: 'fe80::213::72ff:fe37:7f6e' },
          ]
        }
      };
      const outputConfig = {
        local: {
          devices: [
            { tuyaDeviceId: 'tuyaDeviceId1', ip: '192.168.0.1' },
            { tuyaDeviceId: 'tuyaDeviceId2', ip: 'fe80::213:72ff:fe37:7f6e' },
            { tuyaDeviceId: 'tuyaDeviceId3', ip: undefined },
            { tuyaDeviceId: 'tuyaDeviceId4', ip: undefined },
          ]
        }
      };

      const result = migrator['cleanupConfig'](inputConfig as any);
      expect(result).toEqual(outputConfig);
    });

    test('delete unused debugLevel', () => {
      const migrator = new ConfigMigrator();
      const inputConfig = {
        common: {
          debug: false,
          debugLevel: 'api'
        }
      };
      const outputConfig = {
        common: {
          debug: false,
          debugLevel: undefined
        }
      };

      const result = migrator['cleanupConfig'](inputConfig as any);
      expect(result).toEqual(outputConfig);
    });

    test('initialize undefined device schema', () => {
      const migrator = new ConfigMigrator();
      const inputConfig = {
        cloud: {
          deviceOverrides: [
            {
              id: 'cloudid1',
            }
          ]
        },
        local: {
          devices: [],
          deviceOverrides: [
            {
              id: 'localid1',
            }
          ]
        }
      };
      const outputConfig = {
        cloud: {
          deviceOverrides: [
            {
              id: 'cloudid1',
              schema: []
            }
          ]
        },
        local: {
          devices: [],
          deviceOverrides: [
            {
              id: 'localid1',
              schema: []
            }
          ]
        }
      };

      const result = migrator['cleanupConfig'](inputConfig as any);
      expect(result).toEqual(outputConfig);
    });

    test('remove device schema with undefined dp code', () => {
      const migrator = new ConfigMigrator();
      const inputConfig = {
        cloud: {
          deviceOverrides: [
            {
              id: 'cloudid1',
              schema: [
                { code: 'code1' },
                { newCode: 'newcode1' },
                {},
              ]
            }
          ]
        },
        local: {
          devices: [],
          deviceOverrides: [
            {
              id: 'localid1',
              schema: [
                { code: 'code2' },
                { newCode: 'newcode2' },
                {},
              ]
            }
          ]
        }
      };
      const outputConfig = {
        cloud: {
          deviceOverrides: [
            {
              id: 'cloudid1',
              schema: [
                { code: 'code1' },
              ]
            }
          ]
        },
        local: {
          devices: [],
          deviceOverrides: [
            {
              id: 'localid1',
              schema: [
                { code: 'code2' },
              ]
            }
          ]
        }
      };

      const result = migrator['cleanupConfig'](inputConfig as any);
      expect(result).toEqual(outputConfig);
    });
  });
    
  describe('ConfigMigrator diffConfig', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('no difference. same values, same order.', () => {
      const migrator = new ConfigMigrator();

      const left = {
        prop1: 'value1',
        prop2: {
          prop2_1: 'value2_1',
          prop2_2: {
            prop2_2_1: 'value2_2_1',
            prop2_2_2: 'value2_2_2',
            prop2_2_3: 'value2_2_3',
          },
          prop2_3: 'value2_3',
        },
        prop3: 'value3',
      };
      const right = {
        prop1: 'value1',
        prop2: {
          prop2_1: 'value2_1',
          prop2_2: {
            prop2_2_1: 'value2_2_1',
            prop2_2_2: 'value2_2_2',
            prop2_2_3: 'value2_2_3',
          },
          prop2_3: 'value2_3',
        },
        prop3: 'value3',
      };
      const result = migrator['diffConfig'](left, right);
      expect(result.length).toBe(0);
    });

    test('no difference. same values, different order.', () => {
      const migrator = new ConfigMigrator();

      const left = {
        prop1: 'value1',
        prop2: {
          prop2_1: 'value2_1',
          prop2_2: {
            prop2_2_1: 'value2_2_1',
            prop2_2_2: 'value2_2_2',
            prop2_2_3: 'value2_2_3',
          },
          prop2_3: 'value2_3',
        },
        prop3: 'value3',
      };
      const right = {
        prop2: {
          prop2_2: {
            prop2_2_2: 'value2_2_2',
            prop2_2_3: 'value2_2_3',
            prop2_2_1: 'value2_2_1',
          },
          prop2_3: 'value2_3',
          prop2_1: 'value2_1',
        },
        prop3: 'value3',
        prop1: 'value1',
      };
      const result = migrator['diffConfig'](left, right);
      expect(result.length).toBe(0);
    });

    test('different values.', () => {
      const migrator = new ConfigMigrator();

      const left = {
        prop1: 'value1',
        prop2: {
          prop2_1: 'value2_1',
          prop2_2: {
            prop2_2_1: 'value2_2_1',
            prop2_2_2: 'value2_2_2',
            prop2_2_3: 'value2_2_3',
          },
          prop2_3: 'value2_3',
        },
        prop3: 'value3',
      };
      const right = {
        prop1: 'value1_diff',
        prop2: {
          prop2_1: null,
          prop2_2: {
            prop2_2_1: undefined,
            prop2_2_2: 'value2_2_2',
            prop2_2_3: 'value2_2_3',
          },
          prop2_3: 'value2_3',
        },
        prop3: 'value3',
      };
      const result = migrator['diffConfig'](left, right);
      expect(result.length).toBe(3);
      expect(result[0]).toBe("prop1: \"value1\" -> \"value1_diff\"");
      expect(result[1]).toBe("prop2.prop2_1: \"value2_1\" -> null");
      expect(result[2]).toBe("prop2.prop2_2.prop2_2_1: \"value2_2_1\" -> undefined");
    });

    test('different object.', () => {
      const migrator = new ConfigMigrator();

      const left = {
        prop1: 'value1',
        prop2: {
          prop2_1: 'value2_1',
          prop2_2: {
            prop2_2_1: 'value2_2_1',
            prop2_2_2: 'value2_2_2',
            prop2_2_3: 'value2_2_3',
          },
          prop2_3: 'value2_3',
        },
        prop3: 'value3',
      };
      const right = {
        prop1: { prop1_1: 'value1_1' },
        prop2: {
          prop2_1: 'value2_1',
          prop2_2: 'value2_2',
          prop2_3: 'value2_3',
        },
        prop3: 'value3',
      };
      const result = migrator['diffConfig'](left, right);
      expect(result.length).toBe(2);
      expect(result[0]).toBe("prop1: \"value1\" -> {\"prop1_1\":\"value1_1\"}");
      expect(result[1]).toBe("prop2.prop2_2: {\"prop2_2_1\":\"value2_2_1\",\"prop2_2_2\":\"value2_2_2\",\"prop2_2_3\":\"value2_2_3\"} -> \"value2_2\"");
    });

    test('property added.', () => {
      const migrator = new ConfigMigrator();

      const left = {
        prop1: 'value1',
        prop2: {
          prop2_1: 'value2_1',
          prop2_2: {
            prop2_2_1: 'value2_2_1',
            prop2_2_2: 'value2_2_2',
            prop2_2_3: 'value2_2_3',
          },
          prop2_3: 'value2_3',
        },
        prop3: 'value3',
      };
      const right = {
        prop1: 'value1',
        prop2: {
          prop2_1: 'value2_1',
          prop2_2: {
            prop2_2_1: 'value2_2_1',
            prop2_2_2: 'value2_2_2',
            prop2_2_3: 'value2_2_3',
            prop2_2_4: 'value2_2_4',
          },
          prop2_3: 'value2_3',
          prop2_4: 'value2_4',
        },
        prop3: 'value3',
        prop4: 'value4',
      };
      const result = migrator['diffConfig'](left, right);
      expect(result.length).toBe(3);
      expect(result[0]).toBe("prop2.prop2_2.prop2_2_4: <<undefined>> -> \"value2_2_4\"");
      expect(result[1]).toBe("prop2.prop2_4: <<undefined>> -> \"value2_4\"");
      expect(result[2]).toBe("prop4: <<undefined>> -> \"value4\"");
    });

    test('property deleted.', () => {
      const migrator = new ConfigMigrator();

      const left = {
        prop1: 'value1',
        prop2: {
          prop2_1: 'value2_1',
          prop2_2: {
            prop2_2_1: 'value2_2_1',
            prop2_2_2: 'value2_2_2',
            prop2_2_3: 'value2_2_3',
          },
          prop2_3: 'value2_3',
        },
        prop3: 'value3',
      };
      const right = {
        prop1: 'value1',
        prop2: {
          prop2_1: 'value2_1',
          prop2_2: {
            prop2_2_1: 'value2_2_1',
            prop2_2_2: 'value2_2_2',
          },
        },
      };
      const result = migrator['diffConfig'](left, right);
      expect(result.length).toBe(3);
      expect(result[0]).toBe("prop2.prop2_2.prop2_2_3: \"value2_2_3\" -> <<ignored>>");
      expect(result[1]).toBe("prop2.prop2_3: \"value2_3\" -> <<ignored>>");
      expect(result[2]).toBe("prop3: \"value3\" -> <<ignored>>");
    });

    test('undefined property on the right hand will be ignored.', () => {
      const migrator = new ConfigMigrator();

      const left = {
      };

      const right = {
        prop1: undefined
      };
      const result = migrator['diffConfig'](left, right);
      expect(result).toEqual([]);
    });

  });
});
