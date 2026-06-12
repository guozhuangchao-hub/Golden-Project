import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectModulesService } from './project-modules.service';

@Module({
  imports: [PrismaModule],
  providers: [ProjectModulesService],
  exports: [ProjectModulesService],
})
export class ProjectModulesModule {}
