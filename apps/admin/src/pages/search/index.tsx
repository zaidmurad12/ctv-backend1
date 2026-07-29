import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import LiveTvOutlinedIcon from '@mui/icons-material/LiveTvOutlined';
import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { searchService } from '../../services/searchService';

function SearchPage() {
  const router = useRouter();
  const initialQuery = typeof router.query.q === 'string' ? router.query.q : '';
  const [term, setTerm] = useState(initialQuery);
  const debouncedTerm = useDebouncedValue(term, 300);

  const searchQuery = useQuery({
    queryKey: ['search', 'global', debouncedTerm],
    queryFn: () => searchService.search(debouncedTerm, { limit: 30 }),
    enabled: debouncedTerm.trim().length >= 2,
  });

  return (
    <>
      <PageHeader
        title="Search"
        description="Search across movies and TV shows. Providers, users, import jobs, and logs each have their own dedicated search on their pages."
      />

      <TextField
        fullWidth
        autoFocus
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search movies and TV shows…"
        sx={{ mb: 3, maxWidth: 480 }}
      />

      {debouncedTerm.trim().length < 2 ? (
        <EmptyState
          title="Type to search"
          description="Enter at least 2 characters to search the catalog."
        />
      ) : searchQuery.error ? (
        <ErrorState error={searchQuery.error} onRetry={() => searchQuery.refetch()} />
      ) : !searchQuery.isLoading && (searchQuery.data?.items.length ?? 0) === 0 ? (
        <EmptyState title="No results" description={`Nothing matches "${debouncedTerm}".`} />
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {searchQuery.data?.items.map((item) => (
              <ListItemButton
                key={`${item.type}-${item.id}`}
                divider
                onClick={() =>
                  router.push(item.type === 'movie' ? `/movies/${item.id}` : `/shows/${item.id}`)
                }
              >
                <ListItemAvatar>
                  <Avatar src={item.poster ?? undefined} variant="rounded">
                    {item.type === 'movie' ? <MovieOutlinedIcon /> : <LiveTvOutlinedIcon />}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={item.title}
                  secondary={
                    <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
                      {item.type}
                    </Typography>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </>
  );
}

export default SearchPage;
