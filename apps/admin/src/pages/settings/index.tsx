import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { RoleGuard } from '../../components/common/RoleGuard';
import { useNotification } from '../../context/NotificationContext';
import { ApiError } from '../../lib/apiError';
import { settingsService } from '../../services/settingsService';

const settingsSchema = z.object({
  general: z.object({
    applicationName: z.string().min(1, 'Required'),
    applicationVersion: z.string().min(1, 'Required'),
    defaultLanguage: z.string().min(2, 'Required'),
    defaultTheme: z.enum(['light', 'dark']),
  }),
  providers: z.object({
    enableProviders: z.boolean(),
    providerPriority: z.string(),
    retryPolicy: z.string().min(1, 'Required'),
    timeoutMs: z.coerce.number().int().min(1000, 'At least 1000ms'),
  }),
  import: z.object({
    maximumConcurrentJobs: z.coerce.number().int().min(1),
    maximumRetries: z.coerce.number().int().min(0),
    synchronizationSchedule: z.string().min(1, 'Required'),
    metadataRefreshIntervalMinutes: z.coerce.number().int().min(1),
  }),
  player: z.object({
    defaultSubtitle: z.string(),
    defaultQuality: z.string().min(1, 'Required'),
    defaultAudio: z.string(),
    resumePlayback: z.boolean(),
  }),
  search: z.object({
    minimumCharacters: z.coerce.number().int().min(1),
    maximumResults: z.coerce.number().int().min(1),
    cacheDurationSeconds: z.coerce.number().int().min(0),
    trendingCount: z.coerce.number().int().min(0),
  }),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

const DEFAULT_VALUES: SettingsFormValues = {
  general: {
    applicationName: 'CTV Platform',
    applicationVersion: '1.0.0',
    defaultLanguage: 'en',
    defaultTheme: 'dark',
  },
  providers: {
    enableProviders: true,
    providerPriority: '',
    retryPolicy: 'exponential-backoff',
    timeoutMs: 15000,
  },
  import: {
    maximumConcurrentJobs: 5,
    maximumRetries: 3,
    synchronizationSchedule: '0 * * * *',
    metadataRefreshIntervalMinutes: 1440,
  },
  player: {
    defaultSubtitle: 'en',
    defaultQuality: 'auto',
    defaultAudio: 'en',
    resumePlayback: true,
  },
  search: {
    minimumCharacters: 2,
    maximumResults: 50,
    cacheDurationSeconds: 300,
    trendingCount: 20,
  },
};

function SettingsPage() {
  const { notify } = useNotification();
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.get(),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      reset({
        ...settingsQuery.data,
        providers: {
          ...settingsQuery.data.providers,
          providerPriority: settingsQuery.data.providers.providerPriority.join(', '),
        },
      });
    }
  }, [settingsQuery.data, reset]);

  const updateMutation = useMutation({
    mutationFn: (values: SettingsFormValues) =>
      settingsService.update({
        ...values,
        providers: {
          ...values.providers,
          providerPriority: values.providers.providerPriority
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => notify('Settings saved.', 'success'),
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.isNotImplemented) {
        notify(
          'Settings aren’t persisted yet — the backend doesn’t expose a Settings API.',
          'info',
        );
      } else {
        notify(error instanceof Error ? error.message : 'Failed to save settings.', 'error');
      }
    },
  });

  const notConnected =
    settingsQuery.error instanceof ApiError && settingsQuery.error.isNotImplemented;

  return (
    <RoleGuard adminOnly>
      <PageHeader
        title="Application Settings"
        description="General, provider, import, player, and search configuration."
      />

      {notConnected ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          The backend doesn't expose a Settings API yet, so these are local defaults — saving will
          confirm once it does.
        </Alert>
      ) : undefined}

      <Box component="form" onSubmit={handleSubmit((values) => updateMutation.mutate(values))}>
        <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            General
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Application Name"
                error={Boolean(errors.general?.applicationName)}
                helperText={errors.general?.applicationName?.message}
                {...register('general.applicationName')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Application Version"
                {...register('general.applicationVersion')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Default Language"
                {...register('general.defaultLanguage')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                label="Default Theme"
                defaultValue={DEFAULT_VALUES.general.defaultTheme}
                {...register('general.defaultTheme')}
              >
                <MenuItem value="light">Light</MenuItem>
                <MenuItem value="dark">Dark</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Provider Settings
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    defaultChecked={DEFAULT_VALUES.providers.enableProviders}
                    {...register('providers.enableProviders')}
                  />
                }
                label="Enable Providers"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Retry Policy" {...register('providers.retryPolicy')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Timeout (ms)"
                error={Boolean(errors.providers?.timeoutMs)}
                helperText={errors.providers?.timeoutMs?.message}
                {...register('providers.timeoutMs')}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Provider Priority"
                helperText="Comma-separated provider IDs, highest priority first"
                {...register('providers.providerPriority')}
              />
            </Grid>
          </Grid>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Import Settings
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Maximum Concurrent Jobs"
                {...register('import.maximumConcurrentJobs')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Maximum Retries"
                {...register('import.maximumRetries')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Synchronization Schedule (cron)"
                {...register('import.synchronizationSchedule')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Metadata Refresh Interval (minutes)"
                {...register('import.metadataRefreshIntervalMinutes')}
              />
            </Grid>
          </Grid>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Player Settings
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Default Subtitle"
                {...register('player.defaultSubtitle')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Default Quality" {...register('player.defaultQuality')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Default Audio" {...register('player.defaultAudio')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    defaultChecked={DEFAULT_VALUES.player.resumePlayback}
                    {...register('player.resumePlayback')}
                  />
                }
                label="Resume Playback"
              />
            </Grid>
          </Grid>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Search Settings
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Minimum Characters"
                {...register('search.minimumCharacters')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Maximum Results"
                {...register('search.maximumResults')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Cache Duration (seconds)"
                {...register('search.cacheDurationSeconds')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Trending Count"
                {...register('search.trendingCount')}
              />
            </Grid>
          </Grid>
        </Paper>

        <Button type="submit" variant="contained" size="large" disabled={updateMutation.isPending}>
          Save Settings
        </Button>
      </Box>
    </RoleGuard>
  );
}

export default SettingsPage;
