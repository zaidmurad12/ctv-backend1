import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        mb: 3,
      }}
    >
      <Box>
        <Typography variant="h5" fontWeight={600}>
          {title}
        </Typography>
        {description ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        ) : undefined}
      </Box>
      {actions ? (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>
      ) : undefined}
    </Box>
  );
}
