import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../src/platform/config/app-config.service';

describe('AppConfigService', () => {
  it('returns the configured port', () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'PORT') {
          return 4010;
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new AppConfigService(configService);

    expect(service.getPort()).toBe(4010);
  });

  it('falls back to 3000 when port is missing', () => {
    const configService = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;

    const service = new AppConfigService(configService);

    expect(service.getPort()).toBe(3000);
  });

  it('returns the project delete password as configured', () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'PROJECT_DELETE_PASSWORD') {
          return 'secret-pass';
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    const service = new AppConfigService(configService);

    expect(service.getProjectDeletePassword()).toBe('secret-pass');
  });

  it('returns other centralized secrets and HOME values', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          GEMINI_API_KEY: 'gemini-key',
          FEISHU_VERIFICATION_TOKEN: 'verify-token',
          FEISHU_APP_ID: 'feishu-app-id',
          FEISHU_APP_SECRET: 'feishu-app-secret',
          HOME: '/Users/tester',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const service = new AppConfigService(configService);

    expect(service.getGeminiApiKey()).toBe('gemini-key');
    expect(service.getFeishuVerificationToken()).toBe('verify-token');
    expect(service.getFeishuAppId()).toBe('feishu-app-id');
    expect(service.getFeishuAppSecret()).toBe('feishu-app-secret');
    expect(service.getHomeDir()).toBe('/Users/tester');
  });

  it('builds a child-process env from an explicit whitelist', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          PATH: '/usr/bin:/bin',
          HOME: '/Users/tester',
          SHELL: '/bin/zsh',
          TMPDIR: '/tmp/tester',
          LANG: 'zh_CN.UTF-8',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const service = new AppConfigService(configService);

    expect(service.getAgentChildProcessEnv({ home: '/Users/override' })).toEqual({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/override',
      SHELL: '/bin/zsh',
      TMPDIR: '/tmp/tester',
      LANG: 'zh_CN.UTF-8',
    });
  });
});
