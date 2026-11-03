import { Body, Controller, Get, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/decorators.js';
import {
  LATEST_APK_EXTERNAL_URL,
  LATEST_APK_FILENAME,
  LATEST_NOTES_AR,
  LATEST_NOTES_EN,
  LATEST_VERSION_CODE,
  LATEST_VERSION_NAME,
} from './appVersion.js';

// What the Android TV app's own Settings screen checks against to offer an in-app update, and
// where it downloads the APK from - see appVersion.ts's own comment for how a new release
// actually gets published here.
@ApiTags('app')
@Controller('app')
export class AppUpdateController {
  private readonly logger = new Logger('AppCrashReport');

  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Latest CinemanaTVRN release available for in-app update' })
  version(@Req() req: Request) {
    // Built from the request itself (not a hardcoded domain) so this keeps working unchanged
    // across environments/redeploys under a different host - used only when
    // LATEST_APK_EXTERNAL_URL is empty (see its own comment on why it currently isn't).
    const origin = `${req.protocol}://${req.get('host')}`;
    return {
      versionCode: LATEST_VERSION_CODE,
      versionName: LATEST_VERSION_NAME,
      url: LATEST_APK_EXTERNAL_URL || `${origin}/downloads/${LATEST_APK_FILENAME}`,
      notesAr: LATEST_NOTES_AR,
      notesEn: LATEST_NOTES_EN,
    };
  }

  // Crash/exit reports from the TV app (see src/crashReporter.ts there): a fatal JS error, or
  // Android's own recorded reason for a previous process exit (crash, native crash, low-memory
  // kill, ANR). Only ever written to the service log - read them with
  //   gcloud logging read 'textPayload:"AppCrashReport"'
  // Every field is trimmed to a fixed size, so this can't be used to push large payloads.
  @Public()
  @Post('crash-report')
  @HttpCode(204)
  @ApiOperation({ summary: 'Crash/exit report from the TV app (logged only)' })
  crashReport(@Body() body: unknown): void {
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const str = (value: unknown, max: number) =>
      (typeof value === 'string' ? value : value == null ? '' : String(value)).slice(0, max);
    const report = {
      kind: str(input.kind, 40),
      version: str(input.version, 40),
      device: str(input.device, 120),
      android: str(input.android, 20),
      message: str(input.message, 500),
      detail: str(input.detail, 4000),
    };
    this.logger.warn(JSON.stringify(report));
  }
}
