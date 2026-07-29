import { apiRequestWithMeta } from './apiClient';
import type { ListParams, Page } from './types';

/**
 * Typed contract for `specification/11-Admin-Dashboard.md.txt` "Audit Trail"
 * ("Every administrative action stores User, Action, Timestamp, IP Address,
 * Target, Result") and `specification/12-Security.md.txt` "Audit Log". No
 * audit table or middleware is wired up in apps/backend (Milestone 5) yet —
 * this call hits the namespace a future endpoint would use and 404s until
 * then, rather than fabricating entries.
 */
export interface AuditLogEntryDto {
  readonly id: string;
  readonly user: string;
  readonly action: string;
  readonly timestamp: string;
  readonly ipAddress: string;
  readonly target: string;
  readonly result: 'success' | 'failure';
  readonly durationMs?: number;
}

export const auditLogsService = {
  async list(params: ListParams): Promise<Page<AuditLogEntryDto>> {
    const { data, meta } = await apiRequestWithMeta<AuditLogEntryDto[]>('admin/audit-logs', {
      params,
    });
    return { items: data, meta: meta! };
  },

  exportUrl(params: ListParams): string {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null) as [string, string][],
    ).toString();
    return `admin/audit-logs/export${query ? `?${query}` : ''}`;
  },
};
