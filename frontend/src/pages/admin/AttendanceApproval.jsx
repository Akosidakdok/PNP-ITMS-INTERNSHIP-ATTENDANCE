import { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle, XCircle, Camera, Trash2, Settings2, RotateCcw, ChevronRight, AlertTriangle, Edit3, Eye, ShieldCheck, Download, Calendar } from 'lucide-react';
import api from '../../utils/api.js';
import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';
import DTREditModal from '../../components/dtr/DTREditModal.jsx';
import DTRPreviewModal from '../../components/dtr/DTRPreviewModal.jsx';
import BulkDTROverrideModal from '../../components/dtr/BulkDTROverrideModal.jsx';

function WatermarkedSelfie({ photoUrl, recordDate, recordTime }) {
  const [mode, setMode] = useState('official'); // 'official' | 'audit'
  const [renderedUrl, setRenderedUrl] = useState(photoUrl);

  const officialStamp = useMemo(() => {
    if (!recordDate || !recordTime) return '';
    let timeFormatted = recordTime;
    if (!/AM|PM/i.test(recordTime)) {
      const [hStr, mStr, sStr] = recordTime.split(':');
      let h = parseInt(hStr, 10);
      const m = mStr || '00';
      const s = sStr || '00';
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      timeFormatted = `${String(h).padStart(2, '0')}:${m}:${s} ${ampm}`;
    } else if (!/:\d{2}:\d{2}/.test(recordTime)) {
      timeFormatted = recordTime.replace(/^(\d{2}:\d{2})\s*(AM|PM)$/i, '$1:00 $2');
    }
    return `${recordDate} ${timeFormatted}`;
  }, [recordDate, recordTime]);

  useEffect(() => {
    if (!photoUrl) return;
    if (mode === 'audit') {
      setRenderedUrl(photoUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = photoUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 640;
      canvas.height = img.naturalHeight || img.height || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      if (officialStamp) {
        ctx.save();
        ctx.font = 'bold 18px sans-serif';
        const textMetrics = ctx.measureText(officialStamp);
        const textWidth = textMetrics.width;

        // Cleanly cover the bottom-left watermark area
        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(8, canvas.height - 40, textWidth + 18, 30, 4);
        } else {
          ctx.rect(8, canvas.height - 40, textWidth + 18, 30);
        }
        ctx.fill();

        // Render official watermark
        ctx.font = 'bold 18px sans-serif';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        ctx.fillText(officialStamp, 14, canvas.height - 18);
        ctx.restore();
      }

      setRenderedUrl(canvas.toDataURL('image/jpeg', 0.9));
    };
  }, [photoUrl, mode, officialStamp]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = renderedUrl;
    link.download = `selfie_${recordDate}_${mode}.jpg`;
    link.click();
  };

  return (
    <div className="space-y-2.5 w-full flex flex-col items-center">
      <div className="flex items-center justify-between w-full px-1 text-xs">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
          <button
            type="button"
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              mode === 'official'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setMode('official')}
          >
            Official Watermark
          </button>
          <button
            type="button"
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              mode === 'audit'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setMode('audit')}
          >
            Original Camera Watermark
          </button>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          className="text-slate-600 hover:text-blue-600 font-medium flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded shadow-xs"
        >
          <Download className="w-3.5 h-3.5" /> Save Image
        </button>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-black flex justify-center w-full">
        <img
          src={renderedUrl}
          alt="Intern Selfie"
          className="max-h-[360px] w-auto object-contain rounded-lg"
        />
      </div>
    </div>
  );
}

const formatPhtDate = value => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
}).format(new Date(value));

const formatPhtTime = (value, includeSeconds = false) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  minute: '2-digit',
  ...(includeSeconds ? { second: '2-digit' } : {}),
  hour12: true,
}).format(new Date(value));

const getPhtDateStr = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(value));
};

