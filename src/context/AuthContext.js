/**
 * AuthContext — global auth state for the Glauc app.
 * Wraps the entire app. Provides user, loading state, and auth actions.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  getToken,
  saveToken,
  clearToken,
  apiLogin,
  apiRegister,
  apiLoginGoogle,
  apiLoginApple,
  apiGetMe,
} from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true); // true on first boot

  // On mount: restore session from SecureStore
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const me = await apiGetMe();
          setUser(me);
        }
      } catch {
        // Token invalid or expired — clear it silently
        await clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Email / password ────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    await saveToken(data.token);
    setUser(data.user);
    return { user: data.user, isNewUser: false };
  }, []);

  const register = useCallback(async (email, password, name) => {
    const data = await apiRegister(email, password, name);
    await saveToken(data.token);
    setUser(data.user);
    return { user: data.user, isNewUser: true };
  }, []);

  // ── Google OAuth ────────────────────────────────────────────
  const loginWithGoogle = useCallback(async (idToken) => {
    const data = await apiLoginGoogle(idToken);
    await saveToken(data.token);
    setUser(data.user);
    return { user: data.user, isNewUser: data.isNewUser ?? false };
  }, []);

  // ── Apple Sign In ───────────────────────────────────────────
  const loginWithApple = useCallback(async (identityToken, fullName) => {
    const data = await apiLoginApple(identityToken, fullName);
    await saveToken(data.token);
    setUser(data.user);
    return { user: data.user, isNewUser: data.isNewUser ?? false };
  }, []);

  // ── Sign out ────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  // ── Refresh profile ─────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    try {
      const me = await apiGetMe();
      setUser(me);
    } catch {
      // Session may have expired
      await signOut();
    }
  }, [signOut]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        loginWithGoogle,
        loginWithApple,
        signOut,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
