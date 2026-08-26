import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Camera, Trash2, Settings2, RotateCcw, ChevronRight, AlertTriangle } from 'lucide-react';
import api from '../../utils/api.js';
import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ACTION_DETAILS = {
  approve: {
    title: 'Approve Attendance',
    button: 'Approve',
    processing: 'Approving...',
    success: 'Attendance approved',
    buttonClass: 'btn-success',
  },
  reject: {
    title: 'Reject Attendance',
    button: 'Reject',
    processing: 'Rejecting...',
    success: 'Attendance rejected',
    buttonClass: 'btn-danger',
  },
  remove: {
    title: 'Remove Rejected Scan',
    button: 'Remove & Allow Rescan',
    processing: 'Removing...',
    success: 'Rejected scan removed. The intern can scan again.',
    buttonClass: 'btn-danger',
  },
  delete: {
    title: 'Delete Attendance Entry',
    button: 'Delete Entry Permanently',
    processing: 'Deleting...',
    success: 'Attendance entry permanently deleted.',
    buttonClass: 'btn-danger',
  },
};

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
    const actionDetails = ACTION_DETAILS[action];
    if (!selected || !actionDetails) return;
    setSaving(true);
    try {
      if (action === 'remove') {
        await api.delete(`/attendance/${selected.id}/rescan`);
      } else if (action === 'delete') {
        await api.delete(`/attendance/${selected.id}`);
      } else {
        await api.patch(`/attendance/${selected.id}/${action}`, { remarks });
      }
      toast.success(actionDetails.success);
      setModal(null);
      setSelected(null);
      fetchLogs();
    } catch (error) {
      toast.error(error?.response?.data?.error || `Failed to ${action} attendance`);
    }
    finally { setSaving(false); }
  };

  const openActions = (log) => {
    setSelected(log);
    setRemarks(log.remarks || '');
    setModal('menu');
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setSelected(null);
    setRemarks('');
  };

  const selectAction = (action) => {
    if (!ACTION_DETAILS[action]) return;
    setModal(action);
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
      render: (_, row) => (
        <button
          id={`attendance-actions-btn-${row.id}`}
          className="btn btn-secondary btn-sm"
          onClick={() => openActions(row)}
        >
          <Settings2 className="w-3.5 h-3.5" /> Manage
        </button>
      )
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Attendance Approval</h1>
        <p className="text-gray-500 text-sm">Review attendance and reopen a rejected scan slot when correction is needed</p>
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

      {/* Attendance action menu and confirmations */}
      <Modal
        isOpen={!!modal}
        onClose={closeModal}
        title={modal === 'menu' ? 'Attendance Actions' : ACTION_DETAILS[modal]?.title || 'Review Attendance'}
        size="sm"
        footer={
          modal !== 'menu' ? (
            <>
              <button className="btn btn-secondary" onClick={() => setModal('menu')} disabled={saving}>Back</button>
              <button
                id={`confirm-${modal}-btn`}
                className={`btn ${ACTION_DETAILS[modal]?.buttonClass || 'btn-primary'}`}
                onClick={() => handleAction(modal)}
                disabled={saving}
              >
                {saving ? ACTION_DETAILS[modal]?.processing || 'Processing...' : ACTION_DETAILS[modal]?.button || 'Confirm'}
              </button>
            </>
          ) : null
        }
      >
        {selected && (
          <div className="space-y-3">
            <div className="attendance-action-summary">
              <div className="attendance-action-summary__header">
                <div>
                  <span className="attendance-action-summary__label">Intern</span>
                  <p className="attendance-action-summary__name">{selected.full_name}</p>
                </div>
                <span className={`badge badge-${selected.approval_status}`}>{selected.approval_status}</span>
              </div>
              <div className="attendance-action-summary__meta">
                <div>
                  <span>Scan type</span>
                  <strong>{selected.scan_type === 'time_in' ? 'Time In' : 'Time Out'}</strong>
                </div>
                <div>
                  <span>Date &amp; time</span>
                  <strong>{selected.scan_time ? format(new Date(selected.scan_time), 'MMM dd, yyyy · hh:mm a') : '—'}</strong>
                </div>
              </div>
            </div>
            {modal === 'menu' ? (
              <div className="attendance-action-list">
                <p className="attendance-action-list__label">Choose an action</p>
                {selected.approval_status !== 'approved' && (
                  <button
                    id={`approve-btn-${selected.id}`}
                    className="attendance-action-row"
                    onClick={() => selectAction('approve')}
                  >
                    <span className="attendance-action-row__icon attendance-action-row__icon--approve">
                      <CheckCircle />
                    </span>
                    <span className="attendance-action-row__content">
                      <strong>Approve attendance</strong>
                      <small>Mark this scan as verified.</small>
                    </span>
                    <ChevronRight className="attendance-action-row__arrow" />
                  </button>
                )}

                {selected.approval_status !== 'rejected' && (
                  <button
                    id={`reject-btn-${selected.id}`}
                    className="attendance-action-row"
                    onClick={() => selectAction('reject')}
                  >
                    <span className="attendance-action-row__icon attendance-action-row__icon--reject">
                      <XCircle />
                    </span>
                    <span className="attendance-action-row__content">
                      <strong>Reject attendance</strong>
                      <small>Reject this scan with optional remarks.</small>
                    </span>
                    <ChevronRight className="attendance-action-row__arrow" />
                  </button>
                )}

                {selected.approval_status === 'rejected' && (
                  <button
                    id={`remove-rescan-btn-${selected.id}`}
                    className="attendance-action-row"
                    onClick={() => selectAction('remove')}
                  >
                    <span className="attendance-action-row__icon attendance-action-row__icon--rescan">
                      <RotateCcw />
                    </span>
                    <span className="attendance-action-row__content">
                      <strong>Remove &amp; allow rescan</strong>
                      <small>Reopen today&apos;s latest scan slot.</small>
                    </span>
                    <ChevronRight className="attendance-action-row__arrow" />
                  </button>
                )}

                <div className="attendance-action-list__divider"><span>Danger zone</span></div>
                <button
                  id={`delete-attendance-btn-${selected.id}`}
                  className="attendance-action-row attendance-action-row--danger"
                  onClick={() => selectAction('delete')}
                >
                  <span className="attendance-action-row__icon attendance-action-row__icon--delete">
                    <Trash2 />
                  </span>
                  <span className="attendance-action-row__content">
                    <strong>Delete entry permanently</strong>
                    <small>Remove the record and its selfie.</small>
                  </span>
                  <ChevronRight className="attendance-action-row__arrow" />
                </button>
              </div>
            ) : modal === 'remove' ? (
              <div className="attendance-action-warning attendance-action-warning--rescan">
                <AlertTriangle />
                <div><strong>Reopen this scan slot?</strong><p>This removes the rejected entry and selfie. It is allowed only for today&apos;s latest scan.</p></div>
              </div>
            ) : modal === 'delete' ? (
              <div className="attendance-action-warning attendance-action-warning--delete">
                <AlertTriangle />
                <div><strong>Delete this entry permanently?</strong><p>The attendance record and its selfie will be removed. This cannot be undone.</p></div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Remarks (optional)</label>
                <textarea className="form-input" rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Add a note..." />
              </div>
            )}
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
