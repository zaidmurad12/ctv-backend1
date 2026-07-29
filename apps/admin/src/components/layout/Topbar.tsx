import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useRouter } from 'next/router';
import {
  AppBar,
  Avatar,
  Box,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeModeContext';
import { roleLabel } from '../../lib/permissions';
import { SIDEBAR_WIDTH } from './Sidebar';

export interface TopbarProps {
  readonly onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { mode, toggleMode } = useThemeMode();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [searchValue, setSearchValue] = useState('');

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && searchValue.trim()) {
      void router.push(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  }

  return (
    <AppBar
      position="fixed"
      color="inherit"
      sx={{
        width: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
        ml: { md: `${SIDEBAR_WIDTH}px` },
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ gap: 1 }}>
        <IconButton
          edge="start"
          onClick={onMenuClick}
          sx={{ display: { md: 'none' } }}
          aria-label="Open navigation"
        >
          <MenuIcon />
        </IconButton>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'action.hover',
            borderRadius: 2,
            px: 1.5,
            py: 0.5,
            flexGrow: 1,
            maxWidth: 420,
          }}
        >
          <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <InputBase
            placeholder="Search movies, shows…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            fullWidth
            inputProps={{ 'aria-label': 'Global search' }}
          />
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
          <IconButton onClick={toggleMode} aria-label="Toggle color theme">
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
        </Tooltip>

        <Tooltip title={user ? `${user.username} (${roleLabel(user.role)})` : ''}>
          <IconButton
            onClick={(event) => setAnchorEl(event.currentTarget)}
            aria-label="Account menu"
          >
            <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>
              {user?.username.slice(0, 2).toUpperCase()}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2">{user?.username}</Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.email} · {user ? roleLabel(user.role) : ''}
            </Typography>
          </Box>
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              void logout();
            }}
          >
            Log out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
