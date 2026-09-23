import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import AirConditionerAccessory from '../src/shared/accessory/AirConditionerAccessory';
import TuyaDevice, { TuyaDeviceSchema, TuyaDeviceStatus, TuyaDeviceSchemaMode, TuyaDeviceSchemaType } from '../src/cloud/device/TuyaDevice';
import { ExLogger, initLogger } from '../src/shared/util/Logger';

// Mock Logger
const mockLog: ExLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  success: jest.fn(),
} as unknown as ExLogger;

// Mock data
const mockSchema = (code: string, type: string, mode: string, property: any): TuyaDeviceSchema => ({
  code,
  mode: mode as TuyaDeviceSchemaMode,
  type: type as TuyaDeviceSchemaType,
  property,
});

const mockStatus = (code: string, value: string | number | boolean): TuyaDeviceStatus => ({
  code,
  value,
});

// Create mock device with AC capabilities
const createMockDevice = (overrides?: Partial<TuyaDevice>): TuyaDevice => {
  const device = new TuyaDevice({
    id: 'test-device-001',
    uuid: 'uuid-001',
    name: 'Test Air Conditioner',
    online: true,
    owner_id: 'home-001',
    product_id: 'ac-product-001',
    product_name: 'Smart Air Conditioner',
    model: 'AC-2024',
    icon: 'ac.png',
    category: 'ac',
    schema: [
      mockSchema('switch', 'Boolean', 'rw', {}),
      mockSchema('mode', 'Enum', 'rw', { range: ['auto', 'cold', 'hot', 'wet', 'wind'] }),
      mockSchema('work_status', 'Enum', 'ro', { range: ['heating', 'cooling', 'idle'] }),
      mockSchema('temp_current', 'Integer', 'ro', { min: 0, max: 100, scale: 0, step: 1, unit: '°C' }),
      mockSchema('temp_set', 'Integer', 'rw', { min: 16, max: 30, scale: 0, step: 1, unit: '°C' }),
      mockSchema('fan_speed_enum', 'Enum', 'rw', { range: ['auto', 'low', 'middle', 'high'] }),
      mockSchema('lock', 'Boolean', 'rw', {}),
      mockSchema('humidity_current', 'Integer', 'ro', { min: 0, max: 100, scale: 0, step: 1, unit: '%' }),
      mockSchema('humidity_set', 'Integer', 'rw', { min: 30, max: 80, scale: 0, step: 1, unit: '%' }),
      mockSchema('temp_unit_convert', 'Enum', 'rw', { range: ['C', 'F'] }),
    ],
    status: [
      mockStatus('switch', true),
      mockStatus('mode', 'cold'),
      mockStatus('work_status', 'cooling'),
      mockStatus('temp_current', 24),
      mockStatus('temp_set', 22),
      mockStatus('fan_speed_enum', 'auto'),
      mockStatus('lock', false),
      mockStatus('humidity_current', 60),
      mockStatus('humidity_set', 60),
      mockStatus('temp_unit_convert', 'C'),
    ],
    sub: false,
    ...overrides,
  });
  return device;
};

