import { useState, useEffect, useMemo, useRef } from 'react';
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
    badgeClass: 'bg-yellow-100 text-yellow-900',
    desc: 'Official holiday',
    icon: Calendar,
    iconColor: 'text-yellow-600',
    activeClass: 'border-yellow-500 bg-yellow-50 text-yellow-950 ring-2 ring-yellow-400 font-bold shadow-xs',
    defaultHours: 0,
  },
  {
    type: 'suspended',
    title: 'Suspended',
    badge: '0.0h',
    badgeClass: 'bg-blue-100 text-blue-800',
    desc: 'Typhoon / weather',
    icon: CloudRain,
    iconColor: 'text-blue-600',
    activeClass: 'border-blue-500 bg-blue-50 text-blue-950 ring-2 ring-blue-400 font-bold shadow-xs',
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
    badgeClass: 'bg-indigo-100 text-indigo-800',
    desc: 'Credit specific hrs',
    icon: Clock,
    iconColor: 'text-indigo-600',
    activeClass: 'border-indigo-500 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-400 font-bold shadow-xs',
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
  initialDates = [],
}) {
  const [interns, setInterns] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [dates, setDates] = useState([]);
  const [newDateInput, setNewDateInput] = useState('');
  const [multiDateMode, setMultiDateMode] = useState(false);
  const [overrideType, setOverrideType] = useState('suspended'); // 'absent' | 'holiday' | 'suspended' | 'excused' | 'hours' | 'others' | 'none'
  const [hours, setHours] = useState(8);
  const [remarks, setRemarks] = useState('');

  const [scope, setScope] = useState('all'); // 'all' | 'division' | 'specific'
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [selectedInternIds, setSelectedInternIds] = useState(new Set());
  const [searchIntern, setSearchIntern] = useState('');
  const [saving, setSaving] = useState(false);

  // Keep a stable ref so we can read initialDates inside the effect without
  // it being part of the dependency array (avoids infinite re-runs caused by
  // a new array reference on every render).
  const initialDatesRef = useRef(initialDates);
  initialDatesRef.current = initialDates;

  // Fetch interns & divisions when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const startDates = Array.isArray(initialDatesRef.current) && initialDatesRef.current.length > 0
      ? [...initialDatesRef.current]
      : [getPhtTodayKey()];

    setDates(startDates);
    setNewDateInput(startDates[0] || getPhtTodayKey());
    setMultiDateMode(startDates.length > 1);
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
  }, [isOpen]); // ← intentionally only isOpen; initialDates read via ref above

  // Compute effective dates ensuring whatever is typed/selected is never lost
  const effectiveDates = useMemo(() => {
    let result = [...dates];
    if (newDateInput) {
      if (!multiDateMode) {
        result = [newDateInput];
      } else if (!result.includes(newDateInput)) {
        result.push(newDateInput);
      }
    }
    return result.filter(Boolean).sort();
  }, [dates, newDateInput, multiDateMode]);

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
    if (e && e.preventDefault) e.preventDefault();
    if (effectiveDates.length === 0) {
      toast.error('Please choose at least 1 valid target date');
      return;
    }
    if (targetInterns.length === 0) {
      toast.error('No interns selected for this override');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        dates: effectiveDates,
        date: effectiveDates[0],
        type: overrideType,
        hours: (overrideType === 'hours' || overrideType === 'others') ? Number(hours) : (overrideType === 'excused' ? 8 : 0),
        remarks: remarks.trim(),
        internIds: targetInterns.map(i => i.id),
      };

      const res = await api.post('/admin/dtr/bulk-override', payload);
      const isReset = overrideType === 'none';
      if (isReset) {
        toast.success(
          effectiveDates.length === 1
            ? `Attendance override cleared for ${targetInterns.length} intern(s) on ${effectiveDates[0]}!`
            : `Attendance overrides cleared for ${targetInterns.length} intern(s) across ${effectiveDates.length} date(s)!`
        );
      } else {
        toast.success(
          effectiveDates.length === 1
            ? `Bulk DTR override (${overrideType.toUpperCase()}) applied to ${targetInterns.length} intern(s) on ${effectiveDates[0]}!`
            : `Bulk DTR override (${overrideType.toUpperCase()}) applied to ${targetInterns.length} intern(s) across ${effectiveDates.length} date(s)!`
        );
      }
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
      case 'none': return 'Clear / Remove Override (Restore Normal Scans)';
      default: return type;
    }
  };

  const getRemarksLabel = () => {
    switch (overrideType) {
      case 'absent': return 'Absent Reason / Remarks';
      case 'holiday': return 'Holiday Name / Occasion';
      case 'suspended': return 'Suspension Reason';
      case 'excused': return 'Activity / Justification';
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

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Apply Bulk DTR Override"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-2 dtr-bulk-footer">
          <span className="text-xs text-slate-500">
            Targeting: <strong>{targetInterns.length}</strong> intern(s) on <strong>{effectiveDates.length}</strong> date(s)
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
              className={`btn btn-primary flex items-center gap-1.5 ${
                overrideType === 'none'
                  ? 'bg-slate-800 hover:bg-slate-900 border-slate-700 text-white'
                  : 'bg-blue-700 hover:bg-blue-800 text-white'
              }`}
              onClick={handleSubmit}
              disabled={saving || targetInterns.length === 0 || effectiveDates.length === 0}
            >
              {saving ? (
                overrideType === 'none' ? 'Resetting Attendance...' : 'Applying Override...'
              ) : overrideType === 'none' ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
                  Reset {targetInterns.length} Intern(s) ({effectiveDates.length > 1 ? `${effectiveDates.length} Dates` : effectiveDates[0] || '1 Date'})
                </>
              ) : (
                `Apply to ${targetInterns.length} Intern(s) (${effectiveDates.length} Date${effectiveDates.length === 1 ? '' : 's'})`
              )}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
        {/* Target Date(s) */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          {!multiDateMode ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="form-label font-bold text-gray-800 text-xs">
                  Target Date to Override
                </label>
                <button
                  type="button"
                  className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                  onClick={() => {
                    setMultiDateMode(true);
                    setNewDateInput('');
                  }}
                >
                  + Add More Dates (Multi-Date)
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="form-input text-xs py-1.5 px-3 font-semibold text-gray-800 w-full sm:w-auto min-w-[200px]"
                  value={effectiveDates[0] || getPhtTodayKey()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setDates([val]);
                      setNewDateInput(val);
                    }
                  }}
                  required
                />
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  Select the calendar date to apply this action
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="form-label font-bold text-gray-800 text-xs">
                  Target Date(s) ({effectiveDates.length})
                </label>
                <button
                  type="button"
                  className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                  onClick={() => {
                    setMultiDateMode(false);
                    if (effectiveDates.length > 0) {
                      setDates([effectiveDates[0]]);
                      setNewDateInput(effectiveDates[0]);
                    }
                  }}
                >
                  Switch to Single Date
                </button>
              </div>

              {/* Chips */}
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white rounded-lg border border-slate-200">
                {effectiveDates.map(d => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg font-mono text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs"
                  >
                    {d}
                    {effectiveDates.length > 1 && (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600 transition-colors font-bold text-sm leading-none ml-1"
                        onClick={() => {
                          setDates(prev => prev.filter(x => x !== d));
                          if (newDateInput === d) setNewDateInput('');
                        }}
                        title="Remove date"
                      >
                        &times;
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {/* Add Date Row */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 flex-wrap">
                <input
                  type="date"
                  className="form-input text-xs py-1 px-2 font-medium w-auto"
                  value={newDateInput}
                  onChange={e => setNewDateInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-xs text-xs font-semibold px-2.5 text-blue-700 bg-blue-50/50 hover:bg-blue-100 border-blue-200"
                  onClick={() => {
                    if (newDateInput && !dates.includes(newDateInput)) {
                      setDates(prev => [...prev, newDateInput].sort());
                      setNewDateInput('');
                    }
                  }}
                  disabled={!newDateInput || dates.includes(newDateInput)}
                >
                  + Add Date
                </button>
              </div>
            </div>
          )}
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
            <p className="text-[11px] text-blue-700 mt-1">
              Interns will receive exactly {hours || 0} credited hours on their DTR for this date.
            </p>
          </div>
        )}

        {/* Reason / Remarks with Quick Presets */}
        {overrideType !== 'none' && (
          <div className="form-group">
            <label className="form-label font-semibold text-gray-700">
              {getRemarksLabel()}
            </label>
            <input
              type="text"
              className="form-input text-xs sm:text-sm"
              placeholder={getRemarksPlaceholder()}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />

            {/* Quick Presets Pills */}
            {PRESETS[overrideType] && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[11px] text-slate-400 font-medium self-center mr-0.5">Quick fill:</span>
                {PRESETS[overrideType].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`text-[11px] px-2 py-0.5 rounded-md border font-medium transition-colors ${
                      remarks === preset
                        ? overrideType === 'absent'
                          ? 'bg-red-600 text-white border-red-600'
                          : overrideType === 'holiday'
                          ? 'bg-yellow-600 text-white border-yellow-600'
                          : overrideType === 'suspended'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-emerald-600 text-white border-emerald-600'
                        : overrideType === 'absent'
                        ? 'bg-red-50 hover:bg-red-100 text-red-800 border-red-200'
                        : overrideType === 'holiday'
                        ? 'bg-yellow-50 hover:bg-yellow-100 text-yellow-900 border-yellow-200'
                        : overrideType === 'suspended'
                        ? 'bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-200'
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

          {/* Scope details: Division Picker */}
          {scope === 'division' && (
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">Select Target Division:</label>
              <select
                className="form-select text-xs w-full"
                value={selectedDivisionId}
                onChange={e => setSelectedDivisionId(e.target.value)}
                required
              >
                <option value="">-- Choose Division --</option>
                {divisions.map(d => (
                  <option key={d.id} value={d.id}>
                    {divisionLabel(d.name)} ({interns.filter(i => String(i.division_id) === String(d.id)).length} interns)
                  </option>
                ))}
              </select>
              {selectedDivisionId && (
                <p className="text-[11px] text-blue-700 font-medium">
                  {targetInterns.length} active intern(s) in this division will receive this override.
                </p>
              )}
            </div>
          )}

          {/* Scope details: Specific Intern Picker */}
          {scope === 'specific' && (
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    className="form-input text-xs pl-8 py-1 w-full"
                    placeholder="Filter interns by name, ID, division..."
                    value={searchIntern}
                    onChange={e => setSearchIntern(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs text-[11px] shrink-0"
                  onClick={toggleSelectAllSpecific}
                >
                  {selectedInternIds.size === filteredInternsForSelection.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="max-h-44 overflow-y-auto divide-y divide-slate-200/80 bg-white border border-slate-200 rounded-lg">
                {filteredInternsForSelection.length === 0 ? (
                  <p className="p-3 text-center text-xs text-slate-400 italic">No interns found</p>
                ) : (
                  filteredInternsForSelection.map((i) => {
                    const checked = selectedInternIds.has(i.id);
                    return (
                      <label
                        key={i.id}
                        className={`p-2 flex items-center justify-between cursor-pointer hover:bg-slate-50 text-xs transition-colors ${
                          checked ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
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
            ? 'bg-yellow-50/90 border-yellow-200 text-yellow-950'
            : overrideType === 'suspended'
            ? 'bg-blue-50/90 border-blue-200 text-blue-950'
            : overrideType === 'excused'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
            : overrideType === 'none'
            ? 'bg-gray-100 border-gray-300 text-gray-900'
            : 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
        }`}>
          {overrideType === 'none' ? (
            <RotateCcw className="w-4 h-4 shrink-0 mt-0.5 text-gray-700" />
          ) : (
            <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${
              overrideType === 'absent'
                ? 'text-red-600'
                : overrideType === 'holiday'
                ? 'text-yellow-600'
                : overrideType === 'suspended'
                ? 'text-blue-600'
                : overrideType === 'excused'
                ? 'text-emerald-600'
                : 'text-indigo-600'
            }`} />
          )}
          <div>
            <p className="font-bold">
              Action Summary: {getTypeName(overrideType)}
            </p>
            <p className="text-[11px] opacity-90 mt-0.5">
              This will update attendance records for <strong>{targetInterns.length} intern(s)</strong> across <strong>{effectiveDates.length === 1 ? effectiveDates[0] : `${effectiveDates.length} date(s)`}</strong>.
              {overrideType === 'absent'
                ? ' All selected interns will be marked as Absent with 0.00h credited hours.'
                : overrideType === 'holiday'
                ? ' An official Holiday banner will be applied with 0.00h credited hours.'
                : overrideType === 'none'
                ? ' Any existing custom overrides (Absent, Holiday, Suspended, etc.) will be cleared, restoring normal raw scans.'
                : ' Normal scan calculations for this date will be replaced by this override.'}
            </p>
          </div>
        </div>
      </form>
    </Modal>
  );
}
