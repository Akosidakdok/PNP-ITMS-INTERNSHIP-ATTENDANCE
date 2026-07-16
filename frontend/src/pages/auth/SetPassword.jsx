import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Shield, Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import backendApi from '../../utils/backendApi.js';
import toast from 'react-hot-toast';

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const passwordStrength = (pwd) => {
    if (!pwd) return { label: '', color: '', width: '0%' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: '20%' };
    if (score <= 2) return { label: 'Fair', color: 'bg-yellow-500', width: '40%' };
    if (score <= 3) return { label: 'Good', color: 'bg-blue-500', width: '60%' };
    if (score <= 4) return { label: 'Strong', color: 'bg-green-500', width: '80%' };
    return { label: 'Excellent', color: 'bg-green-600', width: '100%' };
  };

  const strength = passwordStrength(form.password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Invalid link. No token found.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await backendApi.post('/auth/set-password', { token, password: form.password });
      setSuccess(true);
      toast.success('Password updated successfully! You can now log in.');
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to set password. The link may have expired.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #001240 0%, #003087 100%)' }}>
        <div className="w-full max-w-md p-8 animate-scale-in">
          <div style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px', padding: '40px 32px', textAlign: 'center' }}>
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Invalid Link</h2>
            <p className="text-blue-200 text-sm mb-6">This password reset link is invalid or has expired. Please contact your administrator for a new link.</p>
            <button onClick={() => navigate('/login')} className="px-6 py-2 rounded-lg text-white font-semibold" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}>
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundImage: 'url(/ITMS_BACKGROUND.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      <div className="absolute inset-0 z-0" style={{ background: 'rgba(0, 18, 64, 0.72)' }} />
      <div className="w-full max-w-md p-6 relative z-10 animate-scale-in">
        <div style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '24px', padding: '40px 32px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>

          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', boxShadow: '0 4px 12px rgba(37,99,235,0.4)' }}>
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-white">PNP-ITMS</p>
              <p className="text-xs text-blue-300">Set Your Password</p>
            </div>
          </div>

          {success ? (
            <div className="text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.3)' }}>
                <CheckCircle className="w-10 h-10 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Password Updated!</h2>
              <p className="text-blue-200 text-sm mb-6">Your password has been changed successfully. You can now log in with your new password.</p>
              <button onClick={() => navigate('/login')} className="w-full py-3 rounded-xl text-white font-semibold transition-all" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', boxShadow: '0 4px 12px rgba(37,99,235,0.4)' }}>
                Go to Login
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-1 text-white text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Set Your Password
              </h2>
              <p className="text-blue-200 text-sm mb-6 text-center">Choose a strong, private password that only you know.</p>

              {error && (
                <div className="mb-4 p-3 rounded-lg flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-red-300 text-sm">{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="form-group">
                  <label className="form-label" htmlFor="password" style={{ color: '#bfdbfe' }}>New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 pointer-events-none" style={{ zIndex: 1 }} />
                    <input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      className="form-input"
                      style={{ paddingLeft: '2.25rem', paddingRight: '2.5rem', background: 'rgba(255,255,255,0.92)', color: '#1e293b' }}
                      placeholder="Enter new password"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      autoFocus
                      minLength={8}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition" tabIndex={-1}>
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Strength Indicator */}
                  {form.password && (
                    <div className="mt-2">
                      <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
                        <div className={`h-1.5 rounded-full transition-all duration-300 ${strength.color}`} style={{ width: strength.width }} />
                      </div>
                      <p className="text-xs mt-1" style={{ color: '#93c5fd' }}>{strength.label}</p>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="confirm" style={{ color: '#bfdbfe' }}>Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 pointer-events-none" style={{ zIndex: 1 }} />
                    <input
                      id="confirm"
                      type={showPass ? 'text' : 'password'}
                      className="form-input"
                      style={{ paddingLeft: '2.25rem', background: 'rgba(255,255,255,0.92)', color: '#1e293b' }}
                      placeholder="Re-enter new password"
                      value={form.confirm}
                      onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                      minLength={8}
                    />
                  </div>
                  {form.confirm && form.password !== form.confirm && (
                    <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !form.password || !form.confirm}
                  className="w-full py-3 rounded-xl text-white font-semibold transition-all flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', boxShadow: '0 4px 12px rgba(37,99,235,0.4)', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Setting Password...
                    </>
                  ) : (
                    '🔐 Set Password'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
