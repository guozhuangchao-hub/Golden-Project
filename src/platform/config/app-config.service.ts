import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  getPort() {
    return this.configService.get<number>('PORT') ?? 3000;
  }

  getProjectDeletePassword() {
    return this.configService.get<string>('PROJECT_DELETE_PASSWORD');
  }

  getGeminiApiKey() {
    return this.configService.get<string>('GEMINI_API_KEY');
  }

  getFeishuVerificationToken() {
    return this.configService.get<string>('FEISHU_VERIFICATION_TOKEN');
  }

  getFeishuAppId() {
    return this.configService.get<string>('FEISHU_APP_ID');
  }

  getFeishuAppSecret() {
    return this.configService.get<string>('FEISHU_APP_SECRET');
  }

  getHomeDir() {
    return this.configService.get<string>('HOME') ?? '';
  }
}
