import { useState, useEffect } from 'react';
import { Users, Clock, FileText, AlertCircle } from 'lucide-react';
import { useAuth } from './context/AuthContext.jsx';
import api from './utils/api.js';
import { format } from 'date-fns';

const StatCard = ({ icon: Icon, label, value, color, bg }) => (
  <div className="card p-4 flex items-center gap-4">
    <div className={`p-3 rounded-xl ${bg}`}>
      <Icon className={`w-6 h-6 ${color}`} />
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  </div>
);

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await api.get('/supervisor/dashboard-stats');
        setData(response.data);
        setError(null);
      } catch (err) {
        const message = err.response?.data?.error || 'Failed to load dashboard data.';
        setError(message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stats = data?.stats;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Supervisor Dashboard
        </h1>
        <p className="text-gray-500 text-sm">
          Welcome, {user?.full_name}. Overview for {stats?.department_name || 'your department'}.
        </p>
      </div>

      {error && (
        <div className="card p-4 flex items-center gap-3 text-red-600 bg-red-50 border border-red-200">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Interns in Department" value={loading ? '...' : stats?.total_interns ?? 0} color="text-blue-600" bg="bg-blue-100" />
        <StatCard icon={Clock} label="Pending Attendance" value={loading ? '...' : stats?.pending_attendance ?? 0} color="text-orange-600" bg="bg-orange-100" />
        <StatCard icon={FileText} label="Pending Documents" value={loading ? '...' : stats?.pending_documents ?? 0} color="text-green-600" bg="bg-green-100" />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Recent Attendance Activity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table-auto w-full">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Intern Name</th>
                <th className="px-4 py-2 text-left">Scan Type</th>
                <th className="px-4 py-2 text-left">Time</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading && Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b"><td colSpan="4" className="p-4"><div className="h-4 bg-gray-200 rounded animate-pulse"></div></td></tr>
              ))}
              {!loading && data?.recentAttendance?.length === 0 && (
                <tr><td colSpan="4" className="text-center p-6 text-gray-500">No recent activity.</td></tr>
              )}
              {data?.recentAttendance?.map(log => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{log.intern_name}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${log.scan_type === 'time_in' ? 'badge-blue' : 'badge-orange'}`}>
                      {log.scan_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{format(new Date(log.scan_time), 'MMM d, yyyy, h:mm a')}</td>
                  <td className="px-4 py-3">
                    <span className={`badge badge-${log.approval_status}`}>{log.approval_status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}