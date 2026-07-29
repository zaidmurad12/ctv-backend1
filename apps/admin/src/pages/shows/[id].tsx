import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Chip,
  CircularProgress,
  Grid,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { showsService } from '../../services/showsService';

const TABS = ['General', 'Seasons', 'Provider Info', 'Logs'] as const;

function ShowDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const [tab, setTab] = useState(0);

  const showQuery = useQuery({
    queryKey: ['shows', id],
    queryFn: () => showsService.getById(id!),
    enabled: Boolean(id),
  });

  if (showQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (showQuery.error) {
    return <ErrorState error={showQuery.error} onRetry={() => showQuery.refetch()} />;
  }

  const show = showQuery.data;
  if (!show) return undefined;

  return (
    <>
      <PageHeader
        title={show.title}
        description={
          show.originalTitle && show.originalTitle !== show.title ? show.originalTitle : undefined
        }
        actions={
          <Chip label={show.status} color={show.status === 'PUBLISHED' ? 'success' : 'default'} />
        }
      />

      <Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ mb: 2 }}>
        {TABS.map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>

      {tab === 0 ? (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Release Date
              </Typography>
              <Typography variant="body1">{show.releaseDate ?? '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Rating
              </Typography>
              <Typography variant="body1">{show.rating?.toFixed(1) ?? '—'}</Typography>
            </Grid>
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">
                Overview
              </Typography>
              <Typography variant="body1">{show.overview ?? '—'}</Typography>
            </Grid>
          </Grid>
        </Paper>
      ) : undefined}

      {tab === 1 ? (
        show.seasons.length === 0 ? (
          <EmptyState
            title="No seasons"
            description="No seasons have been imported for this show."
          />
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {show.seasons.map((season) => (
                <ListItemButton
                  key={season.id}
                  component={Link}
                  href={`/shows/${show.id}/seasons/${season.id}`}
                  divider
                >
                  <ListItemText
                    primary={season.name ?? `Season ${season.seasonNumber}`}
                    secondary={`${season.episodeCount} episode${season.episodeCount === 1 ? '' : 's'}`}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )
      ) : undefined}

      {tab === 2 ? (
        <EmptyState
          title="Provider information isn't exposed yet"
          description="No endpoint returns per-title provider links yet."
        />
      ) : undefined}

      {tab === 3 ? (
        <EmptyState
          title="Per-title logs aren't exposed yet"
          description="See the Audit Logs page once the backend exposes a logs API."
        />
      ) : undefined}
    </>
  );
}

export default ShowDetailPage;
