import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { authService } from '../services/authService';
import { setUnauthorizedHandler } from '../lib/apiClient';
import { tokenStorage } from '../lib/tokenStorage';
import type { UserResponseDto } from '../lib/types';

export interface AuthContextValue {
  readonly user: UserResponseDto | undefined;
  readonly isLoading: boolean;
  readonly login: (email: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PUBLIC_ROUTES = new Set(['/login']);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserResponseDto | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const signOut = () => {
      setUser(undefined);
      if (!PUBLIC_ROUTES.has(router.pathname)) {
        void router.replace('/login');
      }
    };
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(undefined);
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!tokenStorage.getAccessToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const profile = await authService.getProfile();
        if (!cancelled) setUser(profile);
      } catch {
        tokenStorage.clear();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const isPublic = PUBLIC_ROUTES.has(router.pathname);
    if (!user && !isPublic) {
      void router.replace('/login');
    }
    if (user && isPublic) {
      void router.replace('/');
    }
    // Every admin route requires the ADMIN role specifically - a logged-in EDITOR/VIEWER
    // account (both real roles the backend supports) would otherwise land on a dashboard that
    // 403s on every single request instead of a clear "this panel isn't for you" message.
    if (user && user.role !== 'ADMIN' && !isPublic) {
      void router.replace('/login?forbidden=1');
    }
  }, [isLoading, user, router]);

  const login = async (email: string, password: string) => {
    const session = await authService.login({ email, password });
    if (session.user.role !== 'ADMIN') {
      throw new Error('هذا الحساب لا يملك صلاحية الوصول إلى لوحة التحكم.');
    }
    tokenStorage.setTokens(session.accessToken, session.refreshToken);
    setUser(session.user);
  };

  const logout = async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    try {
      if (refreshToken) await authService.logout(refreshToken);
    } catch {
      // Best-effort revoke; proceed with local sign-out regardless.
    }
    tokenStorage.clear();
    setUser(undefined);
    void router.replace('/login');
  };

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
