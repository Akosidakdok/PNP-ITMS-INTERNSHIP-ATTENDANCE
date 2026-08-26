import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Clock, CheckCircle, FileText, Award, QrCode, TrendingUp, Calendar, Bell, AlertCircle, ShieldCheck, UserCheck } from 'lucide-react';
import api from '../../utils/api.js';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications } from '../../context/NotificationContext.jsx';

const safeFormatDistanceToNow = (dateStr) => {
  try {
    if (!dateStr) return 'just now';
    let str = String(dateStr).trim();
    if (str.includes(' ') && !str.includes('T')) {
      str = str.replace(' ', 'T');
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? 'recently' : formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return 'recently';
  }
};

export default function InternDashboard() {
  const { user } = useAuth();
  const { notifications } = useNotifications();
  const [profile, setProfile] = useState(null);
  const [dtrRecords, setDtrRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/interns/me/profile'),
      api.get('/dtr', { params: { limit: 500 } }),
    ]).then(([profRes, dtrRes]) => {
      setProfile(profRes.data?.intern);
      setDtrRecords(dtrRes.data?.records || []);
      setError(null);
    }).catch((err) => {
      const message = err.response?.data?.error || 'Failed to load your dashboard data. Please refresh the page.';
      setError(message);
      console.error(err);
    }).finally(() => { setLoading(false); });
  }, []);

  const intern = profile;

  // Calculate hours from DTR records (same source as the DTR page)
  const totalRendered  = dtrRecords.reduce((s, r) => s + (r.total_hours || 0), 0);
  const approvedRendered = dtrRecords
    .filter(r => r.approval_status === 'approved')
    .reduce((s, r) => s + (r.total_hours || 0), 0);

  const requiredHours = intern?.required_hours || 486;
  const pct       = Math.min(100, (approvedRendered / requiredHours) * 100);
  const remaining = Math.max(0, requiredHours - approvedRendered);

  const recentNotifs = notifications.filter(n => !n.is_read).slice(0, 3);

  return (
    <div className="space-y-6 animate-fade-in dashboard-module intern-mobile-page">
      {/* Welcome Banner */}
      <div className="intern-dashboard-welcome rounded-2xl p-6 text-white stat-gradient-blue relative overflow-hidden">
        <div className="absolute right-6 top-0 bottom-0 flex items-center opacity-20">
          <TrendingUp className="w-32 h-32" />
        </div>
        <p className="text-blue-200 text-sm mb-1">Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'},</p>
        <h1 className="text-xl sm:text-2xl font-bold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {loading ? '...' : intern?.full_name || user?.username}
        </h1>
        <p className="text-blue-200 text-sm">{loading ? '' : intern?.department_name || 'PNP-ITMS'}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="badge bg-white/20 text-white">{intern?.school || '—'}</span>
          <span className="badge bg-white/20 text-white">{intern?.course || '—'}</span>
        </div>
      </div>

      {/* Face Registration Action Banner */}
      {!loading && intern && !intern.face_registered && (
        <div className="card p-5 bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-pulse-subtle">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-amber-500 text-white rounded-xl shadow-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-sm sm:text-base">
                Biometric Face Verification Required
              </h3>
              <p className="text-xs text-amber-900 mt-0.5 max-w-lg">
                {intern.self_face_enrollment_available
                  ? 'Your fresh account includes one self-service Face ID enrollment. Register now before using QR attendance.'
                  : 'Contact your administrator or assigned supervisor to complete biometric enrollment in person before using QR attendance.'}
              </p>
            </div>
          </div>
          {intern.self_face_enrollment_available ? (
            <button
              type="button"
              className="btn btn-primary whitespace-nowrap"
              onClick={() => navigate('/intern/profile')}
            >
              Register My Face
            </button>
          ) : (
            <div className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded-xl px-4 py-2.5 whitespace-nowrap">
              Staff enrollment required
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="card p-4 flex items-center gap-3 text-red-600 bg-red-50 border border-red-200">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Stats Row */}
      <div className="intern-dashboard-stats grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: CheckCircle, label: 'Hours Rendered',  value: loading ? '—' : `${approvedRendered.toFixed(1)}h`,  color: 'text-green-600',  bg: 'bg-green-50'  },
          { icon: Clock,        label: 'Hours Required',  value: loading ? '—' : `${requiredHours}h`,                color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { icon: TrendingUp,   label: 'Remaining',       value: loading ? '—' : `${remaining.toFixed(1)}h`,         color: 'text-orange-600', bg: 'bg-orange-50' },
          { icon: Calendar,     label: 'Progress',        value: loading ? '—' : `${pct.toFixed(0)}%`,               color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className={`p-2 rounded-xl ${s.bg}`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Internship Progress</h2>
          <span className="text-sm font-bold text-blue-600">{pct.toFixed(1)}%</span>
        </div>
        <div className="progress-bar h-3 mb-2">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{approvedRendered.toFixed(1)} hours completed</span>
          <span>{remaining.toFixed(1)} hours remaining</span>
        </div>
        {intern?.start_date && intern?.end_date && (
          <p className="text-xs text-gray-400 mt-2">
            {intern.start_date} — {intern.end_date}
          </p>
        )}
      </div>

      <div className="intern-dashboard-panels grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="card p-5">
          <h2 className="font-bold text-gray-800 mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { icon: QrCode, label: 'Scan QR Attendance', to: '/intern/scan', gradient: 'stat-gradient-blue', primary: true },
              { icon: Clock, label: 'View My DTR', to: '/intern/dtr', gradient: '' },
              { icon: FileText, label: 'My Documents', to: '/intern/documents', gradient: '' },
              { icon: Award, label: 'My Evaluation', to: '/intern/evaluation', gradient: '' },
            ].map(a => (
              <button
                key={a.to}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${a.primary ? 'text-white stat-gradient-blue shadow' : 'hover:bg-gray-50 border border-gray-100'}`}
                onClick={() => navigate(a.to)}
              >
                <a.icon className={`w-5 h-5 ${a.primary ? 'text-white' : 'text-blue-600'}`} />
                <span className={`text-sm font-medium ${a.primary ? 'text-white' : 'text-gray-700'}`}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Notifications */}
        <div className="card p-5">
          <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600" /> Notifications
          </h2>
          {recentNotifs.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No new notifications</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentNotifs.map((n, index) => (
                <div key={n.id || `${n.created_at || 'notification'}-${index}`} className="p-3 bg-blue-50 rounded-xl">
                  <p className="text-sm font-medium text-blue-800">{n.title}</p>
                  <p className="text-xs text-blue-600 mt-0.5">{n.message}</p>
                  <p className="text-xs text-blue-400 mt-1">{safeFormatDistanceToNow(n.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent DTR */}
        <div className="card p-5">
          <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" /> Recent DTR
          </h2>
          {dtrRecords.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No DTR records yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dtrRecords.slice(0, 5).map((r, index) => (
                <div key={r.id || `${r.date || 'dtr'}-${r.time_in || index}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{r.date}</p>
                    <p className="text-xs text-gray-400">{r.time_in ? `In: ${r.time_in}` : '—'} {r.time_out ? `| Out: ${r.time_out}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-600">{r.total_hours ? `${r.total_hours.toFixed(1)}h` : '—'}</p>
                    <span className={`badge badge-${r.approval_status} text-xs`}>{r.approval_status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
