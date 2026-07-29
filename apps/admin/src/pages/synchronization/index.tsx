import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Grid, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined';
import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { StatCard } from '../../components/common/StatCard';
import { EmptyState } from '../../components/common/EmptyState';
import { RoleGuard } from '../../components/common/RoleGuard';
import { useNotification } from '../../context/NotificationContext';
import { ApiError } from '../../lib/apiError';
import { useProviders } from '../../hooks/useProviders';
import { providersService } from '../../services/providersService';
import { synchronizationService } from '../../services/synchronizationService';

function SynchronizationPage() {
  const { notify } = useNotification();
  const queryClient = useQueryClient();
  const providersQuery = useProviders();
  const [selectedProviderId, setSelectedProviderId] = useState('');

  const statusQuery = useQuery({
    queryKey: ['synchronization', 'status'],
    queryFn: () => synchronizationService.getStatus(),
    retry: false,
  });

  function runStubAction(action: () => Promise<unknown>, label: string) {
    return async () => {
      try {
        await action();
        notify(`${label} started.`, 'success');
      } catch (error) {
        if (error instanceof ApiError && error.isNotImplemented) {
          notify(`${label} isn’t available yet — the backend doesn’t expose it.`, 'info');
        } else {
          notify(error instanceof Error ? error.message : 'Action failed.', 'error');
        }
      }
    };
  }

  const fullSyncMutation = useMutation({
    mutationFn: runStubAction(synchronizationService.startFullSync, 'Full sync'),
  });
  const incrementalSyncMutation = useMutation({
    mutationFn: runStubAction(synchronizationService.startIncrementalSync, 'Incremental sync'),
  });
  const refreshMetadataMutation = useMutation({
    mutationFn: runStubAction(synchronizationService.refreshMetadata, 'Metadata refresh'),
  });
  const refreshArtworkMutation = useMutation({
    mutationFn: runStubAction(synchronizationService.refreshArtwork, 'Artwork refresh'),
  });
  const refreshStreamsMutation = useMutation({
    mutationFn: runStubAction(synchronizationService.refreshStreams, 'Stream refresh'),
  });
  const refreshSubtitlesMutation = useMutation({
    mutationFn: runStubAction(synchronizationService.refreshSubtitles, 'Subtitle refresh'),
  });
  const validateLibraryMutation = useMutation({
    mutationFn: runStubAction(synchronizationService.validateLibrary, 'Library validation'),
  });

  const discoverMutation = useMutation({
    mutationFn: async (providerId: string) => providersService.triggerDiscovery(providerId),
    onSuccess: (result) => {
      notify(`Discovery run completed — ${result.discovered} item(s) discovered.`, 'success');
      void queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
    onError: (error: unknown) => {
      notify(error instanceof Error ? error.message : 'Discovery failed.', 'error');
    },
  });

  const actions = [
    { label: 'Start Full Sync', mutation: fullSyncMutation },
    { label: 'Start Incremental Sync', mutation: incrementalSyncMutation },
    { label: 'Refresh Metadata', mutation: refreshMetadataMutation },
    { label: 'Refresh Artwork', mutation: refreshArtworkMutation },
    { label: 'Refresh Streams', mutation: refreshStreamsMutation },
    { label: 'Refresh Subtitles', mutation: refreshSubtitlesMutation },
    { label: 'Validate Library', mutation: validateLibraryMutation },
  ];

  return (
    <RoleGuard adminOnly>
      <PageHeader
        title="Synchronization"
        description="Trigger catalog synchronization and monitor queue progress."
      />

      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Manual discovery (real)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Triggers a real discovery run against a registered provider via the Milestone 5 Admin API.
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Select
            size="small"
            displayEmpty
            value={selectedProviderId}
            onChange={(event) => setSelectedProviderId(event.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="" disabled>
              Select a provider…
            </MenuItem>
            {(providersQuery.data ?? []).map((provider) => (
              <MenuItem key={provider.id} value={provider.id}>
                {provider.name}
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="contained"
            startIcon={<PlayCircleOutlineOutlinedIcon />}
            disabled={!selectedProviderId || discoverMutation.isPending}
            onClick={() => discoverMutation.mutate(selectedProviderId)}
          >
            Trigger Discovery
          </Button>
        </Stack>
        {(providersQuery.data ?? []).length === 0 && !providersQuery.isLoading ? (
          <EmptyState
            title="No providers registered"
            description="No content provider is registered yet, so there is nothing to synchronize."
          />
        ) : undefined}
      </Paper>

      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Sync controls
      </Typography>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="outlined"
            disabled={action.mutation.isPending}
            onClick={() => action.mutation.mutate()}
          >
            {action.label}
          </Button>
        ))}
      </Stack>

      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Queue monitoring
      </Typography>
      {statusQuery.error ? (
        <EmptyState
          title="Synchronization status isn't available yet"
          description="The backend doesn't expose queue size, current job, or progress reporting yet."
        />
      ) : (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Queue Size"
              value={statusQuery.data?.queueSize ?? '—'}
              isLoading={statusQuery.isLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Estimated Time"
              value={
                statusQuery.data?.estimatedSecondsRemaining
                  ? `${statusQuery.data.estimatedSecondsRemaining}s`
                  : '—'
              }
              isLoading={statusQuery.isLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Completed"
              value={statusQuery.data?.completed ?? '—'}
              isLoading={statusQuery.isLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              label="Failed"
              value={statusQuery.data?.failed ?? '—'}
              isLoading={statusQuery.isLoading}
            />
          </Grid>
        </Grid>
      )}
    </RoleGuard>
  );
}

export default SynchronizationPage;
