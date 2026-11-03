import { Module } from '@nestjs/common';
import { AppUpdateController } from './appUpdate.controller.js';

@Module({ controllers: [AppUpdateController] })
export class AppUpdateModule {}
