import { useState, useEffect } from 'react';
import { BarChart3, Download, Filter } from 'lucide-react';
import api from '../../utils/api.js';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const toMinutes = (minutes, hours) => Number.isFinite(Number(minutes))
  ? Math.max(0, Math.round(Number(minutes)))
  : Math.max(0, Math.round((Number(hours) || 0) * 60));

const formatDuration = minutes => {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, '0')}m`;
};

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

export default function Reports() {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), department_id: '' });

  useEffect(() => {
    api.get('/departments')
      .then(r => setDepartments(r.data.departments))
      .catch(() => toast.error('Could not load department list.'));
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/reports/attendance', { params: filters });
      setReport(res.data.report);
    } catch {
      toast.error('Failed to generate report.');
    } finally { setLoading(false); }
  };

  const exportCSV = () => {
    const headers = ['Full Name', 'School', 'Department', 'Days Present', 'Total Hours', 'Required Hours', 'Rendered Hours'];
    const rows = report.map(r => [
      r.full_name,
      r.school || '',
      r.department_name || '',
      r.days_present,
      (toMinutes(r.total_minutes, r.total_hours) / 60).toFixed(2),
      r.required_hours,
      (toMinutes(r.rendered_minutes, r.rendered_hours) / 60).toFixed(2),
    ]);
    const csv = `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `PNP-ITMS-Report-${filters.year}-${String(filters.month).padStart(2, '0')}.csv`;
    link.click();
  };

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Reports</h1>
          <p className="text-gray-500 text-sm">Attendance and performance summary reports</p>
        </div>
        <button id="export-csv-btn" className="btn btn-primary w-full sm:w-auto" onClick={exportCSV} disabled={report.length === 0}>
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end">
        <div className="form-group w-full sm:w-auto">
          <label className="form-label">Month</label>
          <select className="form-input form-select text-sm w-full sm:w-auto" value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}>
            {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="form-group w-full sm:w-auto">
          <label className="form-label">Year</label>
          <select className="form-input form-select text-sm w-full sm:w-auto" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="form-group w-full sm:w-auto">
          <label className="form-label">Department</label>
          <select className="form-input form-select text-sm w-full sm:w-auto" value={filters.department_id} onChange={e => setFilters(f => ({ ...f, department_id: e.target.value }))}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button id="generate-report-btn" className="btn btn-primary btn-sm w-full sm:w-auto" onClick={fetchReport} disabled={loading}>
          <Filter className="w-4 h-4" /> {loading ? 'Loading...' : 'Generate'}
        </button>
      </div>

      {/* Report Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-gray-800 text-sm">
            Attendance Report — {months[filters.month - 1]} {filters.year}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Intern Name</th>
                <th>Department</th>
                <th>Days Present</th>
                <th>Total Hours</th>
                <th>Required</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j}><div className="skeleton h-4" /></td>)}</tr>
                ))
              ) : report.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No data for this period</td></tr>
              ) : (
                report.map((r, i) => {
                  const renderedMinutes = toMinutes(r.rendered_minutes, r.rendered_hours);
                  const requiredMinutes = (Number(r.required_hours) || 486) * 60;
                  const pct = Math.min(100, requiredMinutes > 0 ? (renderedMinutes / requiredMinutes) * 100 : 0);
                  return (
                    <tr key={i}>
                      <td className="font-medium text-gray-800">{r.full_name}</td>
                      <td className="text-xs text-gray-500">{r.department_name || '—'}</td>
                      <td className="text-center font-semibold">{r.days_present}</td>
                      <td className="text-center font-semibold">{formatDuration(toMinutes(r.total_minutes, r.total_hours))}</td>
                      <td className="text-center text-gray-500">{r.required_hours}h</td>
                      <td>
                        <div className="flex items-center gap-2 min-w-28">
                          <div className="progress-bar flex-1">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-medium text-blue-600">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
