import Link from 'next/link';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { RoleGuard } from '../../components/common/RoleGuard';
import { ALL_PERMISSIONS, ROLE_PERMISSION_MATRIX, roleLabel } from '../../lib/permissions';

const PERMISSION_LABELS: Record<string, string> = {
  read: 'Read',
  write: 'Write',
  delete: 'Delete',
  import: 'Import',
  synchronization: 'Synchronization',
  systemSettings: 'System Settings',
  users: 'Users',
  providers: 'Providers',
};

function RolesPage() {
  return (
    <RoleGuard adminOnly>
      <PageHeader
        title="Roles & Permissions"
        description="The fixed Administrator / Editor / Viewer role model. Role assignment happens from the Users page."
        actions={
          <Button component={Link} href="/users" variant="outlined">
            Go to Users
          </Button>
        }
      />

      <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Roles are a fixed set on the backend (Prisma <code>UserRoleEnum</code>) — there is no
          dynamic role/permission editor. This matrix documents what each role can do today.
        </Typography>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Permission</TableCell>
              {ROLE_PERMISSION_MATRIX.map(({ role }) => (
                <TableCell key={role} align="center">
                  {roleLabel(role)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {ALL_PERMISSIONS.map((permission) => (
              <TableRow key={permission}>
                <TableCell>{PERMISSION_LABELS[permission]}</TableCell>
                {ROLE_PERMISSION_MATRIX.map(({ role, permissions }) => (
                  <TableCell key={role} align="center">
                    {permissions.includes(permission) ? (
                      <Chip size="small" color="success" label="Yes" />
                    ) : (
                      <Chip size="small" label="No" />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 2 }}>
        <Stack spacing={1}>
          {ROLE_PERMISSION_MATRIX.map(({ role }) => (
            <Typography key={role} variant="caption" color="text.secondary">
              <strong>{roleLabel(role)}</strong>
              {role === 'ADMIN'
                ? ' — full access to every /admin/* endpoint (users, providers, dashboard, and every section on this sidebar).'
                : ' — the backend restricts every /admin/* route to ADMIN, so this role can browse the catalog and search but cannot access Providers, Users, Import Jobs, Synchronization, Health Monitoring, Audit Logs, or Settings.'}
            </Typography>
          ))}
        </Stack>
      </Box>
    </RoleGuard>
  );
}

export default RolesPage;
