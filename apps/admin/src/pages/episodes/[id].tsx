import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { Box, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { episodesService } from '../../services/seasonsEpisodesService';

function EpisodeDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;

  const episodeQuery = useQuery({
    queryKey: ['episodes', id],
    queryFn: () => episodesService.getById(id!),
    enabled: Boolean(id),
  });

  if (episodeQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (episodeQuery.error) {
    return <ErrorState error={episodeQuery.error} onRetry={() => episodeQuery.refetch()} />;
  }

  const episode = episodeQuery.data;
  if (!episode) return undefined;

  return (
    <>
      <PageHeader
        title={`${episode.episodeNumber}. ${episode.title}`}
        description={episode.overview ?? undefined}
      />

      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Streams
          </Typography>
          {episode.streams.length === 0 ? (
            <EmptyState title="No streams" description="This episode has no active streams." />
          ) : (
            <Stack spacing={1}>
              {episode.streams.map((stream) => (
                <Box
                  key={stream.id}
                  sx={{
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
                </Box>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Subtitles
          </Typography>
          {episode.subtitles.length === 0 ? (
            <EmptyState title="No subtitles" description="This episode has no subtitles." />
          ) : (
            <Stack spacing={1}>
              {episode.subtitles.map((subtitle) => (
                <Box
                  key={subtitle.id}
                  sx={{
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
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>
    </>
  );
}

export default EpisodeDetailPage;
