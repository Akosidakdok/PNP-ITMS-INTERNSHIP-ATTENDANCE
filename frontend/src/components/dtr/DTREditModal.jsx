import { useState, useEffect } from 'react';
import { AlertCircle, Clock, ShieldCheck, Check } from 'lucide-react';
import Modal from '../common/Modal.jsx';
import api from '../../utils/api.js';
import toast from 'react-hot-toast';

export default function DTREditModal({
  isOpen,
  onClose,
  intern,
  date,
  record,
  onSaveSuccess,
}) {
  const [dateInput, setDateInput] = useState('');
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [status, setStatus] = useState('approved');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const origDate = date || record?.date || record?.attendance_date || '';
      const origIn = record?.time_in || record?.am_time_in || '';
      const origOut = record?.time_out || record?.pm_time_out || '';
      setDateInput(origDate);
      setTimeIn(origIn);
      setTimeOut(origOut);
      setStatus(record?.approval_status || 'approved');
      setReason('');
      setConfirming(false);
    }
  }, [isOpen, record, date]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('A modification reason is required before saving.');
      return;
    }
    setConfirming(true);
  };

  const handleConfirmSave = async () => {
    if (!intern?.id || !date) return;
    setSaving(true);
    try {
      await api.put(`/admin/dtr/${intern.id}/edit`, {
        date,
        new_date: dateInput !== date ? dateInput : undefined,
        time_in: timeIn,
        time_out: timeOut,
        status,
        reason: reason.trim(),
      });
      toast.success('DTR record successfully updated with audit log.');
      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update DTR record.');
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  const origIn = record?.time_in || record?.am_time_in || 'None';
  const origOut = record?.time_out || record?.pm_time_out || 'None';
  const actualIn = record?.actual_time_in || 'N/A';
  const actualOut = record?.actual_time_out || 'N/A';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Superadmin DTR Record Correction"
      size="md"
      footer={
        confirming ? (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Confirm modifying this record?
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={saving}
                onClick={() => setConfirming(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm bg-blue-700 hover:bg-blue-800"
                disabled={saving}
                onClick={handleConfirmSave}
              >
                {saving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2 w-full">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary bg-blue-700 hover:bg-blue-800"
              onClick={handleSubmit}
            >
              Review & Save
            </button>
          </div>
        )
      }
    >
      <div className="space-y-4 text-sm">
        {/* Intern & Date Info banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-bold text-gray-900">{intern?.full_name || intern?.username || 'Intern'}</p>
              <p className="text-xs text-gray-500">Student ID: {intern?.student_id || 'N/A'}</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                <Clock className="w-3.5 h-3.5" />
                {date}
              </span>
            </div>
          </div>
        </div>

        {/* Audit info preview */}
        <div className="grid grid-cols-2 gap-3 bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-xs">
          <div>
            <p className="text-gray-500 font-medium">Original Time In</p>
            <p className="font-semibold text-gray-800">{origIn}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Actual Scan: {actualIn}</p>
          </div>
          <div>
            <p className="text-gray-500 font-medium">Original Time Out</p>
            <p className="font-semibold text-gray-800">{origOut}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Actual Scan: {actualOut}</p>
          </div>
        </div>

        {/* Editable Fields */}
        <div className="form-group">
          <label className="form-label font-semibold text-gray-700">Official Attendance Date</label>
          <input
            type="date"
            className="form-input text-sm font-medium"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            required
          />
          <span className="text-[11px] text-gray-400">Controls the date displayed on the official DTR preview</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="form-group">
            <label className="form-label font-semibold text-gray-700">New Time In (HH:MM)</label>
            <input
              type="time"
              className="form-input text-sm"
              value={timeIn}
              onChange={(e) => setTimeIn(e.target.value)}
            />
            <span className="text-[11px] text-gray-400">e.g. 08:00 or 08:15</span>
          </div>
          <div className="form-group">
            <label className="form-label font-semibold text-gray-700">New Time Out (HH:MM)</label>
            <input
              type="time"
              className="form-input text-sm"
              value={timeOut}
              onChange={(e) => setTimeOut(e.target.value)}
            />
            <span className="text-[11px] text-gray-400">e.g. 17:00</span>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label font-semibold text-gray-700">Attendance Status</label>
          <select
            className="form-input form-select text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Mandatory Reason */}
        <div className="form-group">
          <label className="form-label font-semibold text-gray-900 flex items-center justify-between">
            <span>Modification Reason <span className="text-red-500">*</span></span>
            <span className="text-xs text-gray-400 font-normal">Audit required</span>
          </label>
          <textarea
            className="form-input text-sm w-full"
            rows="3"
            placeholder="e.g. Official attendance correction approved by supervisor"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>

        {confirming && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Audit Trail Notice</p>
              <p>This action will be permanently recorded in the DTR Edit History with your Superadmin account ID, timestamp, original values, and reason.</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
