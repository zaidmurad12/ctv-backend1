import { Box, Button, Typography } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ConstructionOutlinedIcon from '@mui/icons-material/ConstructionOutlined';
import { ApiError } from '../../lib/apiError';
import { EmptyState } from './EmptyState';

export interface ErrorStateProps {
  readonly error: Error | ApiError;
  readonly onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  if (error instanceof ApiError && error.isNotImplemented) {
    return (
      <EmptyState
        icon={<ConstructionOutlinedIcon sx={{ fontSize: 40, opacity: 0.5 }} />}
        title="Not available yet"
        description="The backend doesn't expose this endpoint yet. This screen is wired up and will work as soon as it does."
      />
    );
  }

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
      }}
    >
      <ErrorOutlineIcon color="error" sx={{ fontSize: 40 }} />
      <Typography variant="subtitle1">Something went wrong</Typography>
      <Typography variant="body2" color="text.secondary">
        {error.message}
      </Typography>
      {onRetry ? (
        <Button onClick={onRetry} variant="outlined" size="small" sx={{ mt: 1 }}>
          Retry
        </Button>
      ) : undefined}
    </Box>
  );
}
