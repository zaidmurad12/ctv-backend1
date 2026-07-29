import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Chip, IconButton, Stack, Tooltip } from '@mui/material';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import FavoriteOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type DataTableColumn } from '../../components/common/DataTable';
import { RoleGuard } from '../../components/common/RoleGuard';
import { useNotification } from '../../context/NotificationContext';
import { ApiError } from '../../lib/apiError';
import { providersService } from '../../services/providersService';
import type { ProviderHealthSummaryDto, ProviderSummaryDto } from '../../services/types';

interface ProviderRow extends ProviderSummaryDto {
  readonly health?: ProviderHealthSummaryDto;
}

function statusColor(status?: string): 'success' | 'warning' | 'error' | 'default' {
  if (!status) return 'default';
  const normalized = status.toLowerCase();
  if (normalized === 'healthy') return 'success';
  if (normalized === 'unavailable' || normalized === 'authentication_failed') return 'error';
  if (normalized === 'maintenance' || normalized === 'rate_limited') return 'warning';
  return 'default';
}

function ProvidersPage() {
  const { notify } = useNotification();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');

  const listQuery = useQuery({
    queryKey: ['providers', 'list'],
    queryFn: () => providersService.list(),
  });
  const healthQuery = useQuery({
    queryKey: ['providers', 'health'],
    queryFn: () => providersService.health(),
  });

  function runAction(action: (providerId: string) => Promise<unknown>, successMessage: string) {
    return async (providerId: string) => {
      try {
        await action(providerId);
        notify(successMessage, 'success');
        void queryClient.invalidateQueries({ queryKey: ['providers'] });
      } catch (error) {
        if (error instanceof ApiError && error.isNotImplemented) {
          notify('This action isn’t available yet — the backend doesn’t expose it.', 'info');
        } else {
          notify(error instanceof Error ? error.message : 'Action failed.', 'error');
        }
      }
    };
  }

  const discoverMutation = useMutation({
    mutationFn: runAction(providersService.triggerDiscovery, 'Discovery run triggered.'),
  });
  const healthCheckMutation = useMutation({
    mutationFn: async () => {
      await healthQuery.refetch();
      notify('Provider health refreshed.', 'success');
    },
  });
  const enableMutation = useMutation({
    mutationFn: runAction(providersService.enable, 'Provider enabled.'),
  });
  const disableMutation = useMutation({
    mutationFn: runAction(providersService.disable, 'Provider disabled.'),
  });
  const reloadMutation = useMutation({
    mutationFn: runAction(providersService.reload, 'Provider reloaded.'),
  });

  const rows: ProviderRow[] = useMemo(() => {
    const healthById = new Map((healthQuery.data ?? []).map((entry) => [entry.providerId, entry]));
    const all = (listQuery.data ?? []).map((provider) => ({
      ...provider,
      health: healthById.get(provider.id),
    }));
    if (!search.trim()) return all;
    const term = search.trim().toLowerCase();
    return all.filter((provider) => provider.name.toLowerCase().includes(term));
  }, [listQuery.data, healthQuery.data, search]);

  const paged = rows.slice((page - 1) * limit, page * limit);

  const columns: DataTableColumn<ProviderRow>[] = [
    { key: 'name', label: 'Provider Name', render: (row) => row.name },
    { key: 'priority', label: 'Priority', render: (row) => row.priority },
    {
      key: 'capabilities',
      label: 'Capabilities',
      render: (row) => row.capabilities.join(', ') || '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) =>
        row.health ? (
          <Chip size="small" label={row.health.status} color={statusColor(row.health.status)} />
        ) : (
          '—'
        ),
    },
    {
      key: 'latency',
      label: 'Latency',
      render: (row) => (row.health ? `${row.health.latencyMs} ms` : '—'),
    },
    {
      key: 'lastCheck',
      label: 'Last Check',
      render: (row) => (row.health ? new Date(row.health.lastCheckedAt).toLocaleString() : '—'),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Trigger discovery">
            <IconButton size="small" onClick={() => discoverMutation.mutate(row.id)}>
              <PlayArrowOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Health check">
            <IconButton size="small" onClick={() => healthCheckMutation.mutate()}>
              <MonitorHeartOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Enable">
            <IconButton size="small" onClick={() => enableMutation.mutate(row.id)}>
              <FavoriteOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Disable">
            <IconButton size="small" onClick={() => disableMutation.mutate(row.id)}>
              <BlockOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reload">
            <IconButton size="small" onClick={() => reloadMutation.mutate(row.id)}>
              <RefreshOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <RoleGuard adminOnly>
      <PageHeader
        title="Providers"
        description="Registered content providers, their health, and manual controls."
      />
      <DataTable
        columns={columns}
        rows={paged}
        getRowId={(row) => row.id}
        isLoading={listQuery.isLoading || healthQuery.isLoading}
        error={listQuery.error ?? healthQuery.error}
        onRetry={() => {
          void listQuery.refetch();
          void healthQuery.refetch();
        }}
        page={page}
        limit={limit}
        total={rows.length}
        onPageChange={setPage}
        onLimitChange={(value) => {
          setLimit(value);
          setPage(1);
        }}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search providers…"
        emptyTitle="No providers registered"
        emptyDescription="No content provider is registered yet. This is expected until a concrete provider is authorized and implemented."
      />
    </RoleGuard>
  );
}

export default ProvidersPage;
