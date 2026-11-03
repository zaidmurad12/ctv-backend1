import { Module } from '@nestjs/common';
import { YoutubeEmbedController } from './youtubeEmbed.controller.js';

@Module({ controllers: [YoutubeEmbedController] })
export class YoutubeEmbedModule {}
