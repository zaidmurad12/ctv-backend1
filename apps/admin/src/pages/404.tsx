import type { ReactElement } from 'react';
import Link from 'next/link';
import { Box, Button, Typography } from '@mui/material';
import type { NextPageWithLayout } from './_app';

const NotFoundPage: NextPageWithLayout = () => (
  <Box
    sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      textAlign: 'center',
      px: 2,
    }}
  >
    <Typography variant="h2" fontWeight={700}>
      404
    </Typography>
    <Typography variant="h6">Page not found</Typography>
    <Typography variant="body2" color="text.secondary">
      The page you're looking for doesn't exist or has moved.
    </Typography>
    <Button component={Link} href="/" variant="contained">
      Back to dashboard
    </Button>
  </Box>
);

NotFoundPage.getLayout = (page: ReactElement) => page;

export default NotFoundPage;
