import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prismaService.js';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
