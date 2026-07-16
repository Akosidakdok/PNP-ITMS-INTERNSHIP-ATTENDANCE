import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api.js';
import DTRPrint from '../../components/dtr/DTRPrint.jsx';
import { Clock, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MyDTR() {
  const [records, setRecords] = useState([]);
  const [intern, setIntern] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dtrRes, profRes] = await Promise.all([
        api.get('/dtr', { params: { month: filters.month, year: filters.year, limit: 31 } }),
        api.get('/interns/me/profile'),
      ]);
      setRecords(dtrRes.data.records);
      setIntern(profRes.data.intern);
    } catch {
      toast.error('Failed to load your DTR data.');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalHours = records.reduce((s, r) => s + (r.total_hours || 0), 0);
  const approvedHours = records.filter(r => r.approval_status === 'approved').reduce((s, r) => s + (r.total_hours || 0), 0);

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Daily Time Record</h1>
        <p className="text-gray-500 text-sm">View and export your attendance records</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{records.length}</p>
          <p className="text-xs text-gray-500 mt-1">Days Present</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{totalHours.toFixed(1)}h</p>
          <p className="text-xs text-gray-500 mt-1">Total Hours</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{approvedHours.toFixed(1)}h</p>
          <p className="text-xs text-gray-500 mt-1">Approved Hours</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div className="form-group">
          <label className="form-label">Month</label>
          <select className="form-input form-select text-sm" value={filters.month} onChange={e => setFilters(f => ({ ...f, month: Number(e.target.value) }))}>
            {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Year</label>
          <select className="form-input form-select text-sm" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: Number(e.target.value) }))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* DTR Print Component */}
      {loading ? (
        <div className="card p-8 text-center">
          <Clock className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading DTR records...</p>
        </div>
      ) : (
        <DTRPrint records={records} intern={intern} month={filters.month} year={filters.year} />
      )}
    </div>
  );
}
