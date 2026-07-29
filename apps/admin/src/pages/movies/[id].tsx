import { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Card,
  CardMedia,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { moviesService } from '../../services/moviesService';

const TABS = [
  'General',
  'Streams',
  'Subtitles',
  'Images',
  'Cast & Crew',
  'Provider Info',
  'Sync History',
  'Logs',
] as const;

function MovieDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const [tab, setTab] = useState(0);

  const movieQuery = useQuery({
    queryKey: ['movies', id],
    queryFn: () => moviesService.getById(id!),
    enabled: Boolean(id),
  });

  if (movieQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (movieQuery.error) {
    return <ErrorState error={movieQuery.error} onRetry={() => movieQuery.refetch()} />;
  }

  const movie = movieQuery.data;
  if (!movie) return undefined;

  return (
    <>
      <PageHeader
        title={movie.title}
        description={
          movie.originalTitle && movie.originalTitle !== movie.title
            ? movie.originalTitle
            : undefined
        }
        actions={
          <Chip label={movie.status} color={movie.status === 'PUBLISHED' ? 'success' : 'default'} />
        }
      />

      <Tabs
        value={tab}
        onChange={(_event, value) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2 }}
      >
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
              <Typography variant="body1">{movie.releaseDate ?? '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Rating
              </Typography>
              <Typography variant="body1">{movie.rating?.toFixed(1) ?? '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Runtime
              </Typography>
              <Typography variant="body1">
                {movie.runtime ? `${movie.runtime} min` : '—'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Tagline
              </Typography>
              <Typography variant="body1">{movie.tagline ?? '—'}</Typography>
            </Grid>
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">
                Overview
              </Typography>
              <Typography variant="body1">{movie.overview ?? '—'}</Typography>
            </Grid>
          </Grid>
        </Paper>
      ) : undefined}

      {tab === 1 ? (
        movie.streams.length === 0 ? (
          <EmptyState title="No streams" description="This movie has no active streams." />
        ) : (
          <Stack spacing={1}>
            {movie.streams.map((stream) => (
              <Paper
                key={stream.id}
                variant="outlined"
                sx={{
                  p: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Typography variant="body2">
                  {stream.serverName} · {stream.quality} {stream.codec ? `· ${stream.codec}` : ''}
                </Typography>
                {stream.isDefault ? (
                  <Chip size="small" label="Default" color="primary" />
                ) : undefined}
              </Paper>
            ))}
          </Stack>
        )
      ) : undefined}

      {tab === 2 ? (
        movie.subtitles.length === 0 ? (
          <EmptyState title="No subtitles" description="This movie has no subtitles." />
        ) : (
          <Stack spacing={1}>
            {movie.subtitles.map((subtitle) => (
              <Paper
                key={subtitle.id}
                variant="outlined"
                sx={{
                  p: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Typography variant="body2">
                  {subtitle.language} · {subtitle.format}
                </Typography>
                {subtitle.isDefault ? (
                  <Chip size="small" label="Default" color="primary" />
                ) : undefined}
              </Paper>
            ))}
          </Stack>
        )
      ) : undefined}

      {tab === 3 ? (
        <Grid container spacing={2}>
          {Object.entries(movie.artwork).filter(([, url]) => Boolean(url)).length === 0 ? (
            <Grid size={12}>
              <EmptyState
                title="No images"
                description="No artwork has been imported for this movie."
              />
            </Grid>
          ) : (
            Object.entries(movie.artwork)
              .filter(([, url]) => Boolean(url))
              .map(([type, url]) => (
                <Grid key={type} size={{ xs: 6, sm: 4, md: 3 }}>
                  <Card variant="outlined">
                    <CardMedia
                      component="img"
                      image={url}
                      alt={type}
                      sx={{ aspectRatio: '2 / 3', objectFit: 'cover' }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        textAlign: 'center',
                        py: 0.5,
                        textTransform: 'capitalize',
                      }}
                    >
                      {type}
                    </Typography>
                  </Card>
                </Grid>
              ))
          )}
        </Grid>
      ) : undefined}

      {tab === 4 ? (
        <EmptyState
          title="Cast & crew aren't tracked yet"
          description="The domain model has no Person/Company aggregate yet (see Milestone 4's documented scope boundaries)."
        />
      ) : undefined}

      {tab === 5 ? (
        <EmptyState
          title="Provider information isn't exposed yet"
          description="No endpoint returns per-title provider links yet."
        />
      ) : undefined}

      {tab === 6 ? (
        <EmptyState
          title="Synchronization history isn't tracked yet"
          description="See the Synchronization page for platform-wide sync controls."
        />
      ) : undefined}

      {tab === 7 ? (
        <EmptyState
          title="Per-title logs aren't exposed yet"
          description="See the Audit Logs page once the backend exposes a logs API."
        />
      ) : undefined}
    </>
  );
}

export default MovieDetailPage;
