import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type DataTableColumn } from '../../components/common/DataTable';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { RoleGuard } from '../../components/common/RoleGuard';
import { useNotification } from '../../context/NotificationContext';
import { ApiError } from '../../lib/apiError';
import { roleLabel } from '../../lib/permissions';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { usersService } from '../../services/usersService';
import type { UserResponseDto, UserRole } from '../../services/types';

const ROLES: UserRole[] = ['ADMIN', 'EDITOR', 'VIEWER'];

const createUserSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  username: z.string().min(3, 'At least 3 characters'),
  password: z.string().min(12, 'At least 12 characters'),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
});
type CreateUserValues = z.infer<typeof createUserSchema>;

function notifyResult(
  notify: (message: string, severity?: 'success' | 'info' | 'error') => void,
  error: unknown,
  fallback: string,
) {
  if (error instanceof ApiError && error.isNotImplemented) {
    notify('This action isn’t available yet — the backend doesn’t expose it.', 'info');
  } else {
    notify(error instanceof Error ? error.message : fallback, 'error');
  }
}

function UsersPage() {
  const { notify } = useNotification();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<UserResponseDto | undefined>(undefined);
  const [editRole, setEditRole] = useState<UserRole>('VIEWER');
  const [editActive, setEditActive] = useState(true);
  const [deletingUser, setDeletingUser] = useState<UserResponseDto | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);

  const query = usePaginatedQuery<UserResponseDto>({
    queryKey: ['users'],
    fetcher: (params) => usersService.list(params),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      usersService.updateUser(editingUser!.id, { role: editRole, isActive: editActive }),
    onSuccess: () => {
      notify('User updated.', 'success');
      setEditingUser(undefined);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => notifyResult(notify, error, 'Failed to update user.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => usersService.deleteUser(deletingUser!.id),
    onSuccess: () => {
      notify('User deleted.', 'success');
      setDeletingUser(undefined);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      notifyResult(notify, error, 'Failed to delete user.');
      setDeletingUser(undefined);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => usersService.resetPassword(id),
    onSuccess: () => notify('Password reset email sent.', 'success'),
    onError: (error) => notifyResult(notify, error, 'Failed to reset password.'),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateUserValues) => usersService.createUser(values),
    onSuccess: () => {
      notify('User created.', 'success');
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => notifyResult(notify, error, 'Failed to create user.'),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'VIEWER' },
  });

  function openEdit(user: UserResponseDto) {
    setEditingUser(user);
    setEditRole(user.role);
    setEditActive(user.isActive);
  }

  const columns: DataTableColumn<UserResponseDto>[] = [
    { key: 'username', label: 'Username', render: (row) => row.username },
    { key: 'email', label: 'Email', render: (row) => row.email },
    { key: 'role', label: 'Role', render: (row) => roleLabel(row.role) },
    {
      key: 'isActive',
      label: 'Status',
      render: (row) => (
        <Chip
          size="small"
          label={row.isActive ? 'Active' : 'Disabled'}
          color={row.isActive ? 'success' : 'default'}
        />
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
    { key: 'lastLogin', label: 'Last Login', render: () => '—' },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Edit user">
            <IconButton size="small" onClick={() => openEdit(row)}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset password">
            <IconButton size="small" onClick={() => resetPasswordMutation.mutate(row.id)}>
              <LockResetOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete user">
            <IconButton size="small" onClick={() => setDeletingUser(row)}>
              <DeleteOutlineOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <RoleGuard adminOnly>
      <PageHeader
        title="Users"
        description="Manage user accounts, roles, and access."
        actions={
          <Button
            startIcon={<PersonAddOutlinedIcon />}
            variant="contained"
            onClick={() => setCreateOpen(true)}
          >
            Create User
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={query.items}
        getRowId={(row) => row.id}
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        page={query.page}
        limit={query.limit}
        total={query.meta?.total ?? 0}
        onPageChange={query.setPage}
        onLimitChange={query.onLimitChange}
        search={query.search}
        onSearchChange={query.onSearchChange}
        searchPlaceholder="Search by email or username…"
        emptyTitle="No users found"
        emptyDescription="No user matches the current search."
      />

      <Dialog
        open={Boolean(editingUser)}
        onClose={() => setEditingUser(undefined)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Edit {editingUser?.username}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            select
            label="Role"
            value={editRole}
            onChange={(event) => setEditRole(event.target.value as UserRole)}
          >
            {ROLES.map((role) => (
              <MenuItem key={role} value={role}>
                {roleLabel(role)}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={editActive}
                onChange={(event) => setEditActive(event.target.checked)}
              />
            }
            label="Active"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingUser(undefined)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingUser)}
        title="Delete user"
        description={`Are you sure you want to delete "${deletingUser?.username}"? This cannot be undone.`}
        confirmLabel="Delete"
        isDestructive
        isSubmitting={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDeletingUser(undefined)}
      />

      <Dialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          reset();
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Create user</DialogTitle>
        <Stack component="form" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
              {...register('email')}
            />
            <TextField
              label="Username"
              error={Boolean(errors.username)}
              helperText={errors.username?.message}
              {...register('username')}
            />
            <TextField
              label="Password"
              type="password"
              error={Boolean(errors.password)}
              helperText={errors.password?.message}
              {...register('password')}
            />
            <TextField select label="Role" defaultValue="VIEWER" {...register('role')}>
              {ROLES.map((role) => (
                <MenuItem key={role} value={role}>
                  {roleLabel(role)}
                </MenuItem>
              ))}
            </TextField>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setCreateOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={createMutation.isPending}>
              Create
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>
    </RoleGuard>
  );
}

export default UsersPage;
