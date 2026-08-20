import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import toast from 'react-hot-toast';
import { Shield, Eye, EyeOff, Lock, User } from 'lucide-react';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const { login } = useAuth();
  const navigate = useNavigate();

  const [error, setError] = useState('');

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setTimeout(
      () => setRetryAfter(seconds => Math.max(0, seconds - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (retryAfter > 0) return;
    if (!form.username || !form.password) {
      setError('Please fill in all fields');
      toast.error('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const username = form.username.trim().toLowerCase();
      const password = String(form.password).trim();
      const user = await login(username, password);
      toast.success(`Welcome back, ${user.full_name || user.username}!`);
      const needsInitialFaceEnrollment = user.role === 'intern'
        && user.self_face_enrollment_available
        && !user.face_registered;
      navigate(
        needsInitialFaceEnrollment
          ? '/intern/profile'
          : user.role === 'admin' ? '/admin' : '/intern',
        { replace: true }
      );
    } catch (err) {
      const message = err?.response?.data?.error || 'Login failed. Please check your credentials.';
      const serverRetryAfter = Number(err?.response?.data?.retry_after_seconds || 0);
      if (serverRetryAfter > 0) {
        setRetryAfter(Math.ceil(serverRetryAfter));
      }
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative" style={{ backgroundImage: 'url(/ITMS_BACKGROUND.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 z-0" style={{ background: 'rgba(0, 18, 64, 0.72)' }} />
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative z-10 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full" style={{ background: 'radial-gradient(circle, #2d80ff, transparent)' }} />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle, #f0b830, transparent)' }} />
        </div>

        <div className="relative z-10 text-center animate-fade-in">
          {/* PNP Logo/Shield */}
          <div className="mx-auto mb-8 flex items-center justify-center w-48 h-48 rounded-full glass-dark border-2 border-gold-400 shadow-2xl overflow-hidden">
            <img src="/ITMS_LOGO.jpg" alt="ITMS Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
            P-DITMS
          </h1>
          <p className="text-xl text-blue-200 mb-2 font-medium">PNP - Database Internship Tracking  Management System</p>
          <p className="text-blue-300 text-sm max-w-xs mx-auto leading-relaxed">
            Philippine National Police<br />
            Information Technology Management Service
          </p>

          
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative z-10">
        <div className="w-full max-w-md animate-scale-in">
          <div className="p-8 lg:p-10 rounded-2xl" style={{ background: 'rgba(10, 25, 70, 0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}>
            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #003087, #0060e6)' }}>
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm text-pnp-800">PNP-ITMS</p>
                <p className="text-xs text-gray-500">Internship Management</p>
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-1 text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Sign In
            </h2>
            <p className="text-blue-200 text-sm mb-8">Enter your credentials to access the system</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="form-group">
                <label className="form-label" htmlFor="username" style={{ color: '#bfdbfe' }}>Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 pointer-events-none" style={{ zIndex: 1 }} />
                  <input
                    id="username"
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: '2.25rem', background: 'rgba(255,255,255,0.92)', color: '#1e293b' }}
                    placeholder="Enter your username"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password" style={{ color: '#bfdbfe' }}>Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 pointer-events-none" style={{ zIndex: 1 }} />
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    className="form-input"
                    style={{ paddingLeft: '2.25rem', paddingRight: '2.5rem', background: 'rgba(255,255,255,0.92)', color: '#1e293b' }}
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    onClick={() => setShowPass(v => !v)}
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                id="login-submit"
                type="submit"
                className="btn btn-primary w-full btn-lg"
                disabled={loading || retryAfter > 0}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Signing in...
                  </span>
                ) : retryAfter > 0
                  ? `Try again in ${retryAfter}s`
                  : 'Sign In'}
              </button>
              {error && (
                <p className="mt-3 text-sm text-red-600">{error}</p>
              )}
            </form>

            <div className="divider mt-8" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />
            <p className="text-center text-xs text-blue-300 opacity-70">
              PNP-ITMS &copy; {new Date().getFullYear()} &middot; Philippine National Police
            </p>
          </div>

          <p className="text-center text-blue-200 text-xs mt-4 opacity-70">
            Secured with end-to-end encryption
          </p>
        </div>
      </div>

      {/* Bottom-left credit */}
      <p className="absolute bottom-4 left-5 text-blue-300 text-xs opacity-60 select-none" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Created by Students of Pamantasan ng Lungsod Ng Valenzuela
      </p>
    </div>
  );
}
