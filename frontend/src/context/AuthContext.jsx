import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import backendApi, { clearSession, hasSavedSession, revokeSavedSession, saveSession } from '../utils/backendApi.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [legalStatus, setLegalStatus] = useState(null);
  const [connectionError, setConnectionError] = useState(false);
  const requestId = useRef(0);
  const needsReconnect = useRef(false);

  const restoreSession = useCallback(async () => {
    const id = ++requestId.current;
    if (!hasSavedSession()) {
      needsReconnect.current = false;
      setUser(null);
      setLegalStatus(null);
      setConnectionError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setConnectionError(false);
    try {
      const { data } = await backendApi.get('/auth/me');
      if (id !== requestId.current) return;
      if (!data?.user) throw new Error('User account not found');
      needsReconnect.current = false;
      setUser(data.user);
      setLegalStatus(data.legal_status || null);
    } catch (error) {
      if (id !== requestId.current) return;
      if (error.response?.status === 401 || !hasSavedSession()) {
        clearSession();
        setUser(null);
        setLegalStatus(null);
      } else {
        needsReconnect.current = true;
        setConnectionError(true);
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
    const handleSessionEnded = () => {
      requestId.current += 1;
      needsReconnect.current = false;
      setUser(null);
      setLegalStatus(null);
      setConnectionError(false);
      setLoading(false);
    };
    const handleStorage = event => {
      if (event.key === 'pnp_token' || event.key === 'pnp_refresh_token') restoreSession();
    };
    const handleOnline = () => {
      if (hasSavedSession() && needsReconnect.current) restoreSession();
    };
    window.addEventListener('pnp-session-ended', handleSessionEnded);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('online', handleOnline);
    return () => {
      requestId.current += 1;
      window.removeEventListener('pnp-session-ended', handleSessionEnded);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('online', handleOnline);
    };
  }, [restoreSession]);

  useEffect(() => {
    if (!connectionError || !hasSavedSession()) return undefined;
    const timer = window.setTimeout(() => {
      if (navigator.onLine) restoreSession();
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [connectionError, restoreSession]);

  const login = async (username, password) => {
    const uname = String(username || '').trim().toLowerCase();
    const pwd = String(password || '').trim();
    const { data } = await backendApi.post('/auth/login', { username: uname, password: pwd });

    if (!data?.token) {
      throw new Error(data?.error || 'Login response was missing a token');
    }

    requestId.current += 1;
    needsReconnect.current = false;
    saveSession(data);
    setUser(data.user);
    setLegalStatus(data.legal_status || null);
    setConnectionError(false);
    setLoading(false);
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
    requestId.current += 1;
    await revokeSavedSession();
    setUser(null);
    setLegalStatus(null);
    setConnectionError(false);
  };

  const refreshUser = async () => {
    try {
      const { data } = await backendApi.get('/auth/me');
      setUser(data.user);
      setLegalStatus(data.legal_status || null);
    } catch (error) {
      if (error.response?.status === 401) {
        clearSession();
        setUser(null);
        setLegalStatus(null);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, connectionError, retrySession: restoreSession, legalStatus, login, logout, refreshUser, acceptLegalDocuments, refreshLegalStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