// Create mock platform
const createMockPlatform = (): any => {
  // Mock the HAP objects needed by the accessory
  const MockService = {
    HeaterCooler: 'HeaterCooler',
    HumidifierDehumidifier: 'HumidifierDehumidifier',
    Fanv2: 'Fanv2',
    AccessoryInformation: 'AccessoryInformation',
    Battery: 'Battery',
  };

  const MockCharacteristic = {
    Active: { ACTIVE: 1, INACTIVE: 0 },
    CurrentHeaterCoolerState: { INACTIVE: 0, HEATING: 1, COOLING: 2 },
    TargetHeaterCoolerState: { AUTO: 0, HEAT: 1, COOL: 2 },
    CurrentHumidifierDehumidifierState: { DEHUMIDIFYING: 2 },
    TargetHumidifierDehumidifierState: { DEHUMIDIFIER: 2 },
    CurrentRelativeHumidity: 'CurrentRelativeHumidity',
    RelativeHumidityDehumidifierThreshold: 'RelativeHumidityDehumidifierThreshold',
    CurrentTemperature: 'CurrentTemperature',
    CoolingThresholdTemperature: 'CoolingThresholdTemperature',
    HeatingThresholdTemperature: 'HeatingThresholdTemperature',
    RotationSpeed: 'RotationSpeed',
    LockPhysicalControls: 'LockPhysicalControls',
    Manufacturer: 'Manufacturer',
    Model: 'Model',
    Name: 'Name',
    ConfiguredName: 'ConfiguredName',
    SerialNumber: 'SerialNumber',
    StatusLowBattery: { BATTERY_LEVEL_NORMAL: 0, BATTERY_LEVEL_LOW: 1 },
    BatteryLevel: 'BatteryLevel',
    ChargingState: { NOT_CHARGING: 0, CHARGING: 1 },
    StatusActive: 'StatusActive',
    ProgrammableSwitchEvent: { UUID: 'ProgrammableSwitchEvent' },
    TemperatureDisplayUnits: { CELSIUS: 0, FAHRENHEIT: 1 },
  };

  return {
    api: {
      hap: {
        Service: MockService,
        Characteristic: MockCharacteristic,
        HapStatusError: class HapStatusError extends Error {
          constructor(public status: number) {
            super();
          }
        },
        HAPStatus: {
          SERVICE_COMMUNICATION_FAILURE: 72,
        },
      },
    },
    deviceManager: {
      getDevice: jest.fn(),
      getDeviceSchemaConfig: jest.fn(),
      sendCommands: jest.fn(),
    },
    options: {
      debug: false,
      debugLevel: '',
    }
  };
};

// Services created with a subtype, keyed as `${serviceUUID}:${subtype}`
const subtypeServices = new Map<string, any>();

// Create mock accessory
const createMockAccessory = (): any => ({
  context: { deviceID: 'test-device-001' },
  displayName: 'Test Air Conditioner',
  services: [],
  getService: jest.fn(),
  // Real PlatformAccessory exposes these too; services with a subtype are looked up
  // and removed through them.
  getServiceById: jest.fn(),
  addService: jest.fn(),
  removeService: jest.fn(),
});

const createMockCharacteristic = () => {
  const characteristic: any = {
    getHandler: undefined as any,
    setHandler: undefined as any,
    onGet: jest.fn().mockImplementation(function (fn: any) {
      characteristic.getHandler = fn;
      return characteristic;
    }),
    onSet: jest.fn().mockImplementation(function (fn: any) {
      characteristic.setHandler = fn;
      return characteristic;
    }),
    updateValue: jest.fn().mockReturnThis(),
    setProps: jest.fn().mockReturnThis(),
  };
  return characteristic;
};

const createMockService = () => {
  const characteristics = new Map<string, any>();
  const getCharacteristic = jest.fn((key: any) => {
    const keyName = typeof key === 'string' ? key : JSON.stringify(key);
    if (!characteristics.has(keyName)) {
      characteristics.set(keyName, createMockCharacteristic());
    }
    return characteristics.get(keyName);
  });
  return {
    getCharacteristic,
    setCharacteristic: jest.fn().mockReturnThis(),
    addOptionalCharacteristic: jest.fn(),
    testCharacteristic: jest.fn(() => false),
    characteristics,
  };
};

