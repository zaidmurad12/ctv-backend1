import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        py: 6,
        px: 3,
        textAlign: 'center',
        color: 'text.secondary',
      }}
    >
      {icon ?? <InboxOutlinedIcon sx={{ fontSize: 40, opacity: 0.5 }} />}
      <Typography variant="subtitle1" color="text.primary">
        {title}
      </Typography>
      {description ? <Typography variant="body2">{description}</Typography> : undefined}
      {action}
    </Box>
  );
}
