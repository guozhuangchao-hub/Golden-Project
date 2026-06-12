import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { AppConfigService } from './platform/config/app-config.service';
import { AppExceptionFilter } from './platform/http/app-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const appConfigService = app.get(AppConfigService);

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'console/dashboard', method: RequestMethod.GET },
      { path: 'console/structure', method: RequestMethod.GET },
      { path: 'console/files', method: RequestMethod.GET },
      { path: 'console/mobile', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();
  app.use('/console/assets', express.static(join(process.cwd(), 'public')));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AppExceptionFilter());

  await app.listen(appConfigService.getPort());
}

bootstrap();
