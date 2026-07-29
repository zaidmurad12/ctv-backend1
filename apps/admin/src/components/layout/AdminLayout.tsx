import type { ReactNode } from 'react';
import { useState } from 'react';
import { Box, CircularProgress, Toolbar } from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import { Sidebar, SIDEBAR_WIDTH } from './Sidebar';
import { Topbar } from './Topbar';

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading || !user) {
    return (
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Topbar onMenuClick={() => setMobileOpen(true)} />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
          minWidth: 0,
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <Toolbar />
        <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
