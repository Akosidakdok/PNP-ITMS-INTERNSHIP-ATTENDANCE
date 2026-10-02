import { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Users,
  CheckSquare,
  Square,
  AlertCircle,
  Clock,
  Filter,
  Search,
  Check,
  UserX,
  CloudRain,
  CheckCircle,
  RotateCcw
} from 'lucide-react';
import Modal from '../common/Modal.jsx';
import api from '../../utils/api.js';
import { fetchAllInterns } from '../../utils/interns.js';
import toast from 'react-hot-toast';
import { divisionLabel } from '../../utils/display.js';

const getPhtTodayKey = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
};

const OVERRIDE_OPTIONS = [
  {
    type: 'absent',
    title: 'Absent',
    badge: '0.0h',
    badgeClass: 'bg-red-100 text-red-800',
    desc: 'Mark intern absent',
    icon: UserX,
    iconColor: 'text-red-600',
    activeClass: 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-400 font-bold shadow-xs',
    defaultHours: 0,
  },
  {
    type: 'holiday',
    title: 'Holiday',
    badge: '0.0h',
    badgeClass: 'bg-amber-100 text-amber-800',
    desc: 'Official holiday',
    icon: Calendar,
    iconColor: 'text-amber-600',
    activeClass: 'border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-400 font-bold shadow-xs',
    defaultHours: 0,
  },
  {
    type: 'suspended',
    title: 'Suspended',
    badge: '0.0h',
    badgeClass: 'bg-slate-200 text-slate-800',
    desc: 'Typhoon / weather',
    icon: CloudRain,
    iconColor: 'text-slate-700',
    activeClass: 'border-slate-500 bg-slate-100 text-slate-950 ring-2 ring-slate-400 font-bold shadow-xs',
    defaultHours: 0,
  },
  {
    type: 'excused',
    title: 'Excused',
    badge: '8.0h',
    badgeClass: 'bg-emerald-100 text-emerald-800',
    desc: 'Credit 8.00 hours',
    icon: CheckCircle,
    iconColor: 'text-emerald-600',
    activeClass: 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-400 font-bold shadow-xs',
    defaultHours: 8,
  },
  {
    type: 'hours',
    title: 'Custom Hours',
    badge: 'Custom',
    badgeClass: 'bg-blue-100 text-blue-800',
    desc: 'Credit specific hrs',
    icon: Clock,
    iconColor: 'text-blue-600',
    activeClass: 'border-blue-500 bg-blue-50 text-blue-950 ring-2 ring-blue-400 font-bold shadow-xs',
    defaultHours: 8,
  },
  {
    type: 'none',
    title: 'Normal / Reset',
    badge: 'Reset',
    badgeClass: 'bg-gray-200 text-gray-800',
    desc: 'Restore normal scans',
    icon: RotateCcw,
    iconColor: 'text-gray-700',
    activeClass: 'border-gray-500 bg-gray-100 text-gray-950 ring-2 ring-gray-400 font-bold shadow-xs',
    defaultHours: 0,
  },
];

const PRESETS = {
  absent: ['Unexcused Absence', 'Sick Leave', 'Personal Emergency', 'No Scans Recorded'],
  holiday: ['Special Non-Working Holiday', 'Regular Holiday', 'National Holiday', 'Local Holiday'],
  suspended: ['Typhoon Suspension', 'Inclement Weather', 'Office Maintenance'],
  excused: ['ITMS General Assembly', 'Official School Activity', 'Authorized Duty'],
};

