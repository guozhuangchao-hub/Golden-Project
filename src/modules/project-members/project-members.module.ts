import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectMembersService } from './project-members.service';

@Module({
  imports: [PrismaModule],
  providers: [ProjectMembersService],
  exports: [ProjectMembersService],
})
export class ProjectMembersModule {}
