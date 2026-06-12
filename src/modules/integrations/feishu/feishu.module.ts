import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../../platform/config/app-config.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { OpsSignalsModule } from '../../ops-signals/ops-signals.module';
import { FeishuController } from './feishu.controller';
import { FeishuService } from './feishu.service';

@Module({
  imports: [AppConfigModule, PrismaModule, OpsSignalsModule],
  controllers: [FeishuController],
  providers: [FeishuService],
  exports: [FeishuService],
})
export class FeishuModule {}
