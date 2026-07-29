import type { ReactElement } from 'react';
import Link from 'next/link';
import type { NextPageContext } from 'next';
import { Box, Button, Typography } from '@mui/material';
import type { NextPageWithLayout } from './_app';

interface ErrorPageProps {
  readonly statusCode?: number;
}

const ErrorPage: NextPageWithLayout<ErrorPageProps> = ({ statusCode }) => (
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
      {statusCode ?? 500}
    </Typography>
    <Typography variant="h6">Something went wrong</Typography>
    <Typography variant="body2" color="text.secondary">
      An unexpected error occurred. Please try again.
    </Typography>
    <Button component={Link} href="/" variant="contained">
      Back to dashboard
    </Button>
  </Box>
);

ErrorPage.getInitialProps = ({ res, err }: NextPageContext): ErrorPageProps => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

ErrorPage.getLayout = (page: ReactElement) => page;

export default ErrorPage;
