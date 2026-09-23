import { useState, useEffect } from 'react';
import { Clock, Calendar, RotateCcw, ShieldCheck, AlertCircle, Check, Info } from 'lucide-react';
import Modal from '../common/Modal.jsx';
import api from '../../utils/api.js';
import toast from 'react-hot-toast';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatShortDateWithDay(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const dateObj = new Date(y, m, d);
  const dayName = DAY_NAMES[dateObj.getDay()];
  const monthName = MONTH_NAMES[m];
  return `${monthName} ${String(d).padStart(2, '0')} (${dayName})`;
}

export default function DTRBatchAlterModal({
  isOpen,
  onClose,
  intern,
  selectedDates = [],
  onSaveSuccess,
  existingRecords = [],
}) {
  const [activeTab, setActiveTab] = useState('time'); // 'time' | 'override' | 'clear'
  const [timeIn, setTimeIn] = useState('08:00');
  const [timeOut, setTimeOut] = useState('17:00');
  const [status, setStatus] = useState('approved');

  // Override options
  const [overrideType, setOverrideType] = useState('suspended'); // 'suspended' | 'excused' | 'hours' | 'others'
  const [overrideHours, setOverrideHours] = useState(8);
  const [overrideRemarks, setOverrideRemarks] = useState('');

  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // If 1 date is selected, attempt to pre-populate with existing record
  useEffect(() => {
    if (isOpen) {
      setReason('');
      if (selectedDates.length === 1) {
        const targetDate = selectedDates[0];
        const existing = existingRecords.find(r => (r.date === targetDate || r.attendance_date === targetDate));
        if (existing) {
          if (existing.is_override) {
            setActiveTab('override');
            setOverrideType(existing.override_type || 'suspended');
            setOverrideHours(existing.total_hours || 8);
            setOverrideRemarks(existing.remarks || '');
          } else {
            setActiveTab('time');
            setTimeIn(existing.time_in ? existing.time_in.slice(0, 5) : '08:00');
            setTimeOut(existing.time_out ? existing.time_out.slice(0, 5) : '17:00');
            setStatus(existing.approval_status || 'approved');
          }
        } else {
          setActiveTab('time');
          setTimeIn('08:00');
          setTimeOut('17:00');
          setStatus('approved');
        }
      } else {
        // Multi-date default
        setActiveTab('time');
        setTimeIn('08:00');
        setTimeOut('17:00');
        setStatus('approved');
        setOverrideType('suspended');
        setOverrideHours(8);
        setOverrideRemarks('');
      }
    }
  }, [isOpen, selectedDates, existingRecords]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('A modification reason is required for audit history.');
      return;
    }
    if (!intern?.id) {
      toast.error('Intern identifier is missing.');
      return;
    }
    if (selectedDates.length === 0) {
      toast.error('No dates selected.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        dates: selectedDates,
        mode: activeTab,
        reason: reason.trim(),
      };

      if (activeTab === 'time') {
        payload.time_in = timeIn;
        payload.time_out = timeOut;
        payload.status = status;
      } else if (activeTab === 'override') {
        payload.override_type = overrideType.toUpperCase();
        payload.hours = (overrideType === 'hours' || overrideType === 'others') ? Number(overrideHours) : (overrideType === 'excused' ? 8 : 0);
        payload.remarks = overrideRemarks.trim();
      } else if (activeTab === 'clear') {
        payload.override_type = 'NONE';
      }

      await api.put(`/admin/dtr/${intern.id}/batch-alter`, payload);
      toast.success(
        selectedDates.length === 1
          ? `DTR updated for ${selectedDates[0]} with audit log.`
          : `Successfully altered ${selectedDates.length} attendance dates!`
      );
      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to alter attendance';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const count = selectedDates.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {count === 1 ? 'Alter Attendance Record' : `Alter Attendance (${count} Dates Selected)`}
          </span>
          <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
            Superadmin
          </span>
        </div>
      }
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            className="btn btn-secondary text-xs"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary text-xs flex items-center gap-1.5"
            onClick={handleSubmit}
            disabled={saving}
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? 'Applying Changes...' : `Apply to ${count} Date${count > 1 ? 's' : ''}`}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Trainee Info & Selected Dates Summary */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="font-semibold text-slate-700">Trainee / Intern:</span>
            <span className="font-bold text-blue-900">{intern?.full_name || 'Selected Intern'}</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-500 font-medium">Selected Date{count > 1 ? 's' : ''} ({count}):</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
              {selectedDates.map(d => (
                <span
                  key={d}
                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200"
                >
                  {formatShortDateWithDay(d)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'time'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('time')}
          >
            <Clock className="w-3.5 h-3.5" /> Official Time
          </button>
          <button
            type="button"
            className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'override'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('override')}
          >
            <Calendar className="w-3.5 h-3.5" /> Schedule Override
          </button>
          <button
            type="button"
            className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'clear'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('clear')}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset / Clear
          </button>
        </div>

        {/* Tab 1: Official Time */}
        {activeTab === 'time' && (
          <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Quick Presets:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                  onClick={() => { setTimeIn('08:00'); setTimeOut('17:00'); }}
                >
                  8AM - 5PM (8 hrs)
                </button>
                <button
                  type="button"
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                  onClick={() => { setTimeIn('08:00'); setTimeOut('12:00'); }}
                >
                  8AM - 12PM (4 hrs)
                </button>
                <button
                  type="button"
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                  onClick={() => { setTimeIn('13:00'); setTimeOut('17:00'); }}
                >
                  1PM - 5PM (4 hrs)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="form-group">
                <label className="form-label font-bold text-slate-700">Official Time In</label>
                <input
                  type="time"
                  className="form-input text-xs font-semibold"
                  value={timeIn}
                  onChange={e => setTimeIn(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label font-bold text-slate-700">Official Time Out</label>
                <input
                  type="time"
                  className="form-input text-xs font-semibold"
                  value={timeOut}
                  onChange={e => setTimeOut(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label font-bold text-slate-700">Approval Status</label>
                <select
                  className="form-input form-select text-xs font-semibold"
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                >
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Schedule Override */}
        {activeTab === 'override' && (
          <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="form-group">
              <label className="form-label font-bold text-slate-700">Override Category</label>
              <select
                className="form-input form-select text-xs font-semibold"
                value={overrideType}
                onChange={e => setOverrideType(e.target.value)}
              >
                <option value="suspended">Suspended (Class/Work Suspended — 0 hrs credited)</option>
                <option value="excused">Excused (Excused Absence / Seminar — 8.00 hrs credited)</option>
                <option value="hours">Custom Hours (Credit specific hours for selected dates)</option>
                <option value="others">Others (Custom Banner Label and Custom Hours)</option>
              </select>
            </div>

            {(overrideType === 'hours' || overrideType === 'others') && (
              <div className="form-group">
                <label className="form-label font-bold text-slate-700">Credited Hours per Date (0 to 8)</label>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="0.25"
                  className="form-input font-bold text-xs"
                  value={overrideHours}
                  onChange={e => setOverrideHours(Number(e.target.value))}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label font-bold text-slate-700">
                {overrideType === 'others' ? 'Row Banner Label (e.g. SEMINAR, SPECIAL DUTY)' : 'Remarks / Note'}
              </label>
              <input
                type="text"
                className="form-input text-xs"
                value={overrideRemarks}
                onChange={e => setOverrideRemarks(e.target.value)}
                placeholder={
                  overrideType === 'others'
                    ? "e.g. ITMS TECH SUMMIT, FIELD DUTY"
                    : "e.g. Typhoon Suspension, Authorized leave, System adjustment..."
                }
              />
            </div>
          </div>
        )}

        {/* Tab 3: Clear / Reset */}
        {activeTab === 'clear' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 text-amber-900">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Reset Overrides for Selected Dates
            </div>
            <p className="text-xs text-amber-800">
              This will remove any active Schedule Overrides (Suspended/Excused/Custom Hours) on the {count} selected date(s). Regular biometric scans and normal DTR calculations will apply.
            </p>
          </div>
        )}

        {/* Mandatory Reason */}
        <div className="form-group">
          <label className="form-label font-bold text-slate-800 flex items-center justify-between">
            <span>Modification Reason <span className="text-red-500">*</span></span>
            <span className="text-[11px] text-slate-400 font-normal">Required for audit compliance</span>
          </label>
          <textarea
            className="form-input text-xs"
            rows={2}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Authorized attendance at ITMS orientation seminar; corrected official time"
            required
          />
        </div>

        {/* Superadmin Audit Trail Assurance */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-start gap-2 text-slate-600 text-[11px]">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-800">Superadmin Audit Trail: </span>
            Every modification is permanently saved to the DTR Audit History with your admin identity, timestamp, and explanation. Original camera scan timestamps are always preserved.
          </div>
        </div>
      </form>
    </Modal>
  );
}
