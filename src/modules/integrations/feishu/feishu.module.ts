import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { FeishuController } from './feishu.controller';
import { FeishuService } from './feishu.service';

@Module({
  imports: [PrismaModule],
  controllers: [FeishuController],
  providers: [FeishuService],
  exports: [FeishuService],
})
export class FeishuModule {}