const getPht24HourTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
};

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
  const { user } = useAuth();
  const isSuperadmin = user?.role?.toLowerCase() === 'superadmin';
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: 'pending', date: '' });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [dtrPreviewOpen, setDtrPreviewOpen] = useState(false);
  const [dtrEditOpen, setDtrEditOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

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
          <p className="text-sm font-medium">{formatPhtDate(v)}</p>
          <p className="text-xs text-gray-400">{formatPhtTime(v, true)}</p>
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
      render: (v, row) => {
        if (!v) return <span className="text-xs text-gray-400">—</span>;
        return (
          <button 
            className="btn btn-ghost btn-sm text-blue-600 font-semibold flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded"
            onClick={() => setPreviewRecord(row)}
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Attendance Approval</h1>
          <p className="text-gray-500 text-sm">Review attendance and reopen a rejected scan slot when correction is needed</p>
        </div>
        <button
          type="button"
          id="attendance-bulk-override-btn"
          className="btn btn-secondary flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 self-start sm:self-auto"
          onClick={() => setBulkModalOpen(true)}
        >
          <Calendar className="w-4 h-4 text-blue-600" /> Bulk DTR Override
        </button>
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
                  <strong>{selected.scan_time ? `${formatPhtDate(selected.scan_time)} · ${formatPhtTime(selected.scan_time)}` : '—'}</strong>
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

      {/* Selfie Verification Preview Modal */}
      <Modal
        isOpen={!!previewRecord}
        onClose={() => setPreviewRecord(null)}
        title="Selfie Verification Preview"
        size="md"
        footer={
          <div className="flex items-center justify-between w-full gap-2 flex-wrap">
            {isSuperadmin ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="selfie-edit-official-time-btn"
                  className="btn btn-sm btn-primary flex items-center gap-1.5"
                  onClick={() => setDtrEditOpen(true)}
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Official Time
                </button>
                <button
                  type="button"
                  id="selfie-view-dtr-card-btn"
                  className="btn btn-sm btn-secondary flex items-center gap-1.5"
                  onClick={() => setDtrPreviewOpen(true)}
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-600" /> DTR Preview
                </button>
              </div>
            ) : <div />}
            <button className="btn btn-secondary btn-sm" onClick={() => setPreviewRecord(null)}>Close</button>
          </div>
        }
      >
        <div className="space-y-3 p-1">
          {previewRecord?.photo ? (
            <WatermarkedSelfie
              photoUrl={previewRecord.photo}
              recordDate={getPhtDateStr(previewRecord.scan_time)}
              recordTime={formatPhtTime(previewRecord.scan_time, false)}
            />
          ) : (
            <p className="text-gray-500 text-center py-6">No photo available</p>
          )}

          {previewRecord && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{previewRecord.full_name}</p>
                  <p className="text-gray-500">{previewRecord.division_name || previewRecord.department_name || 'PNP ITMS'}</p>
                </div>
                <span className={`badge ${previewRecord.scan_type === 'time_in' ? 'badge-time-in' : 'badge-time-out'}`}>
                  {previewRecord.scan_type === 'time_in' ? 'Time In' : 'Time Out'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white p-2 rounded border border-slate-100">
                  <span className="text-gray-500 block font-medium">Official Date</span>
                  <span className="font-semibold text-gray-800 text-sm">{formatPhtDate(previewRecord.scan_time)}</span>
                </div>
                <div className="bg-white p-2 rounded border border-slate-100">
                  <span className="text-gray-500 block font-medium">Official Recorded Time</span>
                  <span className="font-semibold text-blue-700 text-sm">{formatPhtTime(previewRecord.scan_time, false)}</span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-900 flex items-start gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Camera Biometric Scan (Audit): </span>
                  <span className="font-mono font-medium">{previewRecord.actual_scan_time ? formatPhtTime(previewRecord.actual_scan_time, true) : formatPhtTime(previewRecord.scan_time, true)}</span>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    The camera watermark timestamp is permanently retained for biometric audit integrity. Superadmins can modify the official DTR Date and Time above at any time without rescanning.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Superadmin DTR Edit Modal */}
      {previewRecord && (
        <DTREditModal
          isOpen={dtrEditOpen}
          onClose={() => setDtrEditOpen(false)}
          intern={{ id: previewRecord.intern_id, full_name: previewRecord.full_name }}
          date={getPhtDateStr(previewRecord.scan_time)}
          record={{
            date: getPhtDateStr(previewRecord.scan_time),
            attendance_date: getPhtDateStr(previewRecord.scan_time),
            time_in: previewRecord.scan_type === 'time_in' ? getPht24HourTime(previewRecord.scan_time) : '',
            time_out: previewRecord.scan_type === 'time_out' ? getPht24HourTime(previewRecord.scan_time) : '',
            approval_status: previewRecord.approval_status || 'approved',
          }}
          onSaveSuccess={() => {
            fetchLogs();
            setPreviewRecord(null);
          }}
        />
      )}

      {/* Official DTR Preview Modal */}
      {previewRecord && (
        <DTRPreviewModal
          isOpen={dtrPreviewOpen}
          onClose={() => setDtrPreviewOpen(false)}
          intern={{ id: previewRecord.intern_id, full_name: previewRecord.full_name }}
          currentUser={user}
          record={{
            date: getPhtDateStr(previewRecord.scan_time),
            attendance_date: getPhtDateStr(previewRecord.scan_time),
            time_in: previewRecord.scan_type === 'time_in' ? getPht24HourTime(previewRecord.scan_time) : '',
            am_time_in: previewRecord.scan_type === 'time_in' ? getPht24HourTime(previewRecord.scan_time) : '',
            time_out: previewRecord.scan_type === 'time_out' ? getPht24HourTime(previewRecord.scan_time) : '',
            pm_time_out: previewRecord.scan_type === 'time_out' ? getPht24HourTime(previewRecord.scan_time) : '',
            approval_status: previewRecord.approval_status || 'approved',
          }}
          onSaveSuccess={() => {
            fetchLogs();
          }}
        />
      )}
      {/* Bulk Override Modal */}
      <BulkDTROverrideModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={fetchLogs}
      />
    </div>
  );
}
