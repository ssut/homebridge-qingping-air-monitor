import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import {
  QingpingHomebridgePlatform,
  QingpingHomebridgePlatformConfig,
} from './platform';
import { QingpingDevice } from './qingping';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class QingpingAirMonitorAccessory {
  private get device(): QingpingDevice {
    return this.accessory.context.device;
  }

  private get data() {
    return this.device.data;
  }

  private get info() {
    return this.device.info;
  }

  private get config() {
    return this.platform.config as QingpingHomebridgePlatformConfig;
  }

  private batteryService?: Service;
  private temperatureService: Service;
  private humidityService: Service;
  private airQualityService: Service;
  private carbonDioxideService: Service;

  constructor(
    private readonly platform: QingpingHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Qingping')
      .setCharacteristic(
        this.platform.Characteristic.Model,
        this.info.product.en_name,
      )
      .setCharacteristic(this.platform.Characteristic.Name, this.info.name);

    this.batteryService = this.getBatteryService();
    this.temperatureService = this.getTemperatureService();
    this.humidityService = this.getHumidityService();
    this.airQualityService = this.getAirQualityService();
    this.carbonDioxideService = this.getCarbonDioxideService();
  }

  public get services() {
    return [
      this.batteryService,
      this.temperatureService,
      this.humidityService,
      this.airQualityService,
      this.carbonDioxideService,
    ].filter((x) => x !== undefined);
  }

  private getHumidityService() {
    const humidityService =
      this.accessory.getService(this.platform.Service.HumiditySensor) ??
      this.accessory.addService(this.platform.Service.HumiditySensor);
    humidityService.setCharacteristic(
      this.platform.Characteristic.Name,
      this.config.humidityName ?? 'Humidity',
    );
    humidityService
      .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on('get', () => this.data.humidity.value);

    return humidityService;
  }

  private getTemperatureService() {
    const temperatureService =
      this.accessory.getService(this.platform.Service.TemperatureSensor) ??
      this.accessory.addService(this.platform.Service.TemperatureSensor);
    temperatureService.setCharacteristic(
      this.platform.Characteristic.Name,
      this.config.temperatureName ?? 'Temperature',
    );
    temperatureService
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', () => this.data.temperature.value);

    return temperatureService;
  }

  private getBatteryService() {
    if (!this.data.battery || typeof this.data.battery.value !== 'number') {
      return;
    }

    const batteryService =
      this.accessory.getService(this.platform.Service.BatteryService) ??
      this.accessory.addService(this.platform.Service.BatteryService);
    batteryService.setCharacteristic(
      this.platform.Characteristic.Name,
      'Battery',
    );
    batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .on('get', () => {
        const batteryPercentage = this.data.battery.value;

        if (batteryPercentage > 20) {
          return this.platform.Characteristic.StatusLowBattery
            .BATTERY_LEVEL_NORMAL;
        }
        return this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
      });

    return batteryService;
  }

  private getAirQualityService() {
    const airQualityService =
      this.accessory.getService(this.platform.Service.AirQualitySensor) ??
      this.accessory.addService(this.platform.Service.AirQualitySensor);
    airQualityService.setCharacteristic(
      this.platform.Characteristic.Name,
      this.config.aqiName ?? 'Air Quality',
    );
    airQualityService
      .getCharacteristic(this.platform.Characteristic.PM2_5Density)
      .on('get', () => this.data.pm25.value);
    airQualityService
      .getCharacteristic(this.platform.Characteristic.VOCDensity)
      .on('get', () => this.data.tvoc.value);

    return airQualityService;
  }

  private getCarbonDioxideService() {
    const carbonDioxideService =
      this.accessory.getService(this.platform.Service.CarbonDioxideSensor) ??
      this.accessory.addService(this.platform.Service.CarbonDioxideSensor);
    carbonDioxideService.setCharacteristic(
      this.platform.Characteristic.Name,
      this.config.co2Name ?? 'Carbon Dioxide',
    );
    carbonDioxideService
      .getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
      .on('get', () => this.data.co2.value);

    return carbonDioxideService;
  }
}
