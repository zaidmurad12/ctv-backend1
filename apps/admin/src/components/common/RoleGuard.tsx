import type { ReactNode } from 'react';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from '../../context/AuthContext';
import { hasPermission, isAdmin, type Permission } from '../../lib/permissions';
import { EmptyState } from './EmptyState';

export interface RoleGuardProps {
  readonly children: ReactNode;
  /** Set for `/admin/*`-backed sections, which the backend hard-restricts to ADMIN. */
  readonly adminOnly?: boolean;
  readonly permission?: Permission;
}

export function RoleGuard({ children, adminOnly = false, permission }: RoleGuardProps) {
  const { user } = useAuth();

  const allowed = adminOnly
    ? isAdmin(user?.role)
    : permission
      ? hasPermission(user?.role, permission)
      : true;

  if (!allowed) {
    return (
      <EmptyState
        icon={<LockOutlinedIcon sx={{ fontSize: 40, opacity: 0.5 }} />}
        title="Access denied"
        description="Your role doesn't have permission to view this section."
      />
    );
  }

  return <>{children}</>;
}
