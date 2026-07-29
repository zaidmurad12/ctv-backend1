import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, IconButton, Stack, Tooltip } from '@mui/material';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type DataTableColumn } from '../../components/common/DataTable';
import { RoleGuard } from '../../components/common/RoleGuard';
import { useNotification } from '../../context/NotificationContext';
import { ApiError } from '../../lib/apiError';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { importJobsService, type ImportJobDto } from '../../services/importJobsService';

function statusColor(
  status: ImportJobDto['status'],
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'running':
      return 'info';
    case 'cancelled':
      return 'default';
    default:
      return 'warning';
  }
}

function ImportJobsPage() {
  const { notify } = useNotification();
  const queryClient = useQueryClient();
  const query = usePaginatedQuery<ImportJobDto>({
    queryKey: ['import-jobs'],
    fetcher: (params) => importJobsService.list(params),
  });

  function handleAction(action: (jobId: string) => Promise<unknown>) {
    return async (jobId: string) => {
      try {
        await action(jobId);
        void queryClient.invalidateQueries({ queryKey: ['import-jobs'] });
      } catch (error) {
        if (error instanceof ApiError && error.isNotImplemented) {
          notify('Import job history isn’t tracked by the backend yet.', 'info');
        } else {
          notify(error instanceof Error ? error.message : 'Action failed.', 'error');
        }
      }
    };
  }

  const retryMutation = useMutation({ mutationFn: handleAction(importJobsService.retry) });
  const cancelMutation = useMutation({ mutationFn: handleAction(importJobsService.cancel) });
  const restartMutation = useMutation({ mutationFn: handleAction(importJobsService.restart) });

  const columns: DataTableColumn<ImportJobDto>[] = [
    { key: 'id', label: 'Job ID', render: (row) => row.id },
    { key: 'providerId', label: 'Provider', render: (row) => row.providerId },
    {
      key: 'startedAt',
      label: 'Started',
      render: (row) => new Date(row.startedAt).toLocaleString(),
    },
    {
      key: 'finishedAt',
      label: 'Finished',
      render: (row) => (row.finishedAt ? new Date(row.finishedAt).toLocaleString() : '—'),
    },
    {
      key: 'durationMs',
      label: 'Duration',
      render: (row) => (row.durationMs ? `${(row.durationMs / 1000).toFixed(1)}s` : '—'),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Chip size="small" label={row.status} color={statusColor(row.status)} />,
    },
    { key: 'progress', label: 'Progress', render: (row) => `${Math.round(row.progress * 100)}%` },
    { key: 'errors', label: 'Errors', render: (row) => row.errors },
    { key: 'retries', label: 'Retries', render: (row) => row.retries },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Retry">
            <IconButton size="small" onClick={() => retryMutation.mutate(row.id)}>
              <ReplayOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Cancel">
            <IconButton size="small" onClick={() => cancelMutation.mutate(row.id)}>
              <CancelOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Restart">
            <IconButton size="small" onClick={() => restartMutation.mutate(row.id)}>
              <RestartAltOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <RoleGuard adminOnly>
      <PageHeader
        title="Import Jobs"
        description="Monitor and control content import jobs."
        actions={
          <Button
            startIcon={<FileDownloadOutlinedIcon />}
            variant="outlined"
            onClick={() => notify('Import job history isn’t tracked by the backend yet.', 'info')}
          >
            Export Logs
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
        searchPlaceholder="Search by job ID or provider…"
        emptyTitle="No import jobs"
        emptyDescription="Import job history isn't tracked by the backend yet — the importer's metrics are in-process only (see services/importer)."
      />
    </RoleGuard>
  );
}

export default ImportJobsPage;
