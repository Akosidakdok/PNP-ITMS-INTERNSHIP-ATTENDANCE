import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api.js';
import DTRPrint from '../../components/dtr/DTRPrint.jsx';
import DTRPreviewModal from '../../components/dtr/DTRPreviewModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { Clock, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';

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

const getWorkedMinutes = record => toNonNegativeMinutes(record?.worked_minutes) ?? getRecordMinutes(record);
const getApprovedMinutes = record => toNonNegativeMinutes(record?.approved_minutes)
  ?? (record?.approval_status === 'approved' ? getRecordMinutes(record) : 0);

const formatDuration = (value) => {
  const minutes = toNonNegativeMinutes(value) ?? 0;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};

export default function MyDTR() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [intern, setIntern] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedRecordForPreview, setSelectedRecordForPreview] = useState(null);
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });

  const handleRowClick = (day, record) => {
    const dateStr = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const defaultTimeIn = intern?.assigned_profile?.time_in ? intern.assigned_profile.time_in.slice(0, 5) : '08:00';
    const defaultTimeOut = intern?.assigned_profile?.time_out ? intern.assigned_profile.time_out.slice(0, 5) : '17:00';
    const targetRecord = record || {
      date: dateStr,
      attendance_date: dateStr,
      time_in: defaultTimeIn,
      am_time_in: defaultTimeIn,
      time_out: defaultTimeOut,
      pm_time_out: defaultTimeOut,
      approval_status: 'approved',
    };
    setSelectedRecordForPreview(targetRecord);
    setPreviewModalOpen(true);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dtrRes, profRes] = await Promise.all([
        api.get('/dtr', { params: { month: filters.month, year: filters.year, limit: 31 } }),
        api.get('/interns/me/profile'),
      ]);
      setRecords(dtrRes.data?.records || []);
      setSummary(dtrRes.data?.summary || null);
      setIntern(profRes.data.intern);
    } catch {
      toast.error('Failed to load your DTR data.');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fallbackWorkedMinutes = records.reduce((sum, record) => sum + getWorkedMinutes(record), 0);
  const fallbackApprovedMinutes = records.reduce((sum, record) => sum + getApprovedMinutes(record), 0);
  const workedMinutes = toNonNegativeMinutes(summary?.worked_minutes) ?? fallbackWorkedMinutes;
  const approvedMinutes = toNonNegativeMinutes(summary?.approved_minutes) ?? fallbackApprovedMinutes;
  const daysPresent = toNonNegativeMinutes(summary?.days_present) ?? records.length;

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040];

  return (
    <div className="space-y-6 animate-fade-in dtr-page dtr-intern-page">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Daily Time Record</h1>
        <p className="text-gray-500 text-sm">View and export your attendance records</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{daysPresent}</p>
          <p className="text-xs text-gray-500 mt-1">Days Present</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{formatDuration(workedMinutes)}</p>
          <p className="text-xs text-gray-500 mt-1">Total Hours</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{formatDuration(approvedMinutes)}</p>
          <p className="text-xs text-gray-500 mt-1">Approved Hours</p>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="card p-4 flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end justify-between dtr-filter-card">
        <div className="flex flex-wrap gap-3 items-end dtr-filter-fields">
          <div className="form-group">
            <label className="form-label">Month</label>
            <select className="form-input form-select text-sm w-full sm:w-auto" value={filters.month} onChange={e => setFilters(f => ({ ...f, month: Number(e.target.value) }))}>
              {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Year</label>
            <select className="form-input form-select text-sm w-full sm:w-auto" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: Number(e.target.value) }))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="dtr-filter-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            onClick={() => {
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              const existing = records.find(r => r.date === todayStr);
              const defaultTimeIn = intern?.assigned_profile?.time_in ? intern.assigned_profile.time_in.slice(0, 5) : '08:00';
              const defaultTimeOut = intern?.assigned_profile?.time_out ? intern.assigned_profile.time_out.slice(0, 5) : '17:00';
              setSelectedRecordForPreview(existing || {
                date: todayStr,
                attendance_date: todayStr,
                time_in: defaultTimeIn,
                am_time_in: defaultTimeIn,
                time_out: defaultTimeOut,
                pm_time_out: defaultTimeOut,
                approval_status: 'approved',
              });
              setPreviewModalOpen(true);
            }}
          >
            <ImageIcon className="w-4 h-4 text-blue-600" />
            Preview DTR Image
          </button>
        </div>
      </div>

      {/* DTR Print Component */}
      {loading ? (
        <div className="card p-8 text-center">
          <Clock className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading DTR records...</p>
        </div>
      ) : (
        <div className="table-responsive">
          <DTRPrint
            records={records}
            intern={intern}
            month={filters.month}
            year={filters.year}
            onRowClick={handleRowClick}
          />
        </div>
      )}

      {previewModalOpen && selectedRecordForPreview && (
        <DTRPreviewModal
          isOpen={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          record={selectedRecordForPreview}
          intern={intern}
          currentUser={user}
        />
      )}
    </div>
  );
}
