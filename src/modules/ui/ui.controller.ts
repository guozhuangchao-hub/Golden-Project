import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller('console')
export class UiController {
  @Get('dashboard')
  getDashboardPage(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'public', 'dashboard.html'));
  }

  @Get('structure')
  getStructurePage(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'public', 'structure.html'));
  }

  @Get('files')
  getFilesPage(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'public', 'files.html'));
  }

  @Get('mobile')
  getMobilePage(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'public', 'mobile.html'));
  }
}
