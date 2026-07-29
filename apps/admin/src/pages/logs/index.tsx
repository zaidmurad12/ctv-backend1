import { Button, Chip } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type DataTableColumn } from '../../components/common/DataTable';
import { RoleGuard } from '../../components/common/RoleGuard';
import { useNotification } from '../../context/NotificationContext';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { auditLogsService, type AuditLogEntryDto } from '../../services/auditLogsService';

function AuditLogsPage() {
  const { notify } = useNotification();
  const query = usePaginatedQuery<AuditLogEntryDto>({
    queryKey: ['audit-logs'],
    fetcher: (params) => auditLogsService.list(params),
  });

  const columns: DataTableColumn<AuditLogEntryDto>[] = [
    {
      key: 'timestamp',
      label: 'Timestamp',
      render: (row) => new Date(row.timestamp).toLocaleString(),
    },
    { key: 'user', label: 'User', render: (row) => row.user },
    { key: 'action', label: 'Action', render: (row) => row.action },
    { key: 'target', label: 'Target', render: (row) => row.target },
    { key: 'ipAddress', label: 'IP Address', render: (row) => row.ipAddress },
    {
      key: 'result',
      label: 'Result',
      render: (row) => (
        <Chip
          size="small"
          label={row.result}
          color={row.result === 'success' ? 'success' : 'error'}
        />
      ),
    },
  ];

  return (
    <RoleGuard adminOnly>
      <PageHeader
        title="Audit Logs"
        description="Every administrative action: who, what, when, from where, and the result."
        actions={
          <Button
            startIcon={<FileDownloadOutlinedIcon />}
            variant="outlined"
            onClick={() =>
              notify(
                'Audit log export isn’t available yet — the backend doesn’t expose an audit log API.',
                'info',
              )
            }
          >
            Export
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={query.items}
        getRowId={(row) => row.id}
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        page={query.page}
        limit={query.limit}
        total={query.meta?.total ?? 0}
        onPageChange={query.setPage}
        onLimitChange={query.onLimitChange}
        search={query.search}
        onSearchChange={query.onSearchChange}
        searchPlaceholder="Search by user, action, or target…"
        emptyTitle="No audit log entries"
        emptyDescription="Audit logging isn't wired up in the backend yet (see specification/12-Security.md.txt 'Audit Log')."
      />
    </RoleGuard>
  );
}

export default AuditLogsPage;
