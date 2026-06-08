import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { OpsSignalsModule } from '../../ops-signals/ops-signals.module';
import { WechatController } from './wechat.controller';
import { WechatService } from './wechat.service';

@Module({
  imports: [PrismaModule, OpsSignalsModule],
  controllers: [WechatController],
  providers: [WechatService],
})
export class WechatModule {}
