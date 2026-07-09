import { useState, useEffect } from 'react';
import { Users, UserCheck, Clock, CheckCircle, Building2, FileText, Star, TrendingUp, Calendar, AlertCircle } from 'lucide-react';
import api from '../../utils/api.js';
import { formatDistanceToNow } from 'date-fns';
import QRDisplay from '../../components/qr/QRDisplay.jsx';

function StatCard({ icon: Icon, label, value, gradient, trend }) {
  return (
    <div className={`rounded-2xl p-5 text-white ${gradient} shadow-lg animate-fade-in`}>
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 rounded-xl bg-white/20">
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <span className="text-xs bg-white/20 rounded-full px-2 py-0.5 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> {trend}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold mb-1">{value}</p>
      <p className="text-sm opacity-80">{label}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/dashboard-stats').then(res => {
      setData(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const stats = data?.stats || {};

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Administrator Dashboard
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={Users} label="Total Interns" value={loading ? '—' : stats.total_interns || 0} gradient="stat-gradient-blue" />
        <StatCard icon={UserCheck} label="Present Today" value={loading ? '—' : stats.present_today || 0} gradient="stat-gradient-green" />
        <StatCard icon={Clock} label="Pending Attendance" value={loading ? '—' : stats.pending_attendance || 0} gradient="stat-gradient-gold" />
        <StatCard icon={CheckCircle} label="Approved Today" value={loading ? '—' : stats.approved_today || 0} gradient="stat-gradient-teal" />
        <StatCard icon={Building2} label="Departments" value={loading ? '—' : stats.total_departments || 0} gradient="stat-gradient-purple" />
        <StatCard icon={FileText} label="Pending Docs" value={loading ? '—' : stats.pending_documents || 0} gradient="stat-gradient-red" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Attendance */}
        <div className="xl:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" /> Recent Attendance
            </h2>
            <a href="/admin/attendance" className="text-xs text-blue-600 hover:underline">View all →</a>
          </div>
          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-12 rounded-xl" />
              ))
            ) : data?.recentAttendance?.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No recent attendance records</p>
              </div>
            ) : (
              data?.recentAttendance?.map(log => (
                <div key={log.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${log.scan_type === 'time_in' ? 'bg-blue-100' : 'bg-pink-100'}`}>
                    <Clock className={`w-4 h-4 ${log.scan_type === 'time_in' ? 'text-blue-600' : 'text-pink-600'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{log.full_name}</p>
                    <p className="text-xs text-gray-500">{log.department_name || 'No department'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`badge ${log.scan_type === 'time_in' ? 'badge-time-in' : 'badge-time-out'}`}>
                      {log.scan_type === 'time_in' ? 'Time In' : 'Time Out'}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(log.scan_time), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* QR Code */}
        <div className="space-y-4">
          <QRDisplay />

          {/* Recent Documents */}
          <div className="card p-4">
            <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" /> Recent Documents
            </h3>
            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)
              ) : data?.recentDocuments?.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">No documents uploaded</p>
              ) : (
                data?.recentDocuments?.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
                    <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-700 truncate">{doc.document_type}</p>
                      <p className="text-xs text-gray-400 truncate">{doc.full_name}</p>
                    </div>
                    <span className={`badge badge-${doc.status} text-xs`}>{doc.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
