import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, Filter, Calendar, Camera } from 'lucide-react';
import api from '../../utils/api.js';
import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function AttendanceApproval() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: 'pending', date: '' });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/logs', { params: { ...filters, page, limit: 15 } });
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load attendance'); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleAction = async (action) => {
    setSaving(true);
    try {
      await api.patch(`/attendance/${selected.id}/${action}`, { remarks });
      toast.success(`Attendance ${action}d`);
      setModal(null);
      fetchLogs();
    } catch { toast.error(`Failed to ${action} attendance`); }
    finally { setSaving(false); }
  };

  const openModal = (log, type) => {
    setSelected(log);
    setRemarks('');
    setModal(type);
  };

  const columns = [
    {
      key: 'full_name', label: 'Intern',
      render: (v, row) => (
        <div>
          <p className="font-medium text-sm text-gray-800">{v}</p>
          <p className="text-xs text-gray-400">{row.division_name || row.department_name || '—'}</p>
        </div>
      )
    },
    {
      key: 'scan_type', label: 'Type',
      render: v => <span className={`badge ${v === 'time_in' ? 'badge-time-in' : 'badge-time-out'}`}>{v === 'time_in' ? 'Time In' : 'Time Out'}</span>
    },
    {
      key: 'scan_time', label: 'Date & Time',
      render: v => (
        <div>
          <p className="text-sm font-medium">{format(new Date(v), 'MMM dd, yyyy')}</p>
          <p className="text-xs text-gray-400">{format(new Date(v), 'hh:mm:ss a')}</p>
        </div>
      )
    },
    {
      key: 'approval_status', label: 'Status',
      render: v => <span className={`badge badge-${v}`}>{v}</span>
    },
    { key: 'remarks', label: 'Remarks', render: v => <span className="text-xs text-gray-500">{v || '—'}</span> },
    {
      key: 'photo', label: 'Selfie Preview',
      render: (v) => {
        if (!v) return <span className="text-xs text-gray-400">—</span>;
        return (
          <button 
            className="btn btn-ghost btn-sm text-blue-600 font-semibold flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded"
            onClick={() => setPreviewPhoto(v)}
          >
            <Camera className="w-3.5 h-3.5" strokeWidth={2} /> Preview
          </button>
        );
      }
    },
    {
      key: 'id', label: 'Actions',
      render: (_, row) => row.approval_status === 'pending' ? (
        <div className="flex gap-1">
          <button id={`approve-btn-${row.id}`} className="btn btn-success btn-sm" onClick={() => openModal(row, 'approve')}>
            <CheckCircle className="w-3.5 h-3.5" /> Approve
          </button>
          <button id={`reject-btn-${row.id}`} className="btn btn-danger btn-sm" onClick={() => openModal(row, 'reject')}>
            <XCircle className="w-3.5 h-3.5" /> Reject
          </button>
        </div>
      ) : <span className="text-xs text-gray-400">—</span>
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Attendance Approval</h1>
        <p className="text-gray-500 text-sm">Review and approve intern attendance records</p>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end">
        <div className="form-group w-full sm:w-auto">
          <label className="form-label">Status</label>
          <select className="form-input form-select text-sm w-full sm:w-auto" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="form-group w-full sm:w-auto">
          <label className="form-label">Date</label>
          <input type="date" className="form-input text-sm w-full sm:w-auto" value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))} />
        </div>
        <button className="btn btn-secondary btn-sm w-full sm:w-auto" onClick={() => setFilters({ status: 'pending', date: '' })}>Reset</button>
      </div>

      <div className="table-responsive">
        <DataTable
          columns={columns}
          data={logs}
          loading={loading}
          total={total}
          page={page}
          limit={15}
          onPageChange={setPage}
          emptyMessage="No attendance records found"
        />
      </div>

      {/* Approve/Reject Modal */}
      <Modal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'approve' ? 'Approve Attendance' : 'Reject Attendance'}
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button
              id={`confirm-${modal}-btn`}
              className={`btn ${modal === 'approve' ? 'btn-success' : 'btn-danger'}`}
              onClick={() => handleAction(modal)}
              disabled={saving}
            >
              {saving ? 'Processing...' : modal === 'approve' ? 'Approve' : 'Reject'}
            </button>
          </>
        }
      >
        {selected && (
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <p><strong>Intern:</strong> {selected.full_name}</p>
              <p><strong>Type:</strong> {selected.scan_type === 'time_in' ? 'Time In' : 'Time Out'}</p>
              <p><strong>Time:</strong> {selected.scan_time ? format(new Date(selected.scan_time), 'MMM dd, yyyy hh:mm a') : '—'}</p>
            </div>
            <div className="form-group">
              <label className="form-label">Remarks (optional)</label>
              <textarea className="form-input" rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Add a note..." />
            </div>
          </div>
        )}
      </Modal>

      {/* Selfie Preview Modal */}
      <Modal
        isOpen={!!previewPhoto}
        onClose={() => setPreviewPhoto(null)}
        title="Selfie Verification Preview"
        size="sm"
        footer={
          <button className="btn btn-secondary w-full" onClick={() => setPreviewPhoto(null)}>Close</button>
        }
      >
        <div className="flex flex-col items-center justify-center p-2">
          {previewPhoto ? (
            <img src={previewPhoto} alt="Intern Selfie" className="rounded-xl max-w-full h-auto border shadow-sm" />
          ) : (
            <p className="text-gray-500">No photo available</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