describe('AirConditionerAccessory', () => {
  let platform: any;
  let accessory: any;
  let device: TuyaDevice;
  let airConditionerAccessory: AirConditionerAccessory;

  beforeEach(() => {
    initLogger(mockLog);
    platform = createMockPlatform();
    accessory = createMockAccessory();
    device = createMockDevice();

    platform.deviceManager.getDevice.mockReturnValue(device);
    platform.deviceManager.getDeviceSchemaConfig.mockReturnValue(undefined);

    // Setup mock services and characteristics
    const mockHeaterCoolerService = {
      getCharacteristic: jest.fn(),
      setCharacteristic: jest.fn().mockReturnThis(),
      addOptionalCharacteristic: jest.fn(),
      testCharacteristic: jest.fn(() => false),
    };

    const mockHumidifierService = {
      getCharacteristic: jest.fn(),
      setCharacteristic: jest.fn().mockReturnThis(),
      addOptionalCharacteristic: jest.fn(),
      testCharacteristic: jest.fn(() => false),
    };

    const mockFanService = {
      getCharacteristic: jest.fn(),
      setCharacteristic: jest.fn().mockReturnThis(),
      addOptionalCharacteristic: jest.fn(),
      testCharacteristic: jest.fn(() => false),
    };

    const mockAccessoryInformationService = {
      setCharacteristic: jest.fn().mockReturnThis(),
      getCharacteristic: jest.fn(),
    };

    const mockBatteryService = {
      getCharacteristic: jest.fn(),
      setCharacteristic: jest.fn().mockReturnThis(),
    };

    // Create a service map for easier mocking
    const serviceMap: any = {
      'HeaterCooler': mockHeaterCoolerService,
      'HumidifierDehumidifier': mockHumidifierService,
      'Fanv2': mockFanService,
      'AccessoryInformation': mockAccessoryInformationService,
      'Battery': mockBatteryService,
    };

    // Tracks services created with a subtype, so getServiceById can resolve them
    subtypeServices.clear();

    // Both getService and addService should return the same mock services
    accessory.getService.mockImplementation((serviceType: any) => {
      const serviceName = typeof serviceType === 'string' ? serviceType : serviceType?.UUID;
      return serviceMap[serviceName] || mockAccessoryInformationService; // Default to AccessoryInformation
    });

    accessory.addService.mockImplementation((serviceType: any, ...args: any[]) => {
      const serviceName = typeof serviceType === 'string' ? serviceType : serviceType?.UUID;
      const created = serviceMap[serviceName] || mockAccessoryInformationService;
      // args = [displayName, subtype]; remember the subtype so getServiceById finds it
      if (args.length > 1) {
        subtypeServices.set(`${serviceName}:${args[1]}`, created);
      }
      return created;
    });

    accessory.getServiceById.mockImplementation((serviceType: any, subtype: string) => {
      const serviceName = typeof serviceType === 'string' ? serviceType : serviceType?.UUID;
      return subtypeServices.get(`${serviceName}:${subtype}`);
    });

    accessory.removeService.mockImplementation((service: any) => {
      for (const [key, value] of subtypeServices.entries()) {
        if (value === service) {
          subtypeServices.delete(key);
        }
      }
    });

    // Mock characteristic getters
    const mockCharacteristic = {
      onGet: jest.fn().mockReturnThis(),
      onSet: jest.fn().mockReturnThis(),
      updateValue: jest.fn().mockReturnThis(),
      setProps: jest.fn().mockReturnThis(),
    };

    mockHeaterCoolerService.getCharacteristic.mockReturnValue(mockCharacteristic);
    mockHumidifierService.getCharacteristic.mockReturnValue(mockCharacteristic);
    mockFanService.getCharacteristic.mockReturnValue(mockCharacteristic);
    mockAccessoryInformationService.getCharacteristic.mockReturnValue(mockCharacteristic);
    mockBatteryService.getCharacteristic.mockReturnValue(mockCharacteristic);

    // Store the service map for testing
    (accessory as any).serviceMap = serviceMap;

    airConditionerAccessory = new AirConditionerAccessory(platform, accessory);
  });

  describe('requiredSchema', () => {
    test('should return required schema codes for AC', () => {
      const required = airConditionerAccessory.requiredSchema();
      expect(required).toBeDefined();
      expect(Array.isArray(required)).toBe(true);
      expect(required.length).toBeGreaterThan(0);
    });

    test('should include switch, mode, work_status, and temp_current', () => {
      const required = airConditionerAccessory.requiredSchema();
      expect(required).toContainEqual(['switch', 'switch_1']);
      expect(required).toContainEqual(['mode']);
    });
  });

  describe('configureServices', () => {
    test('should configure all three services (AC, Dehumidifier, Fan)', () => {
      // Reset the mock to track new calls during configureServices
      jest.clearAllMocks();
      
      airConditionerAccessory.configureServices();

      // Check that services are being configured (getService/addService will be called)
      expect(accessory.getService).toHaveBeenCalled();
    });

    test('should configure main HeaterCooler service', () => {
      airConditionerAccessory.configureServices();

      const mainService = accessory.getService('HeaterCooler');
      expect(mainService).toBeDefined();
    });
  });

  describe('configureAirConditioner', () => {
    test('should setup Active characteristic handlers', () => {
      const mockService = {
        getCharacteristic: jest.fn(),
        setCharacteristic: jest.fn(),
      };

      jest.spyOn(airConditionerAccessory, 'mainService').mockReturnValue(mockService as any);

      const mockCharacteristic = {
        onGet: jest.fn().mockReturnThis(),
        onSet: jest.fn().mockReturnThis(),
        updateValue: jest.fn().mockReturnThis(),
        setProps: jest.fn().mockReturnThis(),
      };

      mockService.getCharacteristic.mockReturnValue(mockCharacteristic);

      airConditionerAccessory.configureAirConditioner();

      expect(mockService.getCharacteristic).toHaveBeenCalled();
    });

    test('should handle Active get returns ACTIVE when device is on and in AC mode', async () => {
      device.status = [
        mockStatus('switch', true),
        mockStatus('mode', 'cold'),
        mockStatus('work_status', 'cooling'),
        mockStatus('temp_current', 24),
        mockStatus('temp_set', 22),
        mockStatus('fan_speed_enum', 'auto'),
        mockStatus('lock', false),
        mockStatus('humidity_current', 60),
        mockStatus('humidity_set', 60),
        mockStatus('temp_unit_convert', 'C'),
      ];

      const activeStatus = airConditionerAccessory.getStatus('switch');
      const modeStatus = airConditionerAccessory.getStatus('mode');

      expect(activeStatus?.value).toBe(true);
      expect(modeStatus?.value).toBe('cold');
    });

    test('should handle Active get returns INACTIVE when device is off', () => {
      device.status[0] = mockStatus('switch', false); // Turn off

      const activeStatus = airConditionerAccessory.getStatus('switch');
      expect(activeStatus?.value).toBe(false);
    });
  });

  describe('configureDehumidifier', () => {
    test('should configure dehumidifier service when mode includes wet', () => {
      const mockService = {
        getCharacteristic: jest.fn(),
        setCharacteristic: jest.fn(),
      };

      jest.spyOn(airConditionerAccessory, 'dehumidifierService').mockReturnValue(mockService as any);

      const mockCharacteristic = {
        onGet: jest.fn().mockReturnThis(),
        onSet: jest.fn().mockReturnThis(),
        updateValue: jest.fn().mockReturnThis(),
        setProps: jest.fn().mockReturnThis(),
      };

      mockService.getCharacteristic.mockReturnValue(mockCharacteristic);

      airConditionerAccessory.configureDehumidifier();

      expect(mockService.getCharacteristic).toHaveBeenCalled();
    });

    test('should not configure dehumidifier when mode does not include wet', () => {
      const deviceWithoutWet = createMockDevice({
        schema: [
          mockSchema('switch', 'Boolean', 'rw', {}),
          mockSchema('mode', 'Enum', 'rw', { range: ['auto', 'cold', 'hot'] }),
        ],
      });
      platform.deviceManager.getDevice.mockReturnValue(deviceWithoutWet);

      const ac = new AirConditionerAccessory(platform, accessory);
      const mockService = {
        getCharacteristic: jest.fn(),
        setCharacteristic: jest.fn(),
      };

      jest.spyOn(ac, 'dehumidifierService').mockReturnValue(mockService as any);

      ac.configureDehumidifier();

      // Should not configure if wet mode is not available
      expect(mockService.getCharacteristic).not.toHaveBeenCalled();
    });
  });

  describe('configureFan', () => {
    test('should configure fan service when mode includes wind', () => {
      const mockService = {
        getCharacteristic: jest.fn(),
        setCharacteristic: jest.fn(),
      };

      jest.spyOn(airConditionerAccessory, 'fanService').mockReturnValue(mockService as any);

      const mockCharacteristic = {
        onGet: jest.fn().mockReturnThis(),
        onSet: jest.fn().mockReturnThis(),
        updateValue: jest.fn().mockReturnThis(),
        setProps: jest.fn().mockReturnThis(),
      };

      mockService.getCharacteristic.mockReturnValue(mockCharacteristic);

      airConditionerAccessory.configureFan();

      expect(mockService.getCharacteristic).toHaveBeenCalled();
    });

    test('should not configure fan when mode does not include wind', () => {
      const deviceWithoutWind = createMockDevice({
        schema: [
          mockSchema('switch', 'Boolean', 'rw', {}),
          mockSchema('mode', 'Enum', 'rw', { range: ['auto', 'cold', 'hot'] }),
        ],
      });
      platform.deviceManager.getDevice.mockReturnValue(deviceWithoutWind);

      const ac = new AirConditionerAccessory(platform, accessory);
      const mockService = {
        getCharacteristic: jest.fn(),
        setCharacteristic: jest.fn(),
      };

      jest.spyOn(ac, 'fanService').mockReturnValue(mockService as any);

      ac.configureFan();

      // Should not configure if wind mode is not available
      expect(mockService.getCharacteristic).not.toHaveBeenCalled();
    });
  });

  describe('Characteristic handlers', () => {
    test('HeaterCooler Active onGet/onSet should reflect AC active state and send commands', async () => {
      const service = createMockService();
      jest.spyOn(airConditionerAccessory, 'mainService').mockReturnValue(service as any);

      airConditionerAccessory.configureAirConditioner();

      const activeChar = service.characteristics.get(JSON.stringify(platform.api.hap.Characteristic.Active));
      expect(activeChar).toBeDefined();
      expect(activeChar.getHandler).toBeDefined();
      expect(activeChar.setHandler).toBeDefined();

      const activeValue = activeChar.getHandler();
      expect(activeValue).toBe(platform.api.hap.Characteristic.Active.ACTIVE);

      jest.useFakeTimers();
      activeChar.setHandler(platform.api.hap.Characteristic.Active.ACTIVE);
      jest.runAllTimers();
      jest.useRealTimers();

      expect(platform.deviceManager.sendCommands).toHaveBeenCalledWith('test-device-001', [{ code: 'switch', value: true }]);
      expect(airConditionerAccessory.getStatus('switch')?.value).toBe(true);
    });

    test('TargetHeaterCoolerState onGet/onSet should map mode values correctly', async () => {
      const service = createMockService();
      jest.spyOn(airConditionerAccessory, 'mainService').mockReturnValue(service as any);

      airConditionerAccessory.configureAirConditioner();

      const targetChar = service.characteristics.get(JSON.stringify(platform.api.hap.Characteristic.TargetHeaterCoolerState));
      expect(targetChar).toBeDefined();
      expect(targetChar.getHandler).toBeDefined();
      expect(targetChar.setHandler).toBeDefined();

      device.status = device.status.map(status => status.code === 'mode' ? mockStatus('mode', 'hot') : status);
      const targetValue = targetChar.getHandler();
      expect(targetValue).toBe(platform.api.hap.Characteristic.TargetHeaterCoolerState.HEAT);

      jest.useFakeTimers();
      targetChar.setHandler(platform.api.hap.Characteristic.TargetHeaterCoolerState.COOL);
      jest.runAllTimers();
      jest.useRealTimers();

      expect(platform.deviceManager.sendCommands).toHaveBeenCalledWith('test-device-001', [{ code: 'mode', value: 'cold' }]);
      expect(airConditionerAccessory.getStatus('mode')?.value).toBe('cold');
    });

    test('CoolingThresholdTemperature onGet/onSet should respect auto mode limits', async () => {
      const service = createMockService();
      jest.spyOn(airConditionerAccessory, 'mainService').mockReturnValue(service as any);
      airConditionerAccessory.configureAirConditioner();

      const temperatureKey = platform.api.hap.Characteristic.CoolingThresholdTemperature;
      const coolingChar = service.getCharacteristic(temperatureKey);
      expect(coolingChar).toBeDefined();
      expect(coolingChar.getHandler).toBeDefined();
      expect(coolingChar.setHandler).toBeDefined();

      device.status = device.status.map(status => status.code === 'mode' ? mockStatus('mode', 'auto') : status);
      const getValue = coolingChar.getHandler();
      expect(getValue).toBe(16);

      jest.useFakeTimers();
      coolingChar.setHandler(18);
      jest.runAllTimers();
      jest.useRealTimers();

      expect(service.getCharacteristic(temperatureKey).updateValue).toHaveBeenCalledWith(16);
      expect(airConditionerAccessory.getStatus('temp_set')?.value).toBe(22);
    });

    test('HeatingThresholdTemperature onGet/onSet should respect auto mode limits', async () => {
      const service = createMockService();
      jest.spyOn(airConditionerAccessory, 'mainService').mockReturnValue(service as any);
      airConditionerAccessory.configureAirConditioner();

      const temperatureKey = platform.api.hap.Characteristic.HeatingThresholdTemperature;
      const heatingChar = service.getCharacteristic(temperatureKey);
      expect(heatingChar).toBeDefined();
      expect(heatingChar.getHandler).toBeDefined();
      expect(heatingChar.setHandler).toBeDefined();

      device.status = device.status.map(status => status.code === 'mode' ? mockStatus('mode', 'auto') : status);
      const getValue = heatingChar.getHandler();
      expect(getValue).toBe(30);

      jest.useFakeTimers();
      heatingChar.setHandler(25);
      jest.runAllTimers();
      jest.useRealTimers();

      expect(service.getCharacteristic(temperatureKey).updateValue).toHaveBeenCalledWith(30);
      expect(airConditionerAccessory.getStatus('temp_set')?.value).toBe(22);
    });

    test('CurrentHeaterCoolerState onGet should return correct operating state', () => {
      const service = createMockService();
      jest.spyOn(airConditionerAccessory, 'mainService').mockReturnValue(service as any);
      airConditionerAccessory.configureAirConditioner();

      const currentStateChar = service.characteristics.get(JSON.stringify(platform.api.hap.Characteristic.CurrentHeaterCoolerState));
      expect(currentStateChar).toBeDefined();

      device.status = device.status.map(status => status.code === 'work_status' ? mockStatus('work_status', 'heating') : status);
      expect(currentStateChar.getHandler()).toBe(platform.api.hap.Characteristic.CurrentHeaterCoolerState.HEATING);

      device.status = device.status.map(status => status.code === 'work_status' ? mockStatus('work_status', 'idle') : status);
      expect(currentStateChar.getHandler()).toBe(platform.api.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE);
    });

    test('Dehumidifier Active onGet/onSet should send wet mode commands', async () => {
      const service = createMockService();
      jest.spyOn(airConditionerAccessory, 'dehumidifierService').mockReturnValue(service as any);
      airConditionerAccessory.configureDehumidifier();

      const activeChar = service.characteristics.get(JSON.stringify(platform.api.hap.Characteristic.Active));
      expect(activeChar).toBeDefined();
      expect(activeChar.getHandler).toBeDefined();
      expect(activeChar.setHandler).toBeDefined();

      device.status = device.status.map(status => status.code === 'mode' ? mockStatus('mode', 'wet') : status);
      const activeValue = activeChar.getHandler();
      expect(activeValue).toBe(platform.api.hap.Characteristic.Active.ACTIVE);

      jest.useFakeTimers();
      activeChar.setHandler(platform.api.hap.Characteristic.Active.INACTIVE);
      jest.runAllTimers();
      jest.useRealTimers();

      expect(platform.deviceManager.sendCommands).toHaveBeenCalledWith('test-device-001', [
        { code: 'switch', value: false },
        { code: 'mode', value: 'wet' },
      ]);
      expect(airConditionerAccessory.getStatus('switch')?.value).toBe(false);
    });

    test('Fan Active onGet/onSet should send wind mode commands', async () => {
      const service = createMockService();
      jest.spyOn(airConditionerAccessory, 'fanService').mockReturnValue(service as any);
      airConditionerAccessory.configureFan();

      const activeChar = service.characteristics.get(JSON.stringify(platform.api.hap.Characteristic.Active));
      expect(activeChar).toBeDefined();
      expect(activeChar.getHandler).toBeDefined();
      expect(activeChar.setHandler).toBeDefined();

      device.status = device.status.map(status => status.code === 'mode' ? mockStatus('mode', 'wind') : status);
      const activeValue = activeChar.getHandler();
      expect(activeValue).toBe(platform.api.hap.Characteristic.Active.ACTIVE);

      jest.useFakeTimers();
      activeChar.setHandler(platform.api.hap.Characteristic.Active.ACTIVE);
      jest.runAllTimers();
      jest.useRealTimers();

      expect(platform.deviceManager.sendCommands).toHaveBeenCalledWith('test-device-001', [
        { code: 'switch', value: true },
        { code: 'mode', value: 'wind' },
      ]);
      expect(airConditionerAccessory.getStatus('switch')?.value).toBe(true);
    });
  });

  describe('getSchema', () => {
    test('should return schema for valid code', () => {
      const schema = airConditionerAccessory.getSchema('switch');
      expect(schema).toBeDefined();
      expect(schema?.code).toBe('switch');
    });

    test('should return schema for alternative code names', () => {
      // SCHEMA_CODE.FAN_SPEED_ENUM should map to 'fan_speed_enum'
      const schema = airConditionerAccessory.getSchema('windspeed', 'fan_speed_enum');
      expect(schema).toBeDefined();
      expect(device.schema.some((s) => s.code === 'fan_speed_enum')).toBeTruthy();
      expect(schema?.code).toBe('fan_speed_enum');
    });

    test('should return undefined for non-existent code', () => {
      const schema = airConditionerAccessory.getSchema('non_existent_code');
      expect(schema).toBeUndefined();
    });

    test('should be case-insensitive', () => {
      const schema1 = airConditionerAccessory.getSchema('SWITCH');
      const schema2 = airConditionerAccessory.getSchema('switch');
      expect(schema1?.code).toBe(schema2?.code);
    });
  });

  describe('getStatus', () => {
    test('should return status for valid code', () => {
      const status = airConditionerAccessory.getStatus('switch');
      expect(status).toBeDefined();
      expect(status?.code).toBe('switch');
      expect(status?.value).toBe(true);
    });

    test('should return status for temperature', () => {
      const status = airConditionerAccessory.getStatus('temp_current');
      expect(status?.value).toBe(24);
    });

    test('should return undefined for non-existent code', () => {
      const status = airConditionerAccessory.getStatus('non_existent');
      expect(status).toBeUndefined();
    });
  });

  describe('service methods', () => {
    test('mainService should return HeaterCooler service', () => {
      const service = airConditionerAccessory.mainService();
      expect(service).toBeDefined();
    });

    test('dehumidifierService should return HumidifierDehumidifier service', () => {
      const service = airConditionerAccessory.dehumidifierService();
      expect(service).toBeDefined();
    });

    test('fanService should return Fanv2 service', () => {
      const service = airConditionerAccessory.fanService();
      expect(service).toBeDefined();
    });
  });

  describe('device offline handling', () => {
    test('should update characteristic when device status changes', () => {
      device.status[0] = mockStatus('switch', false);

      const status = airConditionerAccessory.getStatus('switch');
      expect(status?.value).toBe(false);
    });

    test('should handle multiple mode values correctly', () => {
      const modeSchema = airConditionerAccessory.getSchema('mode');
      expect(modeSchema).toBeDefined();
      const property = modeSchema?.property as any;
      expect(property.range).toContain('auto');
      expect(property.range).toContain('cold');
      expect(property.range).toContain('hot');
    });
  });

  describe('temperature configuration', () => {
    test('should have correct temperature range', () => {
      const schema = airConditionerAccessory.getSchema('temp_set');
      expect(schema).toBeDefined();
      const property = schema?.property as any;
      expect(property.min).toBe(16);
      expect(property.max).toBe(30);
    });

    test('should have correct humidity range', () => {
      const schema = airConditionerAccessory.getSchema('humidity_set');
      expect(schema).toBeDefined();
      const property = schema?.property as any;
      expect(property.min).toBe(30);
      expect(property.max).toBe(80);
    });
  });

  describe('mode switching', () => {
    test('should support cold mode', () => {
      device.status[1] = mockStatus('mode', 'cold');
      const status = airConditionerAccessory.getStatus('mode');
      expect(status?.value).toBe('cold');
    });

    test('should support hot mode', () => {
      device.status[1] = mockStatus('mode', 'hot');
      const status = airConditionerAccessory.getStatus('mode');
      expect(status?.value).toBe('hot');
    });

    test('should support auto mode', () => {
      device.status[1] = mockStatus('mode', 'auto');
      const status = airConditionerAccessory.getStatus('mode');
      expect(status?.value).toBe('auto');
    });

    test('should support wet (dehumidifier) mode', () => {
      device.status[1] = mockStatus('mode', 'wet');
      const status = airConditionerAccessory.getStatus('mode');
      expect(status?.value).toBe('wet');
    });

    test('should support wind (fan) mode', () => {
      device.status[1] = mockStatus('mode', 'wind');
      const status = airConditionerAccessory.getStatus('mode');
      expect(status?.value).toBe('wind');
    });
  });
});