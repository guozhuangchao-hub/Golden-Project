import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OpsSignalsRepository } from './ops-signals.repository';
import { OpsSignalsService } from './ops-signals.service';

@Module({
  imports: [PrismaModule],
  providers: [OpsSignalsRepository, OpsSignalsService],
  exports: [OpsSignalsService],
})
export class OpsSignalsModule {}
