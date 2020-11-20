import {
  APIEvent,
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { QingpingAirMonitorAccessory } from './platform-accessory';
import {
  QingpingClient,
  QingpingDeviceInfo,
  QingpingDeviceProductId,
} from './qingping';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

export interface QingpingHomebridgePlatformConfig extends PlatformConfig {
  appKey: string;
  appSecret: string;
  interval?: number;

  temperatureName?: string;
  humidityName?: string;
  co2Name?: string;
  aqiName?: string;
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class QingpingHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap
    .Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  private didFinishLaunching: Promise<void>;
  private handleFinishLaunching?: () => void;

  private client?: QingpingClient;

  public constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.didFinishLaunching = new Promise((resolve) => {
      this.handleFinishLaunching = resolve;
    });
    this.log.debug('Finished initializing platform:', this.config.name);

    this.initialize();

    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      log.debug('Executed didFinishLaunching callback');
      this.handleFinishLaunching?.();
      this.discoverDevices();
    });
  }

  public async initialize() {
    const config = this.config as QingpingHomebridgePlatformConfig;

    try {
      this.log.info(
        `Using the following appKey: ${
          config.appKey
        }, and appSecret: ${config.appSecret.substr(0, 6)}...`,
      );
      const client = new QingpingClient(config.appKey, config.appSecret);
      this.client = client;
      await this.client.updateDevices();
      this.log.info('Initialized');

      setInterval(() => this.client?.updateDevices(), config.interval || 2000);
    } catch (error) {
      this.log.error('Error initializing platform', error?.toString?.());
      this.log.debug(error);
    }
  }

  public configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    const deviceInfo = accessory.context.device.info as QingpingDeviceInfo;
    switch (deviceInfo.product.id) {
      case QingpingDeviceProductId.AirMonitor:
        new QingpingAirMonitorAccessory(this, accessory);
        this.accessories.push(accessory);
        break;

      default:
        this.log.warn('Unsupported accessory:', accessory.displayName);
    }
  }

  public async discoverDevices() {
    this.log.info('Start discovering devices');
    if (!this.client) {
      this.log.info('Client is not ready; skipping discoverDevices()');
      return;
    }

    try {
      await this.client.updateDevices();
      this.log.info('Device list updated');
    } catch (e) {
      this.log.debug(e);
    }

    const availableDevices = this.client.devices.filter((device) =>
      Object.values(QingpingDeviceProductId).includes(
        device?.info?.product?.id,
      ),
    );
    this.log.info(`Available devices: ${availableDevices.length}`);

    const discoveredAccessories: string[] = [];
    for (const device of availableDevices) {
      const uuid = this.api.hap.uuid.generate(device.info.mac);
      discoveredAccessories.push(uuid);

      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid,
      );

      if (existingAccessory) {
        this.log.info('Existing accessory:', device.info.name);

        existingAccessory.context.device = device;
      } else {
        this.log.info('Adding new accessory:', device.info.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(
          device.info.name,
          uuid,
        );

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        switch (device.info.product.id) {
          case QingpingDeviceProductId.AirMonitor:
            new QingpingAirMonitorAccessory(this, accessory);
            break;

          default:
            this.log.warn(
              'Unsupported device:',
              device.info.product.id,
              device.info.product.en_name,
            );
            continue;
        }

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
        this.log.info(`Registered a new device: ${device.info.name}`);

        this.accessories.push(accessory);
      }
    }

    for (const accessory of this.accessories) {
      if (!discoveredAccessories.some((uuid) => accessory.UUID === uuid)) {
        this.log.info(
          'Unregistering unknown accessory:',
          accessory.displayName,
        );
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    }
  }
}
