import {
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { Roles } from '../common/decorators/decorators.js';
import { PrismaService } from '../prisma/prismaService.js';

// The import jobs run on GitHub Actions (see .github/workflows/daily-jobs.yml), not inside this web
// service: the free host puts the service to sleep and cuts long requests, and a job needs neither.
// These endpoints start one of them by hand and show how the recent runs went, so the admin panel
// can offer "run now" buttons. They need GITHUB_DISPATCH_TOKEN (a GitHub token allowed to run
// workflows on that repository); without it the panel says so instead of failing.
const JOBS = ['newest', 'episodes', 'old-titles'] as const;
type JobName = (typeof JOBS)[number];

export class RunJobBody {
  @IsIn([...JOBS])
  job!: JobName;
}

interface GitHubRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  display_title: string;
  event: string;
}

@Injectable()
export class JobsAdminService {
  private readonly prisma: PrismaService['client'];
  private readonly repo = process.env.GITHUB_JOBS_REPO || 'zaidmurad12/ctv-backend1';
  private readonly workflow = process.env.GITHUB_JOBS_WORKFLOW || 'daily-jobs.yml';
  private readonly ref = process.env.GITHUB_JOBS_REF || 'main';
  private readonly dbLimitMb = Number(process.env.DB_LIMIT_MB) || 1024;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  private async github<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!token)
      throw new ServiceUnavailableException('GITHUB_DISPATCH_TOKEN is not set on the server.');
    const response = await fetch(`https://api.github.com/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'ctv-admin',
      },
    });
    if (!response.ok) {
      throw new BadGatewayException(
        `GitHub answered ${response.status} - check the token's access to ${this.repo}.`,
      );
    }
    return response.status === 204 ? null : ((await response.json()) as T);
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

  private async recentRuns(): Promise<GitHubRun[]> {
    const data = await this.github<{ workflow_runs: GitHubRun[] }>(
      `/actions/workflows/${this.workflow}/runs?per_page=10`,
    );
    return data?.workflow_runs ?? [];
  }

  async overview() {
    const configured = !!process.env.GITHUB_DISPATCH_TOKEN;
    const [sizeMb, runs] = await Promise.all([
      this.databaseSizeMb(),
      configured
        ? this.recentRuns().catch(() => [] as GitHubRun[])
        : Promise.resolve([] as GitHubRun[]),
    ]);
    return {
      configured,
      database: { sizeMb, limitMb: this.dbLimitMb },
      runs: runs.map((run) => ({
        id: run.id,
        title: run.display_title,
        status: run.status,
        conclusion: run.conclusion,
        startedAt: run.created_at,
        updatedAt: run.updated_at,
        url: run.html_url,
        trigger: run.event === 'schedule' ? 'schedule' : 'manual',
      })),
    };
  }

  async run(job: JobName): Promise<{ started: true }> {
    const runs = await this.recentRuns();
    if (
      runs.some(
        (run) =>
          run.status === 'queued' || run.status === 'in_progress' || run.status === 'waiting',
      )
    ) {
      throw new ConflictException('A job is already running - wait for it to finish.');
    }
    await this.github(`/actions/workflows/${this.workflow}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: this.ref, inputs: { job } }),
    });
    return { started: true };
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/jobs')
export class JobsAdminController {
  constructor(private readonly service: JobsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Recent import runs and the database size against its free-plan cap' })
  overview() {
    return this.service.overview();
  }

  @Post('run')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start an import job now (newest | episodes | old-titles)' })
  run(@Body() body: RunJobBody) {
    return this.service.run(body.job);
  }
}
