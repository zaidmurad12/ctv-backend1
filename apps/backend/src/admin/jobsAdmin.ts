import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Post,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { Roles } from '../common/decorators/decorators.js';
import { PrismaService } from '../prisma/prismaService.js';
import { ScheduledImportService } from './infrastructure/scheduledImportService.js';

// "Run now" buttons for the admin panel. The jobs run inside this web service, in small batches
// sized for the free host (512 MB of memory, and it sleeps after 15 minutes without requests - the
// panel polls while a job runs, which keeps it awake): the newest-titles import runs in this process,
// the episode refresh in a child process with a capped heap so it cannot take the API down.
const JOBS = ['newest', 'episodes'] as const;
type JobName = (typeof JOBS)[number];

const NEWEST_BUDGET_MS = 10 * 60 * 1000;
const MAX_LOG_LINES = 200;
const REPO_ROOT = path.resolve(process.cwd());

export class RunJobBody {
  @IsIn([...JOBS])
  job!: JobName;
}

interface JobState {
  job: JobName;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  lines: string[];
  child: ChildProcess | null;
}

@Injectable()
export class JobsAdminService {
  private readonly logger = new Logger(JobsAdminService.name);
  private readonly prisma: PrismaService['client'];
  private readonly dbLimitMb = Number(process.env.DB_LIMIT_MB) || 1024;
  // Imports pause here, below the cap, so Neon never reaches its hard limit.
  private readonly dbStopMb = Number(process.env.DB_STOP_MB) || 850;
  private current: JobState | null = null;

  constructor(
    prismaService: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {
    this.prisma = prismaService.client;
  }

  private async databaseSizeMb(): Promise<number | null> {
    try {
      const rows = (await this.prisma
        .$queryRaw`select (pg_database_size(current_database()) / 1048576)::int as mb`) as Array<{
        mb: number;
      }>;
      return Number(rows[0]?.mb ?? 0) || null;
    } catch {
      return null;
    }
  }

  private log(state: JobState, line: string): void {
    for (const part of line.split(/\r?\n/)) {
      if (!part.trim()) continue;
      state.lines.push(part);
      if (state.lines.length > MAX_LOG_LINES) state.lines.shift();
    }
  }

  private finish(state: JobState, ok: boolean): void {
    state.ok = ok;
    state.finishedAt = new Date().toISOString();
    state.child = null;
  }

  async overview() {
    const sizeMb = await this.databaseSizeMb();
    const state = this.current;
    return {
      database: { sizeMb, limitMb: this.dbLimitMb },
      current: state && {
        job: state.job,
        running: !state.finishedAt,
        ok: state.ok,
        startedAt: state.startedAt,
        finishedAt: state.finishedAt,
        lines: state.lines.slice(-60),
      },
    };
  }

  async run(job: JobName): Promise<{ started: true }> {
    if (this.current && !this.current.finishedAt) {
      throw new ConflictException('A job is already running - wait for it to finish.');
    }
    const state: JobState = {
      job,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      ok: null,
      lines: [],
      child: null,
    };
    this.current = state;
    const sizeMb = await this.databaseSizeMb();
    if (sizeMb !== null && sizeMb >= this.dbStopMb) {
      this.log(state, `Database is ${sizeMb} MB (limit ${this.dbStopMb} MB) - nothing imported.`);
      this.finish(state, false);
      return { started: true };
    }
    if (job === 'newest') this.runNewest(state);
    else this.runEpisodes(state);
    return { started: true };
  }

  private runNewest(state: JobState): void {
    const service = this.moduleRef.get(ScheduledImportService, { strict: false });
    this.log(state, 'Importing the newest releases...');
    void service.runNewestOnly(NEWEST_BUDGET_MS).then(
      (total) => {
        this.log(state, `Done: ${total} new titles added.`);
        this.finish(state, true);
      },
      (error: unknown) => {
        this.logger.error(`newest job failed: ${String(error)}`);
        this.log(state, `Failed: ${error instanceof Error ? error.message : String(error)}`);
        this.finish(state, false);
      },
    );
  }

  private runEpisodes(state: JobState): void {
    const child = spawn(process.execPath, ['prisma/reimport-published-shows.mjs'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=160',
        CATALOG_REFRESH_BUDGET_MIN: '8',
        CATALOG_MISSING_METADATA_BUDGET_MIN: '4',
      },
    });
    state.child = child;
    child.stdout.on('data', (chunk) => this.log(state, String(chunk)));
    child.stderr.on('data', (chunk) => this.log(state, String(chunk)));
    child.on('error', (error) => {
      this.log(state, `Could not start: ${error.message}`);
      this.finish(state, false);
    });
    child.on('close', (code) => {
      if (!state.finishedAt) this.finish(state, code === 0);
    });
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/jobs')
export class JobsAdminController {
  constructor(private readonly service: JobsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Current import job and the database size against its free-plan cap' })
  overview() {
    return this.service.overview();
  }

  @Post('run')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start an import job now (newest | episodes)' })
  run(@Body() body: RunJobBody) {
    return this.service.run(body.job);
  }
}
