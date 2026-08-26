import { createContext, useContext, useState, useEffect } from 'react';
import backendApi from '../utils/backendApi.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [legalStatus, setLegalStatus] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('pnp_token');
    if (!token) {
      setLoading(false);
      return;
    }

    backendApi.get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        setLegalStatus(res.data.legal_status || null);
      })
      .catch(() => {
        setUser(null);
        setLegalStatus(null);
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
    setLegalStatus(data.legal_status || null);
    return data.user;
  };

  const acceptLegalDocuments = async (acceptances) => {
    const { data } = await backendApi.post('/legal/accept', { acceptances });
    setLegalStatus({ required: false, pending: [], accepted: data.acceptances || [] });
    return data;
  };

  const refreshLegalStatus = async () => {
    const { data } = await backendApi.get('/legal/acceptance-status');
    setLegalStatus(data);
    return data;
  };

  const logout = async () => {
    localStorage.removeItem('pnp_token');
    setUser(null);
    setLegalStatus(null);
  };

  const refreshUser = async () => {
    try {
      const { data } = await backendApi.get('/auth/me');
      setUser(data.user);
      setLegalStatus(data.legal_status || null);
    } catch {
      setUser(null);
      setLegalStatus(null);
      localStorage.removeItem('pnp_token');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, legalStatus, login, logout, refreshUser, acceptLegalDocuments, refreshLegalStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
