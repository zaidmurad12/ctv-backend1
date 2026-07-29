import type { ReactNode } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { CardSkeleton } from './LoadingSkeleton';

export interface StatCardProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly icon?: ReactNode;
  readonly isLoading?: boolean;
}

export function StatCard({ label, value, icon, isLoading }: StatCardProps) {
  if (isLoading) {
    return <CardSkeleton height={96} />;
  }

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}
    >
      {icon ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: 'action.hover',
            color: 'primary.main',
          }}
        >
          {icon}
        </Box>
      ) : undefined}
      <Box>
        <Typography variant="h5" fontWeight={600}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
    </Paper>
  );
}
