import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// ─── Mock users (no backend needed) ────────────────────────────────────────
// username "admin"  → role: admin
// any other username → role: intern
const buildMockUser = (username) => {
  const isAdmin = username.toLowerCase() === 'admin';
  return {
    id: isAdmin ? 1 : 2,
    username,
    full_name: isAdmin ? 'Demo Admin' : `Demo Intern (${username})`,
    role: isAdmin ? 'admin' : 'intern',
    email: isAdmin ? 'admin@pnp-itms.gov.ph' : `${username}@pnp-itms.gov.ph`,
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('pnp_mock_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    setLoading(false);
  }, []);

  // username "admin" → admin role, anything else → intern role
  const login = async (username) => {
    const mockUser = buildMockUser(username);
    localStorage.setItem('pnp_mock_user', JSON.stringify(mockUser));
    setUser(mockUser);
    return mockUser;
  };

  const logout = async () => {
    localStorage.removeItem('pnp_mock_user');
    setUser(null);
  };

  const refreshUser = () => {};

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
