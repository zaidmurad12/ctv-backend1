import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReactNode } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { RoleGuard } from '../src/components/common/RoleGuard';
import { AuthContext, type AuthContextValue } from '../src/context/AuthContext';
import type { UserResponseDto, UserRole } from '../src/services/types';

function fakeUser(role: UserRole): UserResponseDto {
  return {
    id: 'u1',
    email: 'u@example.com',
    username: 'u1',
    role,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
}

function renderWithRole(role: UserRole | undefined, ui: ReactNode) {
  const value: AuthContextValue = {
    user: role ? fakeUser(role) : undefined,
    isLoading: false,
    login: async () => {},
    logout: async () => {},
  };
  return render(<AuthContext.Provider value={value}>{ui}</AuthContext.Provider>);
}

test('RoleGuard renders children for an ADMIN when adminOnly is set', () => {
  renderWithRole(
    'ADMIN',
    <RoleGuard adminOnly>
      <div>Admin content</div>
    </RoleGuard>,
  );
  assert.ok(screen.getByText('Admin content'));
  cleanup();
});

test('RoleGuard blocks a VIEWER from an adminOnly section', () => {
  renderWithRole(
    'VIEWER',
    <RoleGuard adminOnly>
      <div>Admin content</div>
    </RoleGuard>,
  );
  assert.equal(screen.queryByText('Admin content'), null);
  assert.ok(screen.getByText('Access denied'));
  cleanup();
});

test('RoleGuard enforces a specific permission for non-admin sections', () => {
  renderWithRole(
    'EDITOR',
    <RoleGuard permission="users">
      <div>Users content</div>
    </RoleGuard>,
  );
  assert.equal(screen.queryByText('Users content'), null);
  cleanup();

  renderWithRole(
    'EDITOR',
    <RoleGuard permission="write">
      <div>Editable content</div>
    </RoleGuard>,
  );
  assert.ok(screen.getByText('Editable content'));
  cleanup();
});
