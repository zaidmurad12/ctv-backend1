import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersController } from './users.controller.js';
import { UsersUseCases } from './useCases.js';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersUseCases],
  exports: [UsersUseCases],
})
export class UsersModule {}
