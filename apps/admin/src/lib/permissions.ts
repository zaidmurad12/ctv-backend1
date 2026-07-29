import type { UserRole } from '../services/types';

/**
 * The fixed Administrator/Editor/Viewer role model and permission matrix
 * from `specification/11-Admin-Dashboard.md.txt` "Roles" /
 * `specification/12-Security.md.txt` "Roles". Roles are a closed enum on
 * the backend (Prisma `UserRoleEnum`) with no dynamic permissions API, so
 * this is static reference data, not a service call.
 */
export type Permission =
  | 'read'
  | 'write'
  | 'delete'
  | 'import'
  | 'synchronization'
  | 'systemSettings'
  | 'users'
  | 'providers';

export const ALL_PERMISSIONS: Permission[] = [
  'read',
  'write',
  'delete',
  'import',
  'synchronization',
  'systemSettings',
  'users',
  'providers',
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  EDITOR: ['read', 'write', 'import'],
  VIEWER: ['read'],
};

export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Every `/admin/*` backend route (users, dashboard, providers) requires the
 * ADMIN role outright (see apps/backend `AdminController`) — unlike the
 * finer-grained permission matrix above, this is a hard backend enforcement,
 * not a UI-only convention. Sections built on top of that namespace (Import
 * Jobs, Synchronization, Roles, Settings, Storage, System, Logs) are gated
 * the same way so the UI never offers an action the backend will 403.
 */
export function isAdmin(role: UserRole | undefined): boolean {
  return role === 'ADMIN';
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Administrator';
    case 'EDITOR':
      return 'Editor';
    case 'VIEWER':
      return 'Viewer';
    default:
      return role;
  }
}

export const ROLE_PERMISSION_MATRIX: ReadonlyArray<{ role: UserRole; permissions: Permission[] }> =
  [
    { role: 'ADMIN', permissions: ROLE_PERMISSIONS.ADMIN },
    { role: 'EDITOR', permissions: ROLE_PERMISSIONS.EDITOR },
    { role: 'VIEWER', permissions: ROLE_PERMISSIONS.VIEWER },
  ];
