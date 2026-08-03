import { describe, expect, jest, test } from '@jest/globals';

import TuyaOpenAPI from '../src/core/TuyaOpenAPI';

describe('TuyaOpenAPI token recovery', () => {
  test('re-authenticates when refresh token refresh fails with code 1010', async () => {
    const api = new TuyaOpenAPI(TuyaOpenAPI.Endpoints.CHINA, 'accessId', 'accessKey');
    api.tokenInfo = {
      access_token: 'old-token',
      refresh_token: 'old-refresh-token',
      uid: 'user-id',
      expire: 0,
    };

    (api as unknown as { loginInfo: { countryCode: number; username: string; password: string; appSchema: string } | null }).loginInfo = {
      countryCode: 86,
      username: 'user',
      password: 'password',
      appSchema: 'smartlife',
    };

    const getSpy = jest.spyOn(api, 'get').mockResolvedValue({
      success: false,
      result: {},
      code: 1010,
      msg: 'token expired',
      t: 0,
      tid: 'tid',
    });
    const homeLoginSpy = jest.spyOn(api, 'homeLogin').mockResolvedValue({
      success: true,
      result: {
        access_token: 'new-token',
        refresh_token: 'new-refresh-token',
        uid: 'user-id',
        expire_time: 3600,
      },
      t: 0,
      tid: 'tid',
    });

    await api._refreshAccessTokenIfNeed('/v1.0/devices');

    expect(getSpy).toHaveBeenCalledWith('/v1.0/token/old-refresh-token');
    expect(homeLoginSpy).toHaveBeenCalledWith(86, 'user', 'password', 'smartlife');
    expect(api.tokenRecoveryCount).toBe(1);
  });
});
