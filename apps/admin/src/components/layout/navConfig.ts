import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import LiveTvOutlinedIcon from '@mui/icons-material/LiveTvOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: SvgIconComponent;
  /** Backend hard-restricts the whole `/admin/*` namespace to ADMIN (see apps/backend AdminController). */
  readonly adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: DashboardOutlinedIcon, adminOnly: true },
  { label: 'Movies', href: '/movies', icon: MovieOutlinedIcon },
  { label: 'TV Shows', href: '/shows', icon: LiveTvOutlinedIcon },
  { label: 'Providers', href: '/providers', icon: DnsOutlinedIcon, adminOnly: true },
  { label: 'Import Jobs', href: '/import-jobs', icon: CloudDownloadOutlinedIcon, adminOnly: true },
  { label: 'Synchronization', href: '/synchronization', icon: SyncOutlinedIcon, adminOnly: true },
  { label: 'Health Monitoring', href: '/health', icon: MonitorHeartOutlinedIcon, adminOnly: true },
  { label: 'Users', href: '/users', icon: PeopleOutlinedIcon, adminOnly: true },
  { label: 'Roles & Permissions', href: '/roles', icon: SecurityOutlinedIcon, adminOnly: true },
  { label: 'Audit Logs', href: '/logs', icon: HistoryOutlinedIcon, adminOnly: true },
  { label: 'Settings', href: '/settings', icon: SettingsOutlinedIcon, adminOnly: true },
];
