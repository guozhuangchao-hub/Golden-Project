import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { OpsSignalsModule } from '../../ops-signals/ops-signals.module';
import { AppAuthModule } from '../../../platform/auth/app-auth.module';
import { WechatRepository } from './wechat.repository';
import { WechatController } from './wechat.controller';
import { WechatService } from './wechat.service';

@Module({
  imports: [AppAuthModule, PrismaModule, OpsSignalsModule],
  controllers: [WechatController],
  providers: [WechatRepository, WechatService],
})
export class WechatModule {}
