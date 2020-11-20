import got, { Got } from 'got';

const DEFAULT_INTERVAL = 5000;
interface OauthAccess {
  access_token: string;
  expires_in: number;
  scope: 'device_full_access';
  token_type: 'bearer';
}

export enum DeviceProductId {
  AirMonitor = 1201,
}

export interface DeviceInfo {
  mac: string;
  product: {
    id: DeviceProductId;
    name: string;
    en_name: string;
  };
  name: string;
  version: string;
  created_at: number;
  group_id: number;
  group_name: string;
  status: {
    offline: boolean;
  };
}

type DeviceDataKey =
  | 'timestamp'
  | 'battery'
  | 'temperature'
  | 'humidity'
  | 'tvoc'
  | 'co2'
  | 'pm25';

export type DeviceData = Record<DeviceDataKey, { value: number }>;

export interface Device {
  info: DeviceInfo;
  data: DeviceData;
}

interface GetDevicesResponse {
  total: number;
  devices: Device[];
}

export class Client {
  private readonly got: Got;

  private accessUpdatedAt = -1;
  private access?: OauthAccess;

  public devices: Device[] = [];

  public get refreshBefore() {
    if (!this.access) {
      return null;
    }

    return Date.now() + this.access.expires_in * 990;
  }

  public constructor(
    private readonly appKey: string,
    private readonly appSecret: string,
    private readonly interval = DEFAULT_INTERVAL,
  ) {
    this.got = got.extend();
  }

  public async refreshToken() {
    const response = await this.got.post<OauthAccess>(
      'https://oauth.cleargrass.com/oauth2/token',
      {
        responseType: 'json',
        headers: {
          'content-type': 'x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(
            `${this.appKey}:${this.appSecret}`,
          ).toString('base64')}`,
        },
        form: {
          grant_type: 'client_credentials',
          scope: 'device_full_access',
        },
      },
    );

    this.accessUpdatedAt = Date.now();
    this.access = response.body;

    return this.access;
  }

  public async updateDevices() {
    if (
      !this.access ||
      this.accessUpdatedAt + this.access.expires_in * 1000 > Date.now()
    ) {
      await this.refreshToken();
    }

    const response = await this.got.get<GetDevicesResponse>(
      'https://apis.cleargrass.com/v1/apis/devices',
      {
        responseType: 'json',
        searchParams: {
          timestamp: Date.now(),
        },
      },
    );

    if (Array.isArray(response.body.devices)) {
      this.devices = response.body.devices;
    }
  }
}
