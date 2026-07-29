import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import LiveTvOutlinedIcon from '@mui/icons-material/LiveTvOutlined';
import TheatersOutlinedIcon from '@mui/icons-material/TheatersOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Box, Chip, Grid, Paper, Typography } from '@mui/material';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { RoleGuard } from '../components/common/RoleGuard';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useProviderHealth } from '../hooks/useProviders';

function statusColor(status: string): 'success' | 'warning' | 'error' | 'default' {
  const normalized = status.toLowerCase();
  if (normalized === 'healthy') return 'success';
  if (normalized === 'unavailable' || normalized === 'authentication_failed') return 'error';
  if (normalized === 'maintenance' || normalized === 'rate_limited') return 'warning';
  return 'default';
}

function DashboardPage() {
  const stats = useDashboardStats();
  const providerHealth = useProviderHealth();

  const chartData = stats.data
    ? [
        { name: 'Movies', total: stats.data.movies },
        { name: 'Shows', total: stats.data.shows },
        { name: 'Episodes', total: stats.data.episodes },
      ]
    : [];

  return (
    <RoleGuard adminOnly>
      <PageHeader
        title="Dashboard"
        description="Catalog composition, user base, and provider health at a glance."
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Total Movies"
            value={stats.data?.movies ?? '—'}
            icon={<MovieOutlinedIcon />}
            isLoading={stats.isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Total TV Shows"
            value={stats.data?.shows ?? '—'}
            icon={<LiveTvOutlinedIcon />}
            isLoading={stats.isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Total Episodes"
            value={stats.data?.episodes ?? '—'}
            icon={<TheatersOutlinedIcon />}
            isLoading={stats.isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Total Users"
            value={stats.data?.users ?? '—'}
            icon={<PeopleOutlinedIcon />}
            isLoading={stats.isLoading}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Catalog composition
            </Typography>
            {stats.error ? (
              <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
            ) : (
              <Box sx={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#3f6fd8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Provider status
            </Typography>
            {providerHealth.error ? (
              <ErrorState error={providerHealth.error} onRetry={() => providerHealth.refetch()} />
            ) : !providerHealth.isLoading && (providerHealth.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No providers registered"
                description="No content provider is registered yet, so there is nothing to report on."
              />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {providerHealth.data?.map((provider) => (
                  <Box
                    key={provider.providerId}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <Typography variant="body2">{provider.providerId}</Typography>
                    <Chip
                      size="small"
                      label={provider.status}
                      color={statusColor(provider.status)}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Recent imports
            </Typography>
            <EmptyState
              title="Import history isn't tracked yet"
              description="See the Import Jobs page — this will populate once the backend persists job history."
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Recent errors
            </Typography>
            <EmptyState
              title="Error history isn't tracked yet"
              description="See the Audit Logs page — this will populate once the backend exposes an errors feed."
            />
          </Paper>
        </Grid>
      </Grid>
    </RoleGuard>
  );
}

export default DashboardPage;
