import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { get, post } from './api';

interface AuthState {
  email: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<{ email: string }>('/auth/me')
      .then((me) => setEmail(me.email))
      .catch(() => setEmail(null))
      .finally(() => setLoading(false));
    const onUnauthorised = () => setEmail(null);
    window.addEventListener('bulkskart:unauthorised', onUnauthorised);
    return () => window.removeEventListener('bulkskart:unauthorised', onUnauthorised);
  }, []);

  const value: AuthState = {
    email,
    loading,
    async signIn(address, password) {
      const result = await post<{ email: string }>('/auth/login', { email: address, password });
      setEmail(result.email);
    },
    async signOut() {
      await post('/auth/logout');
      setEmail(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
