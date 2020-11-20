import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
  Characteristic,
} from 'homebridge';

import {
  QingpingHomebridgePlatform,
  QingpingHomebridgePlatformConfig,
} from './platform';
import { QingpingDevice, QingpingDeviceData } from './qingping';

export type AirQualityLevelCondition = Partial<
  Record<keyof QingpingDeviceData, number>
>;

export type AirQualityLevel = (
  | {
      under: AirQualityLevelCondition;
    }
  | {
      over: AirQualityLevelCondition;
    }
) & {
  airQuality: number;
};

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

  private onCharacteristicGetValue = (
    field: keyof QingpingDeviceData,
    callback: Function,
  ) => {
    const value = this.data[field]?.value;
    if (!value) {
      return callback(new Error(`Undefined characteristic value for ${field}`));
    }

    callback(null, value);
  };

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
      .on('get', this.onCharacteristicGetValue.bind(this, 'humidity'));

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
      .on('get', this.onCharacteristicGetValue.bind(this, 'temperature'));

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
      .on('get', this.onCharacteristicGetValue.bind(this, 'battery'));

    return batteryService;
  }

  private getAirQuality(): number {
    const levels: AirQualityLevel[] = [
      {
        under: {
          pm25: 12,
          tvoc: 65,
          co2: 1000,
        },
        airQuality: this.platform.Characteristic.AirQuality.EXCELLENT,
      },
      {
        under: {
          pm25: 35,
          tvoc: 220,
          co2: 1250,
        },
        airQuality: this.platform.Characteristic.AirQuality.GOOD,
      },
      {
        under: {
          pm25: 55,
          tvoc: 660,
          co2: 1500,
        },
        airQuality: this.platform.Characteristic.AirQuality.FAIR,
      },
      {
        under: {
          pm25: 150,
          tvoc: 2000,
          co2: 2000,
        },
        airQuality: this.platform.Characteristic.AirQuality.INFERIOR,
      },
      {
        over: {
          pm25: 150,
          tvoc: 2000,
          co2: 2000,
        },
        airQuality: this.platform.Characteristic.AirQuality.POOR,
      },
    ];

    let airQuality = this.platform.Characteristic.AirQuality.UNKNOWN;
    for (const level of levels) {
      let key: 'under' | 'over';
      if ('under' in level) {
        key = 'under';
      } else {
        key = 'over';
      }

      const matches: boolean[] = [];
      const condition: AirQualityLevelCondition = level[key];
      for (const [dataKey, targetValue] of Object.entries(condition)) {
        switch (key) {
          case 'under':
            matches.push(
              dataKey in this.data && this.data[dataKey].value < targetValue!,
            );
            break;

          case 'over':
            matches.push(
              dataKey in this.data && this.data[dataKey].value > targetValue!,
            );
            break;
        }
      }

      if (matches.every((x) => x)) {
        airQuality = level.airQuality;
        break;
      }
    }

    return airQuality;
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
      .getCharacteristic(this.platform.Characteristic.AirQuality)
      .on('get', (callback) => callback(null, this.getAirQuality()));
    airQualityService
      .getCharacteristic(this.platform.Characteristic.PM2_5Density)
      .on('get', this.onCharacteristicGetValue.bind(this, 'pm25'));
    airQualityService
      .getCharacteristic(this.platform.Characteristic.VOCDensity)
      .on('get', (callback) => {
        // based on ppb
        // μg/m3 = (ppb)*(12.187)*(M) / (273.15 + °C)
        // where M is the molecular weight of the gaseous pollutant. An atmospheric pressure of 1 atmosphere is assumed.
        // benzene: 1 ppb = 3.19 μg/m3
        let value = this.data.tvoc.value;
        switch (this.config.tvocUnit) {
          case 'ppb':
            value = this.data.tvoc.value * 3.19;
            break;
        }

        callback(null, value);
      });

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
      .getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected)
      .on('get', (callback) => {
        const detected =
          this.data.co2.value > 2000
            ? this.platform.Characteristic.CarbonDioxideDetected
                .CO2_LEVELS_ABNORMAL
            : this.platform.Characteristic.CarbonDioxideDetected
                .CO2_LEVELS_NORMAL;
        callback(null, detected);
      });
    carbonDioxideService
      .getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
      .on('get', this.onCharacteristicGetValue.bind(this, 'co2'));

    return carbonDioxideService;
  }
}
