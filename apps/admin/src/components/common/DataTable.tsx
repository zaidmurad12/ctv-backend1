import type { ReactNode } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { TableSkeleton } from './LoadingSkeleton';
import type { ApiError } from '../../lib/apiError';

export interface DataTableColumn<T> {
  readonly key: string;
  readonly label: string;
  readonly render: (row: T) => ReactNode;
  readonly sortable?: boolean;
  readonly align?: 'left' | 'right' | 'center';
}

export interface DataTableProps<T> {
  readonly columns: DataTableColumn<T>[];
  readonly rows: T[];
  readonly getRowId: (row: T) => string;
  readonly isLoading: boolean;
  readonly error?: Error | null;
  readonly onRetry?: () => void;
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onLimitChange: (limit: number) => void;
  readonly search?: string;
  readonly onSearchChange?: (value: string) => void;
  readonly searchPlaceholder?: string;
  readonly sort?: string;
  readonly order?: 'asc' | 'desc';
  readonly onSortChange?: (sort: string) => void;
  readonly filters?: ReactNode;
  readonly toolbarActions?: ReactNode;
  readonly onRowClick?: (row: T) => void;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly title?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  isLoading,
  error,
  onRetry,
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  sort,
  order = 'asc',
  onSortChange,
  filters,
  toolbarActions,
  onRowClick,
  emptyTitle = 'No results',
  emptyDescription = 'Nothing matches the current filters yet.',
  title,
}: DataTableProps<T>) {
  const showEmpty = !isLoading && !error && rows.length === 0;

  return (
    <Paper variant="outlined">
      <Toolbar sx={{ flexWrap: 'wrap', gap: 2, py: 2 }}>
        {title ? (
          <Typography variant="h6" sx={{ flexGrow: 1, minWidth: 160 }}>
            {title}
          </Typography>
        ) : (
          <Box sx={{ flexGrow: 1 }} />
        )}
        {onSearchChange ? (
          <TextField
            size="small"
            value={search ?? ''}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            sx={{ minWidth: 220 }}
          />
        ) : undefined}
        {filters}
        {toolbarActions}
      </Toolbar>

      {error ? (
        <ErrorState error={error as ApiError} onRetry={onRetry} />
      ) : isLoading ? (
        <TableSkeleton columns={columns.length} />
      ) : showEmpty ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <TableContainer>
          <Table size="medium">
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell key={column.key} align={column.align}>
                    {column.sortable && onSortChange ? (
                      <TableSortLabel
                        active={sort === column.key}
                        direction={sort === column.key ? order : 'asc'}
                        onClick={() => onSortChange(column.key)}
                      >
                        {column.label}
                      </TableSortLabel>
                    ) : (
                      column.label
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  hover={Boolean(onRowClick)}
                  onClick={() => onRowClick?.(row)}
                  sx={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key} align={column.align}>
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <TablePagination
        component="div"
        count={total}
        page={Math.max(page - 1, 0)}
        onPageChange={(_event, newPage) => onPageChange(newPage + 1)}
        rowsPerPage={limit}
        onRowsPerPageChange={(event) => onLimitChange(Number(event.target.value))}
        rowsPerPageOptions={[10, 20, 50, 100]}
      />
    </Paper>
  );
}