export default function BulkDTROverrideModal({
  isOpen,
  onClose,
  onSuccess,
}) {
  const [interns, setInterns] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [date, setDate] = useState(getPhtTodayKey());
  const [overrideType, setOverrideType] = useState('suspended'); // 'absent' | 'holiday' | 'suspended' | 'excused' | 'hours' | 'others' | 'none'
  const [hours, setHours] = useState(8);
  const [remarks, setRemarks] = useState('');

  const [scope, setScope] = useState('all'); // 'all' | 'division' | 'specific'
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [selectedInternIds, setSelectedInternIds] = useState(new Set());
  const [searchIntern, setSearchIntern] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch interns & divisions when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setDate(getPhtTodayKey());
    setOverrideType('suspended');
    setHours(8);
    setRemarks('');
    setScope('all');
    setSelectedDivisionId('');
    setSelectedInternIds(new Set());
    setSearchIntern('');

    setLoadingData(true);
    Promise.all([
      fetchAllInterns(),
      api.get('/divisions')
    ])
      .then(([internsRes, divRes]) => {
        const activeInterns = (internsRes || []).filter(i => i.status !== 'archived');
        setInterns(activeInterns);
        setDivisions(divRes.data.divisions || []);
      })
      .catch(() => toast.error('Failed to load interns or divisions'))
      .finally(() => setLoadingData(false));
  }, [isOpen]);

  // Compute targeted intern IDs based on scope
  const targetInterns = useMemo(() => {
    if (scope === 'all') {
      return interns;
    }
    if (scope === 'division') {
      if (!selectedDivisionId) return [];
      return interns.filter(i => String(i.division_id) === String(selectedDivisionId));
    }
    if (scope === 'specific') {
      return interns.filter(i => selectedInternIds.has(i.id));
    }
    return [];
  }, [scope, interns, selectedDivisionId, selectedInternIds]);

  // Filtered interns for specific selection list
  const filteredInternsForSelection = useMemo(() => {
    const q = searchIntern.toLowerCase().trim();
    if (!q) return interns;
    return interns.filter(i =>
      i.full_name?.toLowerCase().includes(q) ||
      i.division_name?.toLowerCase().includes(q) ||
      i.student_id?.toLowerCase().includes(q)
    );
  }, [interns, searchIntern]);

  const toggleSelectAllSpecific = () => {
    if (selectedInternIds.size === filteredInternsForSelection.length) {
      setSelectedInternIds(new Set());
    } else {
      setSelectedInternIds(new Set(filteredInternsForSelection.map(i => i.id)));
    }
  };

  const toggleSelectOne = (id) => {
    const next = new Set(selectedInternIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedInternIds(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date) {
      toast.error('Please choose a valid target date');
      return;
    }
    if (targetInterns.length === 0) {
      toast.error('No interns selected for this override');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date,
        type: overrideType,
        hours: (overrideType === 'hours' || overrideType === 'others') ? Number(hours) : (overrideType === 'excused' ? 8 : 0),
        remarks: remarks.trim(),
        internIds: targetInterns.map(i => i.id),
      };

      const res = await api.post('/admin/dtr/bulk-override', payload);
      const count = res.data?.count || targetInterns.length;
      toast.success(`Bulk DTR override applied to ${count} intern(s)!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to apply bulk DTR override';
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const getTypeName = (type) => {
    switch (type) {
      case 'absent': return 'Absent (0.00h Credit)';
      case 'holiday': return 'Holiday (0.00h Credit)';
      case 'suspended': return 'Suspended (0.00h Credit)';
      case 'excused': return 'Excused (8.00h Credit)';
      case 'hours': return `Custom Hours (${hours}h Credit)`;
      case 'others': return `Other / Custom (${hours}h)`;
      case 'none': return 'Clear / Remove Override';
      default: return type;
    }
  };

  const getRemarksLabel = () => {
    switch (overrideType) {
      case 'absent': return 'Absent Reason / Remarks';
      case 'holiday': return 'Holiday Name / Banner Label';
      case 'suspended': return 'Suspension Reason';
      case 'excused': return 'Reason / Event Name';
      case 'others': return 'Row Label / Activity Name';
      default: return 'Reason / Remarks';
    }
  };

  const getRemarksPlaceholder = () => {
    switch (overrideType) {
      case 'absent': return 'e.g. Unexcused absence, Mass leave, Sick leave';
      case 'holiday': return 'e.g. Special Non-Working Holiday, Bonifacio Day';
      case 'suspended': return 'e.g. Typhoon Pepito work suspension, Office maintenance';
      case 'excused': return 'e.g. ITMS General Assembly, Official school activity';
      case 'others': return 'e.g. SEMINAR, HOLIDAY, FOUNDATION DAY';
      default: return 'Add an optional note...';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Apply Bulk DTR Override"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-2 dtr-bulk-footer">
          <span className="text-xs text-slate-500">
            Targeting: <strong>{targetInterns.length}</strong> intern(s)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              id="confirm-bulk-override-btn"
              className="btn btn-primary bg-blue-700 hover:bg-blue-800 flex items-center gap-1.5"
              onClick={handleSubmit}
              disabled={saving || targetInterns.length === 0}
            >
              {saving ? 'Applying Override...' : `Apply to ${targetInterns.length} Intern(s)`}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
        {/* Target Date */}
        <div>
          <label className="form-label font-bold text-gray-700 block mb-1">Target Date</label>
          <div className="relative max-w-xs">
            <input
              type="date"
              className="form-input font-semibold text-sm w-full"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Override Action / Type Cards */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="form-label font-bold text-gray-800">
              Select Attendance Status / Override Action
            </label>
            <span className="text-[11px] text-slate-500 font-medium">
              Click a status below
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {OVERRIDE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = overrideType === opt.type;
              return (
                <button
                  key={opt.type}
                  type="button"
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? opt.activeClass
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                  onClick={() => {
                    setOverrideType(opt.type);
                    if (opt.defaultHours !== undefined) {
                      setHours(opt.defaultHours);
                    }
                  }}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <Icon className={`w-4 h-4 ${isSelected ? opt.iconColor : 'text-slate-500'}`} />
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${opt.badgeClass}`}>
                      {opt.badge}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-xs">{opt.title}</p>
                    <p className="text-[10px] text-slate-500 leading-tight">{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conditional Custom Hours */}
        {(overrideType === 'hours' || overrideType === 'others') && (
          <div className="form-group bg-blue-50 border border-blue-200 rounded-lg p-3">
            <label className="form-label font-bold text-blue-900">Custom Hours to Credit (per intern)</label>
            <input
              type="number"
              min="0"
              max="8"
              step="0.25"
              className="form-input font-bold text-sm"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
            <span className="text-[11px] text-blue-700 mt-1 block">Maximum allowed per day is 8 hours.</span>
          </div>
        )}

        {/* Remarks / Label and Quick Presets */}
        {overrideType !== 'none' && (
          <div className="form-group">
            <label className="form-label font-bold text-gray-700">
              {getRemarksLabel()}
            </label>
            <input
              type="text"
              className="form-input text-sm"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={getRemarksPlaceholder()}
            />

            {/* Quick Preset Chips */}
            {PRESETS[overrideType] && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] text-slate-500 font-semibold mr-1">Quick Presets:</span>
                {PRESETS[overrideType].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`text-[11px] px-2.5 py-0.5 rounded-full transition-colors font-medium border ${
                      overrideType === 'absent'
                        ? 'bg-red-50 hover:bg-red-100 text-red-800 border-red-200'
                        : overrideType === 'holiday'
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                        : overrideType === 'suspended'
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}
                    onClick={() => setRemarks(preset)}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scope Selector */}
        <div className="border-t border-slate-200 pt-3">
          <label className="form-label font-bold text-gray-800 block mb-2">Target Intern Scope</label>
          <div className="grid grid-cols-3 gap-2 dtr-override-scope">
            <button
              type="button"
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                scope === 'all'
                  ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-semibold ring-1 ring-blue-600'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
              onClick={() => setScope('all')}
            >
              <span className="flex items-center gap-1.5 font-bold text-xs">
                <Users className="w-3.5 h-3.5" /> All Interns
              </span>
              <span className="text-[11px] text-slate-500 mt-1">{interns.length} total active</span>
            </button>

            <button
              type="button"
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                scope === 'division'
                  ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-semibold ring-1 ring-blue-600'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
              onClick={() => setScope('division')}
            >
              <span className="flex items-center gap-1.5 font-bold text-xs">
                <Filter className="w-3.5 h-3.5" /> By Division
              </span>
              <span className="text-[11px] text-slate-500 mt-1">{divisions.length} divisions</span>
            </button>

            <button
              type="button"
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                scope === 'specific'
                  ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-semibold ring-1 ring-blue-600'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
              onClick={() => setScope('specific')}
            >
              <span className="flex items-center gap-1.5 font-bold text-xs">
                <CheckSquare className="w-3.5 h-3.5" /> Selected ({selectedInternIds.size})
              </span>
              <span className="text-[11px] text-slate-500 mt-1">Manual list</span>
            </button>
          </div>

          {/* Division Selector Sub-view */}
          {scope === 'division' && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <label className="form-label font-bold text-gray-700">Choose Division</label>
              <select
                className="form-input form-select text-sm font-semibold"
                value={selectedDivisionId}
                onChange={(e) => setSelectedDivisionId(e.target.value)}
              >
                <option value="">-- Select Division --</option>
                {divisions.map((d) => {
                  const count = interns.filter((i) => String(i.division_id) === String(d.id)).length;
                  return (
                    <option key={d.id} value={d.id}>
                      {d.name} ({count} intern{count !== 1 ? 's' : ''})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Specific Interns Multi-select Sub-view */}
          {scope === 'specific' && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    className="form-input text-xs pl-8 py-1.5"
                    placeholder="Filter interns by name, student ID, or division..."
                    value={searchIntern}
                    onChange={(e) => setSearchIntern(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm text-xs py-1 whitespace-nowrap"
                  onClick={toggleSelectAllSpecific}
                >
                  {selectedInternIds.size === filteredInternsForSelection.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-200 bg-white rounded divide-y divide-slate-100">
                {filteredInternsForSelection.length === 0 ? (
                  <p className="p-3 text-center text-xs text-gray-400">No matching interns found</p>
                ) : (
                  filteredInternsForSelection.map((i) => {
                    const isSelected = selectedInternIds.has(i.id);
                    return (
                      <label
                        key={i.id}
                        className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-blue-50/50 transition-colors ${
                          isSelected ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(i.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <span className="font-semibold text-gray-800">{i.full_name}</span>
                            <span className="text-gray-400 ml-1.5 text-[11px]">({divisionLabel(i.division_name)})</span>
                          </div>
                        </div>
                        <span className="text-[11px] text-gray-400 font-mono">{i.student_id || ''}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Confirmation Summary Banner */}
        <div className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
          overrideType === 'absent'
            ? 'bg-red-50/80 border-red-200 text-red-950'
            : overrideType === 'holiday'
            ? 'bg-amber-50/90 border-amber-200 text-amber-950'
            : overrideType === 'suspended'
            ? 'bg-slate-100 border-slate-300 text-slate-900'
            : overrideType === 'excused'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
            : overrideType === 'none'
            ? 'bg-gray-100 border-gray-300 text-gray-900'
            : 'bg-blue-50/80 border-blue-200 text-blue-950'
        }`}>
          <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${
            overrideType === 'absent'
              ? 'text-red-600'
              : overrideType === 'holiday'
              ? 'text-amber-600'
              : overrideType === 'suspended'
              ? 'text-slate-600'
              : overrideType === 'excused'
              ? 'text-emerald-600'
              : 'text-blue-600'
          }`} />
          <div>
            <p className="font-bold">
              Action Summary: {getTypeName(overrideType)}
            </p>
            <p className="text-[11px] opacity-90 mt-0.5">
              This will update attendance records for <strong>{targetInterns.length} intern(s)</strong> on <strong>{date}</strong>.
              {overrideType === 'absent'
                ? ' All selected interns will be marked as Absent with 0.00h credited hours.'
                : overrideType === 'holiday'
                ? ' An official Holiday banner will be applied with 0.00h credited hours.'
                : overrideType === 'none'
                ? ' Any existing custom override will be cleared, restoring normal raw scans.'
                : ' Normal scan calculations for this date will be replaced by this override.'}
            </p>
          </div>
        </div>
      </form>
    </Modal>
  );
}
