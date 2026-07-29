import { Chip, Grid, Paper, Stack, Typography } from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { StatCard } from '../../components/common/StatCard';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { RoleGuard } from '../../components/common/RoleGuard';
import { useHealth } from '../../hooks/useHealth';
import { useProviderHealth } from '../../hooks/useProviders';

function statusColor(healthy: boolean): 'success' | 'error' {
  return healthy ? 'success' : 'error';
}

function providerStatusColor(status: string): 'success' | 'warning' | 'error' | 'default' {
  const normalized = status.toLowerCase();
  if (normalized === 'healthy') return 'success';
  if (normalized === 'unavailable' || normalized === 'authentication_failed') return 'error';
  if (normalized === 'maintenance' || normalized === 'rate_limited') return 'warning';
  return 'default';
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function HealthMonitoringPage() {
  const healthQuery = useHealth();
  const providerHealthQuery = useProviderHealth();

  return (
    <RoleGuard adminOnly>
      <PageHeader
        title="Health Monitoring"
        description="Backend and provider health, refreshed automatically every 30 seconds."
      />

      {healthQuery.error ? (
        <ErrorState error={healthQuery.error} onRetry={() => healthQuery.refetch()} />
      ) : (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Overall Status"
              value={healthQuery.data ? healthQuery.data.status : '—'}
              isLoading={healthQuery.isLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Backend Version"
              value={healthQuery.data?.version ?? '—'}
              isLoading={healthQuery.isLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Application Uptime"
              value={healthQuery.data ? formatUptime(healthQuery.data.uptimeSeconds) : '—'}
              isLoading={healthQuery.isLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">Database</Typography>
                  <Chip
                    size="small"
                    label={healthQuery.data?.database ? 'Up' : 'Down'}
                    color={healthQuery.data ? statusColor(healthQuery.data.database) : 'default'}
                  />
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">Redis</Typography>
                  <Chip
                    size="small"
                    label={healthQuery.data?.redis ? 'Up' : 'Down'}
                    color={healthQuery.data ? statusColor(healthQuery.data.redis) : 'default'}
                  />
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      )}

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Provider availability
        </Typography>
        {providerHealthQuery.error ? (
          <ErrorState
            error={providerHealthQuery.error}
            onRetry={() => providerHealthQuery.refetch()}
          />
        ) : !providerHealthQuery.isLoading && (providerHealthQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No providers registered"
            description="No content provider is registered yet."
          />
        ) : (
          <Stack spacing={1.5}>
            {providerHealthQuery.data?.map((provider) => (
              <Stack
                key={provider.providerId}
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography variant="body2">{provider.providerId}</Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    {provider.latencyMs} ms · checked{' '}
                    {new Date(provider.lastCheckedAt).toLocaleTimeString()}
                  </Typography>
                  <Chip
                    size="small"
                    label={provider.status}
                    color={providerStatusColor(provider.status)}
                  />
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>
    </RoleGuard>
  );
}

export default HealthMonitoringPage;
