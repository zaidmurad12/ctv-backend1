import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PERMISSIONS, hasPermission, isAdmin, roleLabel } from '../src/lib/permissions';

test('hasPermission grants ADMIN every permission', () => {
  for (const permission of ALL_PERMISSIONS) {
    assert.equal(hasPermission('ADMIN', permission), true);
  }
});

test('hasPermission restricts VIEWER to read only', () => {
  assert.equal(hasPermission('VIEWER', 'read'), true);
  assert.equal(hasPermission('VIEWER', 'write'), false);
  assert.equal(hasPermission('VIEWER', 'users'), false);
});

test('hasPermission grants EDITOR read/write/import but not users/providers/systemSettings', () => {
  assert.equal(hasPermission('EDITOR', 'read'), true);
  assert.equal(hasPermission('EDITOR', 'write'), true);
  assert.equal(hasPermission('EDITOR', 'import'), true);
  assert.equal(hasPermission('EDITOR', 'users'), false);
  assert.equal(hasPermission('EDITOR', 'providers'), false);
  assert.equal(hasPermission('EDITOR', 'systemSettings'), false);
});

test('hasPermission returns false when role is undefined', () => {
  assert.equal(hasPermission(undefined, 'read'), false);
});

test('isAdmin is true only for the ADMIN role', () => {
  assert.equal(isAdmin('ADMIN'), true);
  assert.equal(isAdmin('EDITOR'), false);
  assert.equal(isAdmin('VIEWER'), false);
  assert.equal(isAdmin(undefined), false);
});

test('roleLabel produces human-readable labels', () => {
  assert.equal(roleLabel('ADMIN'), 'Administrator');
  assert.equal(roleLabel('EDITOR'), 'Editor');
  assert.equal(roleLabel('VIEWER'), 'Viewer');
});
