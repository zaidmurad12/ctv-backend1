import { Box, Skeleton } from '@mui/material';

export function TableSkeleton({
  columns,
  rows = 5,
}: {
  readonly columns: number;
  readonly rows?: number;
}) {
  return (
    <Box sx={{ px: 2, py: 1 }}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <Box key={rowIndex} sx={{ display: 'flex', gap: 2, py: 1 }}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Box key={colIndex} sx={{ flex: 1 }}>
              <Skeleton variant="text" height={28} />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

export function CardSkeleton({ height = 120 }: { readonly height?: number }) {
  return <Skeleton variant="rounded" height={height} sx={{ width: '100%' }} />;
}
