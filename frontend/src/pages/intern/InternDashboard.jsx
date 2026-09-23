import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Clock, CheckCircle, FileText, Award, QrCode, TrendingUp, Calendar, Bell, AlertCircle, ShieldCheck, UserCheck, Megaphone, Trash2 } from 'lucide-react';
import api from '../../utils/api.js';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications } from '../../context/NotificationContext.jsx';
import Modal from '../../components/common/Modal.jsx';

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

const toNonNegativeMinutes = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : null;
};

const getRecordMinutes = (record) => {
  const fallbackMinutes = record?.total_hours === null
    || record?.total_hours === undefined
    || record?.total_hours === ''
    ? null
    : toNonNegativeMinutes(Number(record.total_hours) * 60);

  return toNonNegativeMinutes(record?.total_minutes) ?? fallbackMinutes ?? 0;
};

const getApprovedMinutes = record => toNonNegativeMinutes(record?.approved_minutes)
  ?? (record?.approval_status === 'approved' ? getRecordMinutes(record) : 0);

const formatDuration = (value) => {
  const minutes = toNonNegativeMinutes(value) ?? 0;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};

export default function InternDashboard() {
  const { user } = useAuth();
  const { notifications, markAsRead, clearAllNotifications } = useNotifications();
  const [profile, setProfile] = useState(null);
  const [dtrRecords, setDtrRecords] = useState([]);
  const [dtrSummary, setDtrSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const navigate = useNavigate();

  const handleNotificationClick = (n) => {
    setSelectedNotification(n);
    if (!n.is_read && n.id) {
      markAsRead(n.id);
    }
  };

  const handleConfirmClear = async () => {
    try {
      setClearing(true);
      await clearAllNotifications();
      setConfirmClearOpen(false);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/interns/me/profile'),
      api.get('/dtr', { params: { limit: 500 } }),
    ]).then(([profRes, dtrRes]) => {
      setProfile(profRes.data?.intern);
      setDtrRecords(dtrRes.data?.records || []);
      setDtrSummary(dtrRes.data?.summary || null);
      setError(null);
    }).catch((err) => {
      const message = err.response?.data?.error || 'Failed to load your dashboard data. Please refresh the page.';
      setError(message);
      console.error(err);
    }).finally(() => { setLoading(false); });
  }, []);

  const intern = profile;

  // Prefer the server's authoritative minute summary, with a record fallback for
  // compatibility while older API responses are still in circulation.
  const fallbackApprovedMinutes = dtrRecords.reduce(
    (sum, record) => sum + getApprovedMinutes(record),
    0
  );
  const approvedMinutes = toNonNegativeMinutes(dtrSummary?.approved_minutes) ?? fallbackApprovedMinutes;

  const rawRequiredHours = intern?.required_hours;
  const parsedRequiredHours = rawRequiredHours === null || rawRequiredHours === undefined || rawRequiredHours === ''
    ? Number.NaN
    : Number(rawRequiredHours);
  const requiredHours = Number.isFinite(parsedRequiredHours) ? Math.max(0, parsedRequiredHours) : 486;
  const requiredMinutes = Math.round(requiredHours * 60);
  const pct = requiredMinutes > 0 ? Math.min(100, (approvedMinutes / requiredMinutes) * 100) : 0;
  const remainingMinutes = Math.max(0, requiredMinutes - approvedMinutes);
  const requiredDisplay = Number.isInteger(requiredHours) ? `${requiredHours}h` : formatDuration(requiredMinutes);

  const unreadNotifs = notifications.filter(n => !n.is_read);
  const recentNotifs = unreadNotifs.length > 0 ? unreadNotifs.slice(0, 3) : notifications.slice(0, 3);

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
          { icon: CheckCircle, label: 'Hours Rendered',  value: loading ? '—' : formatDuration(approvedMinutes),  color: 'text-green-600',  bg: 'bg-green-50'  },
          { icon: Clock,        label: 'Hours Required',  value: loading ? '—' : requiredDisplay,                   color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { icon: TrendingUp,   label: 'Remaining',       value: loading ? '—' : formatDuration(remainingMinutes), color: 'text-orange-600', bg: 'bg-orange-50' },
          { icon: Calendar,     label: 'Progress',        value: loading ? '—' : `${pct.toFixed(1)}%`,               color: 'text-purple-600', bg: 'bg-purple-50' },
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
          <span>{formatDuration(approvedMinutes)} completed</span>
          <span>{formatDuration(remainingMinutes)} remaining</span>
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

        {/* Recent Notifications & Announcements */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600" /> Notifications & Announcements
            </h2>
            <div className="flex items-center gap-2">
              {unreadNotifs.length > 0 && (
                <span className="badge bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {unreadNotifs.length} new
                </span>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(true)}
                  className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-red-50 border border-transparent hover:border-red-100"
                  title="Clear all notifications"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear notifications</span>
                </button>
              )}
            </div>
          </div>
          {recentNotifs.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentNotifs.map((n, index) => {
                const isAnnouncement = n.title?.toLowerCase().includes('announcement') ||
                                       n.title?.toLowerCase().includes('memo') ||
                                       n.title?.toLowerCase().includes('holiday');
                return (
                  <div
                    key={n.id || `${n.created_at || 'notification'}-${index}`}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3 rounded-xl transition-all border cursor-pointer hover:shadow-sm ${
                      !n.is_read
                        ? 'bg-blue-50/90 border-blue-200 hover:bg-blue-100/70 hover:border-blue-300'
                        : 'bg-gray-50/70 border-gray-100 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className={`p-1.5 rounded-lg shrink-0 ${!n.is_read ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                          {isAnnouncement ? (
                            <Megaphone className="w-3.5 h-3.5" />
                          ) : (
                            <Bell className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${!n.is_read ? 'font-semibold text-blue-900' : 'font-medium text-gray-800'}`}>
                            {n.title}
                          </p>
                          <p className={`text-xs mt-0.5 line-clamp-2 whitespace-pre-wrap leading-relaxed ${!n.is_read ? 'text-blue-700' : 'text-gray-600'}`}>
                            {n.message}
                          </p>
                          <p className={`text-[11px] mt-1 ${!n.is_read ? 'text-blue-500' : 'text-gray-400'}`}>
                            {safeFormatDistanceToNow(n.created_at)}
                          </p>
                        </div>
                      </div>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5" title="Unread" />
                      )}
                    </div>
                  </div>
                );
              })}
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
                    <p className="text-sm font-bold text-blue-600">
                      {r.is_complete ? formatDuration(getRecordMinutes(r)) : 'Incomplete'}
                    </p>
                    <span className={`badge badge-${r.approval_status} text-xs`}>{r.approval_status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notification Details Modal */}
      <Modal
        isOpen={!!selectedNotification}
        onClose={() => setSelectedNotification(null)}
        title={selectedNotification ? (
          <div className="flex items-center gap-2">
            {selectedNotification.title?.toLowerCase().includes('announcement') ||
             selectedNotification.title?.toLowerCase().includes('memo') ||
             selectedNotification.title?.toLowerCase().includes('holiday') ? (
              <div className="p-1 bg-blue-100 text-blue-600 rounded-lg">
                <Megaphone className="w-4 h-4" />
              </div>
            ) : (
              <div className="p-1 bg-blue-100 text-blue-600 rounded-lg">
                <Bell className="w-4 h-4" />
              </div>
            )}
            <span className="text-gray-900 font-bold">
              {selectedNotification.title?.toLowerCase().includes('announcement')
                ? 'Announcement Details'
                : selectedNotification.title?.toLowerCase().includes('holiday')
                ? 'Holiday Details'
                : selectedNotification.title?.toLowerCase().includes('memo')
                ? 'Memo Details'
                : 'Notification Details'}
            </span>
          </div>
        ) : 'Notification Details'}
        size="md"
        footer={
          <div className="flex items-center justify-between w-full">
            {selectedNotification && (
              selectedNotification.title?.toLowerCase().includes('announcement') ||
              selectedNotification.title?.toLowerCase().includes('memo') ||
              selectedNotification.title?.toLowerCase().includes('holiday') ||
              selectedNotification.message?.includes('Date:')
            ) ? (
              <button
                type="button"
                className="btn btn-secondary text-xs sm:text-sm flex items-center gap-1.5"
                onClick={() => {
                  setSelectedNotification(null);
                  navigate('/intern/calendar');
                }}
              >
                <Calendar className="w-4 h-4 text-blue-600" /> View Calendar
              </button>
            ) : (
              <div />
            )}
            <button
              type="button"
              className="btn btn-primary text-xs sm:text-sm"
              onClick={() => setSelectedNotification(null)}
            >
              Close
            </button>
          </div>
        }
      >
        {selectedNotification && (
          <div className="space-y-4 py-1">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`badge ${
                  selectedNotification.title?.toLowerCase().includes('announcement')
                    ? 'bg-blue-100 text-blue-800'
                    : selectedNotification.title?.toLowerCase().includes('holiday')
                    ? 'bg-red-100 text-red-800'
                    : selectedNotification.title?.toLowerCase().includes('memo')
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-800'
                } text-xs font-semibold px-2.5 py-0.5 rounded-full`}>
                  {selectedNotification.title?.toLowerCase().includes('announcement')
                    ? 'Announcement'
                    : selectedNotification.title?.toLowerCase().includes('holiday')
                    ? 'Holiday'
                    : selectedNotification.title?.toLowerCase().includes('memo')
                    ? 'Memo'
                    : 'System Notification'}
                </span>
                <span className="text-xs text-gray-400">
                  {safeFormatDistanceToNow(selectedNotification.created_at)}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
                {selectedNotification.title}
              </h3>
            </div>

            <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-100 text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
              {selectedNotification.message}
            </div>

            <div className="text-xs text-gray-400 flex items-center gap-1.5 pt-1">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Received:{' '}
                {selectedNotification.created_at
                  ? new Date(selectedNotification.created_at).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'Recently'}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Clear Notifications Confirmation Modal */}
      <Modal
        isOpen={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        title="Clear Notifications"
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmClearOpen(false)}
              disabled={clearing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger flex items-center gap-1.5"
              onClick={handleConfirmClear}
              disabled={clearing}
            >
              <Trash2 className="w-4 h-4" />
              {clearing ? 'Clearing...' : 'Clear All'}
            </button>
          </>
        }
      >
        <div className="space-y-2 py-2">
          <p className="text-sm text-gray-700">
            Are you sure you want to clear all your notifications?
          </p>
          <p className="text-xs text-gray-400">
            This will remove all current notifications and announcements from your notifications list.
          </p>
        </div>
      </Modal>

    </div>
  );
}
