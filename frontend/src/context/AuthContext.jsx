import { createContext, useContext, useState, useEffect } from 'react';
import backendApi from '../utils/backendApi.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('pnp_token');
    if (!token) {
      setLoading(false);
      return;
    }

    backendApi.get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => {
        setUser(null);
        localStorage.removeItem('pnp_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const uname = String(username || '').trim().toLowerCase();
    const pwd = String(password || '').trim();
    const { data } = await backendApi.post('/auth/login', { username: uname, password: pwd });

    if (!data?.token) {
      throw new Error(data?.error || 'Login response was missing a token');
    }

    localStorage.setItem('pnp_token', data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    localStorage.removeItem('pnp_token');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const { data } = await backendApi.get('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
      localStorage.removeItem('pnp_token');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
