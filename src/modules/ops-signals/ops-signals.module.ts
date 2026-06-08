import { Module } from '@nestjs/common';
import { OpsSignalsService } from './ops-signals.service';

@Module({
  providers: [OpsSignalsService],
  exports: [OpsSignalsService],
})
export class OpsSignalsModule {}
