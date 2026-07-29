import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Box,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import { isAdmin } from '../../lib/permissions';
import { NAV_ITEMS } from './navConfig';

export const SIDEBAR_WIDTH = 260;

export interface SidebarProps {
  readonly mobileOpen: boolean;
  readonly onClose: () => void;
}

function SidebarContent() {
  const router = useRouter();
  const { user } = useAuth();
  const admin = isAdmin(user?.role);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar>
        <Typography variant="h6" fontWeight={700} noWrap>
          CTV Admin
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ flexGrow: 1, py: 1 }}>
        {NAV_ITEMS.filter((item) => !item.adminOnly || admin).map((item) => {
          const isActive =
            item.href === '/' ? router.pathname === '/' : router.pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              selected={isActive}
              sx={{ mx: 1, borderRadius: 1.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  return (
    <Box component="nav" sx={{ width: { md: SIDEBAR_WIDTH }, flexShrink: { md: 0 } }}>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: SIDEBAR_WIDTH },
        }}
      >
        <SidebarContent />
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: SIDEBAR_WIDTH,
            borderRight: '1px solid',
            borderColor: 'divider',
          },
        }}
        open
      >
        <SidebarContent />
      </Drawer>
    </Box>
  );
}
