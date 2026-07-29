import test from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../src/pages/login';
import { AuthContext, type AuthContextValue } from '../src/context/AuthContext';
import { ApiError } from '../src/lib/apiError';

function renderLogin(login: AuthContextValue['login']) {
  const value: AuthContextValue = {
    user: undefined,
    isLoading: false,
    login,
    logout: async () => {},
  };
  return render(
    <AuthContext.Provider value={value}>
      <Login />
    </AuthContext.Provider>,
  );
}

test('Login shows validation errors when submitted empty', async () => {
  const user = userEvent.setup();
  let called = false;
  renderLogin(async () => {
    called = true;
  });

  await user.click(screen.getByRole('button', { name: /sign in/i }));

  await waitFor(() => {
    assert.ok(screen.getByText(/email is required/i));
  });
  assert.equal(called, false);
  cleanup();
});

test('Login calls the auth context login with the entered credentials', async () => {
  const user = userEvent.setup();
  let received: [string, string] | undefined;
  renderLogin(async (email, password) => {
    received = [email, password];
  });

  await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
  await user.type(screen.getByLabelText(/password/i), 'Sup3r-Secret!!');
  await user.click(screen.getByRole('button', { name: /sign in/i }));

  await waitFor(() => {
    assert.deepEqual(received, ['admin@example.com', 'Sup3r-Secret!!']);
  });
  cleanup();
});

test('Login surfaces a server error message when login rejects', async () => {
  const user = userEvent.setup();
  renderLogin(async () => {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid email or password.');
  });

  await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
  await user.type(screen.getByLabelText(/password/i), 'wrong-password');
  await user.click(screen.getByRole('button', { name: /sign in/i }));

  await waitFor(() => {
    assert.ok(screen.getByText('Invalid email or password.'));
  });
  cleanup();
});
