import { tokenStorage } from './tokenStorage';
import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authApi } from '../api/endpoints';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import type { UserOut } from '../api/types';

const TOKEN_KEY = 'irrigavale.token';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  user: UserOut | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (payload: Parameters<typeof authApi.register>[0]) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserOut | null>(null);

  const persistSession = useCallback(async (token: string, account: UserOut) => {
    await tokenStorage.set(TOKEN_KEY, token);
    setAuthToken(token);
    setUser(account);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    await tokenStorage.remove(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setStatus('signedOut');
    queryClient.clear();
  }, [queryClient]);

  // Restaura a sessão ao abrir o app.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await tokenStorage.get(TOKEN_KEY);
      if (!token) {
        setStatus('signedOut');
        return;
      }
      setAuthToken(token);
      try {
        const account = await authApi.me();
        if (!cancelled) {
          setUser(account);
          setStatus('signedIn');
        }
      } catch {
        if (!cancelled) await signOut();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  // Token expirado em qualquer chamada => volta para o login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await authApi.login(email.trim(), password);
      await persistSession(session.access_token, session.user);
    },
    [persistSession],
  );

  const register = useCallback(
    async (payload: Parameters<typeof authApi.register>[0]) => {
      const session = await authApi.register(payload);
      await persistSession(session.access_token, session.user);
    },
    [persistSession],
  );

  const value = useMemo(
    () => ({ status, user, signIn, register, signOut }),
    [status, user, signIn, register, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}
