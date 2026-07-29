import { useRouter } from 'next/router';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Box, CircularProgress, List, ListItemButton, ListItemText, Paper } from '@mui/material';
import { PageHeader } from '../../../../components/common/PageHeader';
import { EmptyState } from '../../../../components/common/EmptyState';
import { ErrorState } from '../../../../components/common/ErrorState';
import { seasonsService } from '../../../../services/seasonsEpisodesService';

function SeasonDetailPage() {
  const router = useRouter();
  const seasonId = typeof router.query.seasonId === 'string' ? router.query.seasonId : undefined;

  const seasonQuery = useQuery({
    queryKey: ['seasons', seasonId],
    queryFn: () => seasonsService.getById(seasonId!),
    enabled: Boolean(seasonId),
  });

  if (seasonQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (seasonQuery.error) {
    return <ErrorState error={seasonQuery.error} onRetry={() => seasonQuery.refetch()} />;
  }

  const season = seasonQuery.data;
  if (!season) return undefined;

  return (
    <>
      <PageHeader
        title={season.name ?? `Season ${season.seasonNumber}`}
        description={season.overview ?? undefined}
      />

      {season.episodes.length === 0 ? (
        <EmptyState
          title="No episodes"
          description="No episodes have been imported for this season."
        />
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {season.episodes.map((episode) => (
              <ListItemButton
                key={episode.id}
                component={Link}
                href={`/episodes/${episode.id}`}
                divider
              >
                <ListItemText
                  primary={`${episode.episodeNumber}. ${episode.title}`}
                  secondary={episode.runtime ? `${episode.runtime} min` : undefined}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </>
  );
}

export default SeasonDetailPage;
