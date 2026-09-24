import { useState, useEffect, useRef } from 'react';
import {
  Download, Clock, Shield, ShieldCheck, AlertCircle,
  Calendar, CheckCircle, FileText, User, RefreshCw, History
} from 'lucide-react';
import Modal from '../common/Modal.jsx';
import api from '../../utils/api.js';
import toast from 'react-hot-toast';
import domtoimage from 'dom-to-image-more';
import DTRHistoryModal from './DTRHistoryModal.jsx';

// Month names helper
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** Formats YYYY-MM-DD into "September 22, 2026" without timezone shift */
function formatOfficialDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  return `${MONTH_NAMES[monthIndex] || ''} ${day}, ${year}`;
}

/** Formats time string (HH:MM or HH:MM:SS) into "08:00 AM" */
function format12Hour(timeStr) {
  if (!timeStr) return '--:--';
  try {
    const trimmed = timeStr.trim();
    // Already in 12-hour AM/PM format
    if (/AM|PM/i.test(trimmed)) return trimmed.toUpperCase();
    const [hStr, mStr] = trimmed.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch {
    return timeStr;
  }
}

export default function DTRPreviewModal({
  isOpen,
  onClose,
  record,
  intern,
  currentUser,
  onSaveSuccess,
}) {
  const previewRef = useRef(null);
  const isSuperadmin = currentUser?.role === 'superadmin';

  // Internal state for the active record being previewed
  const [activeRecord, setActiveRecord] = useState(record);
  const [isExporting, setIsExporting] = useState(false);

  // Superadmin editing form state
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTimeIn, setEditTimeIn] = useState('');
  const [editTimeOut, setEditTimeOut] = useState('');
  const [editStatus, setEditStatus] = useState('approved');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (isOpen && record) {
      setActiveRecord(record);
      setEditDate(record.date || record.attendance_date || '');
      setEditTimeIn(record.time_in || record.am_time_in || '');
      setEditTimeOut(record.time_out || record.pm_time_out || '');
      setEditStatus(record.approval_status || record.status || 'approved');
      setEditReason('');
      setIsEditing(false);
    }
  }, [isOpen, record]);

  if (!isOpen || !activeRecord) return null;

  const officialDateKey = activeRecord.date || activeRecord.attendance_date || '';
  const officialDateFormatted = formatOfficialDate(officialDateKey);
  const officialTimeIn = format12Hour(activeRecord.time_in || activeRecord.am_time_in);
  const officialTimeOut = format12Hour(activeRecord.time_out || activeRecord.pm_time_out);
  const actualTimeIn = activeRecord.actual_time_in ? format12Hour(activeRecord.actual_time_in) : 'N/A';
  const actualTimeOut = activeRecord.actual_time_out ? format12Hour(activeRecord.actual_time_out) : 'N/A';
  const approvalStatus = activeRecord.approval_status || activeRecord.status || 'pending';

  const assignedProfileName = intern?.assigned_profile?.profile_name
    || intern?.profile_name
    || activeRecord.profile_name
    || 'Regular 8AM–5PM';

  // Handle Superadmin saving DTR edit
  const handleSaveEdit = async (e) => {
    e?.preventDefault();
    if (!editReason.trim()) {
      toast.error('A modification reason is strictly required before saving.');
      return;
    }

    setSaving(true);
    const internId = intern?.id || activeRecord.intern_id || activeRecord.account_id;
    const origDate = activeRecord.date || activeRecord.attendance_date;

    try {
      const payload = {
        date: origDate,
        new_date: editDate !== origDate ? editDate : undefined,
        time_in: editTimeIn,
        time_out: editTimeOut,
        status: editStatus,
        reason: editReason.trim(),
      };

      const res = await api.put(`/admin/dtr/${internId}/edit`, payload);

      // Immediately regenerate preview using the updated official DTR values
      const updated = {
        ...activeRecord,
        date: res.data?.attendance_date || editDate,
        attendance_date: res.data?.attendance_date || editDate,
        time_in: res.data?.recorded_time_in || editTimeIn,
        am_time_in: res.data?.recorded_time_in || editTimeIn,
        time_out: res.data?.recorded_time_out || editTimeOut,
        pm_time_out: res.data?.recorded_time_out || editTimeOut,
        approval_status: res.data?.status || editStatus,
        status: res.data?.status || editStatus,
      };

      setActiveRecord(updated);
      setIsEditing(false);
      setEditReason('');
      toast.success('Official DTR updated. Preview regenerated successfully.');

      if (onSaveSuccess) {
        onSaveSuccess(updated);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update official DTR record.');
    } finally {
      setSaving(false);
    }
  };

  // Export Preview Image (PNG)
  const handleDownloadImage = async () => {
    const el = previewRef.current;
    if (!el) return;

    setIsExporting(true);
    const toastId = toast.loading('Generating official DTR preview image...');

    try {
      // Temporarily hide elements with .no-export
      const noExportEls = el.querySelectorAll('.no-export');
      const originalDisplays = [];
      noExportEls.forEach(node => {
        originalDisplays.push(node.style.display);
        node.style.display = 'none';
      });

      const dataUrl = await domtoimage.toPng(el, {
        bgcolor: '#ffffff',
        scale: 2, // High resolution
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        },
      });

      // Restore hidden elements
      noExportEls.forEach((node, idx) => {
        node.style.display = originalDisplays[idx];
      });

      const internNameSlug = (intern?.full_name || 'Intern').replace(/\s+/g, '_');
      const filename = `DTR_Preview_${internNameSlug}_${officialDateKey}.png`;

      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();

      toast.dismiss(toastId);
      toast.success('DTR preview image downloaded successfully!');
    } catch (err) {
      console.error('Preview image export error:', err);
      toast.dismiss(toastId);
      toast.error(`Failed to export image: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-700" />
            <span className="font-bold">Official DTR Attendance Preview</span>
            {isSuperadmin && (
              <span className="text-xs bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full ml-1">
                Superadmin Control
              </span>
            )}
          </div>
        }
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3 w-full dtr-preview-footer">
            <div className="flex items-center gap-2">
              {isSuperadmin && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                  onClick={() => setHistoryOpen(true)}
                >
                  <History className="w-3.5 h-3.5 text-blue-600" />
                  View Audit History
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800"
                onClick={handleDownloadImage}
                disabled={isExporting}
              >
                <Download className="w-4 h-4" />
                {isExporting ? 'Exporting...' : 'Download Preview Image (PNG)'}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Superadmin Editor Panel */}
          {isSuperadmin && (
            <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-700" />
                  <span className="font-bold text-gray-800 text-sm">Superadmin DTR Control</span>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm text-xs ${isEditing ? 'btn-secondary' : 'btn-primary bg-blue-700 hover:bg-blue-800'}`}
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? 'Cancel Editing' : 'Edit Official DTR'}
                </button>
              </div>

              {isEditing ? (
                <form onSubmit={handleSaveEdit} className="space-y-3 pt-2 border-t border-slate-200">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-gray-700 block mb-1">Attendance Date</label>
                      <input
                        type="date"
                        className="form-input text-xs w-full font-medium"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-gray-700 block mb-1">Official Time In</label>
                      <input
                        type="time"
                        className="form-input text-xs w-full font-medium"
                        value={editTimeIn}
                        onChange={(e) => setEditTimeIn(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-gray-700 block mb-1">Official Time Out</label>
                      <input
                        type="time"
                        className="form-input text-xs w-full font-medium"
                        value={editTimeOut}
                        onChange={(e) => setEditTimeOut(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-gray-700 block mb-1">Approval Status</label>
                      <select
                        className="form-input form-select text-xs w-full"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                      >
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-gray-700 block mb-1">
                        Modification Reason <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-input text-xs w-full"
                        placeholder="e.g. Official attendance correction approved by supervisor"
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setIsEditing(false)}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm bg-blue-700 hover:bg-blue-800"
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes & Regenerate Preview'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 text-[11px]">
                  <div>
                    <span className="text-gray-500 block">Actual Scan In</span>
                    <span className="font-semibold text-gray-800">{actualTimeIn}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Actual Scan Out</span>
                    <span className="font-semibold text-gray-800">{actualTimeOut}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Assigned Profile</span>
                    <span className="font-semibold text-blue-700 truncate block">{assignedProfileName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Audit Status</span>
                    <span className="font-semibold text-emerald-700">Protected</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              THE OFFICIAL DTR PREVIEW IMAGE CARD (DOM Element to PNG)
          ───────────────────────────────────────────────────────────── */}
          <div className="overflow-x-auto flex justify-center py-2 dtr-preview-viewport">
            <div
              ref={previewRef}
              id="dtr-preview-image-card"
              className="dtr-preview-card"
              style={{
                fontFamily: 'Arial, sans-serif',
                color: '#111827',
                backgroundColor: '#ffffff',
                width: '600px',
                minWidth: '550px',
                padding: '28px',
                border: '1px solid #d1d5db',
                borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                boxSizing: 'border-box',
              }}
            >
              {/* Header with official logos */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '2px solid #000', paddingBottom: '12px' }}>
                <img
                  src="/PNP_LOGO.png"
                  alt="PNP Logo"
                  style={{ width: '60px', height: '60px', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />

                <div style={{ textAlign: 'center', flex: 1, lineHeight: '1.3' }}>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Republic of the Philippines</div>
                  <div style={{ fontSize: '10px', fontWeight: 'bold' }}>NATIONAL POLICE COMMISSION</div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>PHILIPPINE NATIONAL POLICE</div>
                  <div style={{ fontSize: '11px', fontWeight: 'bold' }}>INFORMATION TECHNOLOGY MANAGEMENT SERVICE</div>
                  <div style={{ fontSize: '9px', color: '#4b5563' }}>Camp BGen Rafael T Crame, Quezon City</div>
                </div>

                <img
                  src="/ITMS_LOGO.png"
                  alt="ITMS Logo"
                  style={{ width: '60px', height: '60px', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>

              {/* Title */}
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', color: '#1d4ed8' }}>
                  On-the-Job Training Program
                </div>
                <div style={{ fontSize: '15px', fontWeight: '900', textDecoration: 'underline', marginTop: '2px' }}>
                  DAILY TIME RECORD – ATTENDANCE PREVIEW
                </div>
              </div>

              {/* Personnel Information Card */}
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '11px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  <div>
                    <span style={{ color: '#64748b', fontWeight: 'bold' }}>Name: </span>
                    <span style={{ fontWeight: 'bold', color: '#0f172a' }}>
                      {intern?.full_name || intern?.username || 'Authorized Personnel'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontWeight: 'bold' }}>Student / Badge ID: </span>
                    <span style={{ fontWeight: 'bold' }}>{intern?.student_id || intern?.id || 'N/A'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontWeight: 'bold' }}>School: </span>
                    <span>{intern?.school || 'N/A'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontWeight: 'bold' }}>Division: </span>
                    <span>{intern?.division_name || 'ITMS'}</span>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#64748b', fontWeight: 'bold' }}>Attendance Profile: </span>
                    <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                      {assignedProfileName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Official Attendance Date and Time Block */}
              <div style={{ border: '2px solid #1e3a8a', borderRadius: '10px', padding: '16px', marginBottom: '16px', backgroundColor: '#ffffff' }}>
                {/* Official Date */}
                <div style={{ textAlign: 'center', marginBottom: '14px', borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Official Attendance Date
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a', marginTop: '2px' }}>
                    {officialDateFormatted || 'Official Date Not Set'}
                  </div>
                </div>

                {/* Official Time In & Time Out Display Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', textAlign: 'center' }}>
                  {/* TIME IN */}
                  <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      TIME IN
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: '900', color: '#1e3a8a', marginTop: '4px', letterSpacing: '0.5px' }}>
                      {officialTimeIn}
                    </div>
                    <div style={{ fontSize: '9px', color: '#60a5fa', marginTop: '2px' }}>
                      Official DTR Record
                    </div>
                  </div>

                  {/* TIME OUT */}
                  <div style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      TIME OUT
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: '900', color: '#881337', marginTop: '4px', letterSpacing: '0.5px' }}>
                      {officialTimeOut}
                    </div>
                    <div style={{ fontSize: '9px', color: '#f43f5e', marginTop: '2px' }}>
                      Official DTR Record
                    </div>
                  </div>
                </div>

                {/* Hours & Status Summary */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Rendered Hours: </span>
                    <span style={{ fontWeight: 'bold', color: '#0f172a' }}>
                      {activeRecord.is_complete ? `${activeRecord.total_hours || 8} hrs` : (activeRecord.total_hours ? `${activeRecord.total_hours} hrs` : 'Pending completion')}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Overall Status: </span>
                    <span style={{
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: approvalStatus === 'approved' ? '#dcfce7' : approvalStatus === 'rejected' ? '#fee2e2' : '#fef9c3',
                      color: approvalStatus === 'approved' ? '#15803d' : approvalStatus === 'rejected' ? '#b91c1c' : '#854d0e',
                      border: approvalStatus === 'approved' ? '1px solid #86efac' : approvalStatus === 'rejected' ? '1px solid #fca5a5' : '1px solid #fde047',
                    }}>
                      {approvalStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Trainee & Supervisor Signature Lines */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '24px', fontSize: '10px', textAlign: 'center' }}>
                <div>
                  <div style={{ borderBottom: '1px solid #000', marginBottom: '4px', height: '24px' }}></div>
                  <div style={{ fontWeight: 'bold' }}>Trainee&apos;s Signature</div>
                </div>
                <div>
                  <div style={{ borderBottom: '1px solid #000', marginBottom: '4px', height: '24px' }}></div>
                  <div style={{ fontWeight: 'bold' }}>Supervisor&apos;s Signature</div>
                </div>
              </div>

              {/* Watermark / Verification notice */}
              <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', fontSize: '8px', color: '#94a3b8' }}>
                Generated from official PNP-ITMS Attendance Record • Authentic DTR Document
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Audit Modification History Modal */}
      {historyOpen && (
        <DTRHistoryModal
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          internId={intern?.id || activeRecord.intern_id || activeRecord.account_id}
          internName={intern?.full_name || null}
        />
      )}
    </>
  );
}
