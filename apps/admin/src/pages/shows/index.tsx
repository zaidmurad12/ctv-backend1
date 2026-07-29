import { useRouter } from 'next/router';
import { MenuItem, Select, Stack } from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type DataTableColumn } from '../../components/common/DataTable';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { showsService } from '../../services/showsService';
import type { CatalogListParams, ShowSummaryDto } from '../../services/types';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'rating', label: 'Rating' },
  { value: 'alphabetical', label: 'Alphabetical' },
];

function ShowsPage() {
  const router = useRouter();
  const query = usePaginatedQuery<ShowSummaryDto, CatalogListParams>({
    queryKey: ['shows'],
    fetcher: (params) => showsService.list(params),
    initialParams: { sort: 'newest', order: 'desc' },
  });

  const columns: DataTableColumn<ShowSummaryDto>[] = [
    { key: 'title', label: 'Title', render: (row) => row.title },
    { key: 'numberOfSeasons', label: 'Seasons', render: (row) => row.numberOfSeasons },
    { key: 'numberOfEpisodes', label: 'Episodes', render: (row) => row.numberOfEpisodes },
    { key: 'rating', label: 'Rating', render: (row) => row.rating?.toFixed(1) ?? '—' },
    { key: 'status', label: 'Status', render: (row) => row.status },
  ];

  return (
    <>
      <PageHeader
        title="TV Shows"
        description="Browse, search, and inspect TV shows imported into the catalog."
      />
      <DataTable
        columns={columns}
        rows={query.items}
        getRowId={(row) => row.id}
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        page={query.page}
        limit={query.limit}
        total={query.meta?.total ?? 0}
        onPageChange={query.setPage}
        onLimitChange={query.onLimitChange}
        search={query.search}
        onSearchChange={query.onSearchChange}
        searchPlaceholder="Search shows by title…"
        onRowClick={(row) => router.push(`/shows/${row.id}`)}
        emptyTitle="No TV shows found"
        emptyDescription="No show matches the current search."
        filters={
          <Stack direction="row" spacing={1}>
            <Select
              size="small"
              value={query.sort ?? 'newest'}
              onChange={(event) => query.onSortChange(event.target.value)}
              sx={{ minWidth: 150 }}
            >
              {SORT_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </Stack>
        }
      />
    </>
  );
}

export default ShowsPage;
