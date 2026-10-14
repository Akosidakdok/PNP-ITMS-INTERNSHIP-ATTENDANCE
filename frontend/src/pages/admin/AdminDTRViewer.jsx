import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Clock, Filter, AlertCircle, Edit, Calendar, CalendarRange, History, Shield, ShieldCheck, CheckSquare, Square, MousePointerClick, UserX, CheckCircle, RotateCcw, CloudRain, Check, GraduationCap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../utils/api.js';
import DTRPrint from '../../components/dtr/DTRPrint.jsx';
import Modal from '../../components/common/Modal.jsx';
import DTREditModal from '../../components/dtr/DTREditModal.jsx';
import DTRHistoryModal from '../../components/dtr/DTRHistoryModal.jsx';
import DTRBatchAlterModal from '../../components/dtr/DTRBatchAlterModal.jsx';
import BulkDTROverrideModal from '../../components/dtr/BulkDTROverrideModal.jsx';
import { fetchAllInterns } from '../../utils/interns.js';
import { divisionLabel } from '../../utils/display.js';
import toast from 'react-hot-toast';

const getPhtTodayKey = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

function generateDateRange(fromStr, toStr, excludeWeekends = false) {
  if (!fromStr || !toStr) return [];
  const start = new Date(fromStr + 'T00:00:00');
  const end = new Date(toStr + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

  const minDate = start <= end ? start : end;
  const maxDate = start <= end ? end : start;

  const res = [];
  const curr = new Date(minDate);
  while (curr <= maxDate) {
    const dayOfWeek = curr.getDay(); // 0 is Sunday, 6 is Saturday
    if (!excludeWeekends || (dayOfWeek >= 1 && dayOfWeek <= 5)) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      res.push(`${y}-${m}-${d}`);
    }
    curr.setDate(curr.getDate() + 1);
  }
  return res;
}

export default function AdminDTRViewer() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const canManageOverrides = isSuperadmin || user?.role === 'admin' || user?.role === 'supervisor';

  const [interns, setInterns] = useState([]);
  const [selectedInternId, setSelectedInternId] = useState('');
  const [internSearch, setInternSearch] = useState('');
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const [dtrRecords, setDtrRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedInternData, setSelectedInternData] = useState(null);

  // Superadmin Excel-like multi-date selection state
  const [selectedDates, setSelectedDates] = useState([]);
  const lastClickedDateRef = useRef(null);
  const [batchAlterModalOpen, setBatchAlterModalOpen] = useState(false);

  // Table selection toolbar range selector state
  const [tableRangeOpen, setTableRangeOpen] = useState(false);
  const [tableRangeFrom, setTableRangeFrom] = useState('');
  const [tableRangeTo, setTableRangeTo] = useState('');
  const [tableRangeExcludeWeekends, setTableRangeExcludeWeekends] = useState(true);

  // Superadmin DTR manual edit modal state
  const [dtrEditModalOpen, setDtrEditModalOpen] = useState(false);
  const [selectedRecordForEdit, setSelectedRecordForEdit] = useState(null);
  const [selectedDateForEdit, setSelectedDateForEdit] = useState(null);

  // Superadmin modification audit history modal state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Single / multi-date override dialog state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDateForOverride, setSelectedDateForOverride] = useState(null);
  const [datesForOverrideModal, setDatesForOverrideModal] = useState([]);
  const [newDateInput, setNewDateInput] = useState('');
  const [overrideDateMode, setOverrideDateMode] = useState('single'); // 'single' | 'range' | 'multi'
  const [rangeFrom, setRangeFrom] = useState(getPhtTodayKey());
  const [rangeTo, setRangeTo] = useState(getPhtTodayKey());
  const [excludeWeekends, setExcludeWeekends] = useState(true);
  const [selectedRecordForOverride, setSelectedRecordForOverride] = useState(null);
  const [overrideForm, setOverrideForm] = useState({
    type: 'absent', // 'absent' | 'holiday' | 'suspended' | 'excused' | 'hours' | 'others' | 'none'
    hours: 0,
    remarks: '',
  });
  const [savingOverride, setSavingOverride] = useState(false);

  // Bulk override dialog state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // Load interns list
  useEffect(() => {
    fetchAllInterns()
      .then(data => {
        setInterns(data);
        const urlParams = new URLSearchParams(window.location.search);
        const internParam = urlParams.get('intern');
        if (internParam && data.some(i => String(i.id) === String(internParam))) {
          setSelectedInternId(String(internParam));
        }
      })
      .catch(() => toast.error('Failed to load interns list'));
  }, []);

  const loadDTR = useCallback(async () => {
    if (!selectedInternId) return;
    setLoading(true);
    try {
      const [dtrRes, profileRes] = await Promise.all([
        api.get(`/admin/dtr/${selectedInternId}`, { params: filters }),
        api.get(`/interns/${selectedInternId}`)
      ]);
      setDtrRecords(dtrRes.data.records || []);
      setSelectedInternData(profileRes.data.intern);
    } catch {
      toast.error('Failed to load DTR logs');
    } finally {
      setLoading(false);
    }
  }, [selectedInternId, filters]);

  useEffect(() => {
    if (selectedInternId) {
      loadDTR();
    } else {
      setDtrRecords([]);
      setSelectedInternData(null);
    }
  }, [selectedInternId, loadDTR]);

  const daysInMonth = filters.month && filters.year ? new Date(filters.year, filters.month, 0).getDate() : 31;

  // Clear date selection when changing intern or month/year and set initial range
  useEffect(() => {
    setSelectedDates([]);
    lastClickedDateRef.current = null;
    const startStr = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
    const endStr = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    setTableRangeFrom(startStr);
    setTableRangeTo(endStr);
  }, [selectedInternId, filters.month, filters.year, daysInMonth]);

  const allMonthDates = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    });
  }, [filters.year, filters.month, daysInMonth]);

  const allWeekdayDates = useMemo(() => {
    return allMonthDates.filter(d => {
      const parts = d.split('-').map(Number);
      const dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
      return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
    });
  }, [allMonthDates]);

  // Excel-like selection handler with Shift-range and Ctrl-toggle support
  const handleDateToggle = (dateStr, isShift, isCtrl) => {
    if (isShift && lastClickedDateRef.current && lastClickedDateRef.current !== dateStr) {
      const lastIdx = allMonthDates.indexOf(lastClickedDateRef.current);
      const currIdx = allMonthDates.indexOf(dateStr);
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const range = allMonthDates.slice(start, end + 1);
        setSelectedDates(prev => {
          const set = new Set(prev);
          range.forEach(d => set.add(d));
          return Array.from(set).sort();
        });
      }
    } else if (isCtrl) {
      setSelectedDates(prev => {
        if (prev.includes(dateStr)) {
          return prev.filter(d => d !== dateStr);
        } else {
          return [...prev, dateStr].sort();
        }
      });
    } else {
      setSelectedDates(prev => {
        if (prev.includes(dateStr)) {
          return prev.filter(d => d !== dateStr);
        } else {
          return [...prev, dateStr].sort();
        }
      });
    }
    lastClickedDateRef.current = dateStr;
  };

  const handleSelectAllToggle = () => {
    if (selectedDates.length === allMonthDates.length) {
      setSelectedDates([]);
    } else {
      setSelectedDates([...allMonthDates]);
    }
  };

  // Compute effective dates for single-intern override modal
  const effectiveOverrideDates = useMemo(() => {
    if (overrideDateMode === 'range') {
      return generateDateRange(rangeFrom, rangeTo, excludeWeekends);
    }
    if (overrideDateMode === 'single') {
      return newDateInput ? [newDateInput] : (datesForOverrideModal[0] ? [datesForOverrideModal[0]] : [getPhtTodayKey()]);
    }
    // 'multi'
    let result = [...datesForOverrideModal];
    if (newDateInput && !result.includes(newDateInput)) {
      result.push(newDateInput);
    }
    return result.filter(Boolean).sort();
  }, [overrideDateMode, rangeFrom, rangeTo, excludeWeekends, datesForOverrideModal, newDateInput]);

  const handleOpenMultiOverrideModal = () => {
    if (selectedDates.length === 0) return;
    const sorted = [...selectedDates].sort();
    setDatesForOverrideModal(sorted);
    setNewDateInput(sorted[0] || '');
    setRangeFrom(sorted[0] || getPhtTodayKey());
    setRangeTo(sorted[sorted.length - 1] || getPhtTodayKey());
    setOverrideDateMode(sorted.length > 1 ? 'multi' : 'single');
    setExcludeWeekends(true);
    setSelectedDateForOverride(sorted[0]);
    setSelectedDay(null);
    setSelectedRecordForOverride(null);
    setOverrideForm({
      type: 'absent',
      hours: 0,
      remarks: '',
    });
    setOverrideModalOpen(true);
  };

  const handleDateClick = (day, record, dateStr) => {
    if (!canManageOverrides) return;
    const computedDateStr = dateStr || `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // If dates are already selected in multi-select mode, clicking a date toggles it
    if (selectedDates.length > 0) {
      handleDateToggle(computedDateStr, false, true);
      return;
    }

    setSelectedDay(day);
    setSelectedDateForOverride(computedDateStr);
    setDatesForOverrideModal([computedDateStr]);
    setNewDateInput(computedDateStr);
    setRangeFrom(computedDateStr);
    setRangeTo(computedDateStr);
    setOverrideDateMode('single');
    setExcludeWeekends(true);
    setSelectedRecordForOverride(record || null);

    if (record?.is_override) {
      setOverrideForm({
        type: record.override_type || 'absent',
        hours: record.override_hours !== undefined ? record.override_hours : (record.total_hours || 0),
        remarks: record.override_remarks || record.remarks || '',
      });
    } else {
      setOverrideForm({
        type: 'absent',
        hours: 0,
        remarks: '',
      });
    }
    setOverrideModalOpen(true);
  };

  const handleRowClick = (day, record) => {
    const dateStr = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (canManageOverrides) {
      handleDateToggle(dateStr, false, false);
    }
  };

  const handleSaveOverride = async () => {
    const datesToSave = effectiveOverrideDates;

    if (!selectedInternId || datesToSave.length === 0) {
      toast.error('Please select at least 1 date to override');
      return;
    }

    setSavingOverride(true);
    try {
      const type = overrideForm.type;
      const hoursToSave = type === 'excused'
        ? 8
        : (type === 'absent' || type === 'suspended' || type === 'none')
          ? 0
          : (type === 'holiday' || type === 'school')
            ? (Number(overrideForm.hours) > 0 ? Number(overrideForm.hours) : 0)
            : Number(overrideForm.hours || 0);

      const cleanRemarks = overrideForm.remarks.trim();

      await api.post(`/admin/dtr/${selectedInternId}/override`, {
        dates: datesToSave,
        type: type,
        hours: hoursToSave,
        remarks: cleanRemarks
      });

      const typeLabels = {
        absent: 'ABSENT',
        holiday: 'HOLIDAY',
        suspended: 'SUSPENDED',
        school: 'SCHOOL F2F / CLASS',
        excused: 'EXCUSED',
        hours: 'CUSTOM HOURS',
        others: 'CUSTOM OVERRIDE',
        none: 'NORMAL SCANS',
      };
      const count = datesToSave.length;
      toast.success(
        type === 'none'
          ? (count === 1
              ? `Attendance override cleared and restored to normal scans for ${datesToSave[0]}`
              : `Attendance overrides cleared and restored to normal scans for ${count} dates!`)
          : (count === 1
              ? `DTR attendance set to ${typeLabels[type] || type.toUpperCase()} for ${datesToSave[0]}`
              : `DTR attendance set to ${typeLabels[type] || type.toUpperCase()} for ${count} dates!`)
      );
      setOverrideModalOpen(false);
      setSelectedDates([]);
      loadDTR(); // Refetch records
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to save override';
      toast.error(errMsg);
    } finally {
      setSavingOverride(false);
    }
  };

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const filteredInterns = interns.filter(i => {
    const search = internSearch.toLowerCase();
    return (i.full_name?.toLowerCase().includes(search) || false) || (i.division_name?.toLowerCase().includes(search) || false);
  });

  return (
    <div className="space-y-6 animate-fade-in dtr-page dtr-admin-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 dtr-page-header">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Intern DTR Management</h1>
          <p className="text-gray-500 text-sm">
            {isSuperadmin
              ? 'Superadmin DTR management, Excel-style date selection & alteration with audit logging'
              : 'View Daily Time Records for personnel under your supervision'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto dtr-page-actions">
          {isSuperadmin && selectedDates.length > 0 && (
            <button
              type="button"
              className="btn btn-primary flex items-center gap-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              onClick={() => setBatchAlterModalOpen(true)}
            >
              <Edit className="w-3.5 h-3.5" />
              Alter {selectedDates.length} Selected Date{selectedDates.length > 1 ? 's' : ''}
            </button>
          )}
          {isSuperadmin && (
            <button
              className="btn btn-secondary flex items-center gap-1.5 text-xs"
              onClick={() => setHistoryModalOpen(true)}
            >
              <History className="w-4 h-4 text-blue-600" />
              Modification History
            </button>
          )}
          {canManageOverrides && (
            <button
              id="bulk-dtr-override-btn"
              className="btn btn-secondary flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
              onClick={() => setBulkModalOpen(true)}
            >
              <Calendar className="w-4 h-4 text-blue-600" /> Bulk DTR Override
            </button>
          )}
        </div>
      </div>

      {/* Trainee & Period Selectors */}
      <div className="card p-4 flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-end dtr-filter-card">
        <div className="form-group w-full sm:flex-1 sm:min-w-[300px]">
          <label className="form-label font-bold text-xs text-gray-700">Trainee / Intern</label>
          <div className="flex flex-col gap-2">
            <input 
              type="text" 
              className="form-input text-sm"
              placeholder="Type to filter by name or division..."
              value={internSearch}
              onChange={e => setInternSearch(e.target.value)}
            />
            <select
              className="form-input form-select text-sm font-medium"
              value={selectedInternId}
              onChange={e => setSelectedInternId(e.target.value)}
            >
              <option value="">Select intern...</option>
              {filteredInterns.map(i => (
                <option key={i.id} value={i.id}>
                  {i.full_name} ({divisionLabel(i.division_name)})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label font-bold text-xs text-gray-700">Month</label>
          <select
            className="form-input form-select text-sm"
            value={filters.month}
            onChange={e => setFilters(f => ({ ...f, month: Number(e.target.value) }))}
          >
            {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label font-bold text-xs text-gray-700">Year</label>
          <select
            className="form-input form-select text-sm"
            value={filters.year}
            onChange={e => setFilters(f => ({ ...f, year: Number(e.target.value) }))}
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Main View Area */}
      {!selectedInternId ? (
        <div className="card p-12 text-center border border-gray-150">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3 opacity-60" />
          <h3 className="font-semibold text-gray-700 mb-1">No trainee selected</h3>
          <p className="text-gray-400 text-sm max-w-sm mx-auto">
            Please choose an intern from the dropdown list to view and configure their attendance sheet.
          </p>
        </div>
      ) : loading ? (
        <div className="card p-12 text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">Fetching DTR logs...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 dtr-content-grid">
          
          {/* Instructions Box */}
          <div className="xl:col-span-1 space-y-4">
            {isSuperadmin ? (
              <div className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 space-y-3">
                <h3 className="font-bold text-sm text-blue-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-700" /> Superadmin DTR Control
                </h3>
                <ul className="text-xs text-blue-800 space-y-2 list-disc list-inside">
                  <li>**Click Date**: Click any date in the table to set it as **Absent**, **Holiday**, or override schedule.</li>
                  <li>**Excel Date Selection**: Click checkboxes or rows to select.</li>
                  <li>Hold **Shift** for range, or **Ctrl** for multi-select.</li>
                  <li>Click **Alter Selected Dates** to batch adjust Time In/Out or apply overrides.</li>
                  <li>Every manual correction requires a **reason** and is recorded in the audit trail.</li>
                </ul>
              </div>
            ) : (
              <div className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 space-y-2">
                <h3 className="font-bold text-sm text-blue-900 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-700" /> Attendance Management
                </h3>
                <p className="text-xs text-blue-800">
                  **Click any Date** on the record table to configure that day as **Absent**, **Holiday**, or configure schedule overrides for this intern.
                </p>
              </div>
            )}

            {selectedInternData && (
              <div className="card p-4 border border-gray-150 space-y-2.5">
                <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider">Intern Profile Info</h4>
                <div className="text-xs text-gray-600 space-y-1">
                  <p><span className="font-bold text-gray-800">School:</span> {selectedInternData.school || '—'}</p>
                  <p><span className="font-bold text-gray-800">Course:</span> {selectedInternData.course || '—'}</p>
                  <p><span className="font-bold text-gray-800">Division:</span> {divisionLabel(selectedInternData.division_name)}</p>
                  <p><span className="font-bold text-gray-800">Required:</span> {selectedInternData.required_hours || 0} Hrs</p>
                </div>
              </div>
            )}
          </div>

          {/* DTR Sheet Rendering */}
          <div className="xl:col-span-3 card p-6 bg-white overflow-hidden shadow-sm flex flex-col items-center dtr-sheet-card">
            {canManageOverrides && (
              <div className="w-full max-w-[800px] mb-3 p-2.5 px-3 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border border-blue-200 rounded-xl flex flex-col gap-2 text-xs shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-950 flex items-center gap-1.5">
                      <MousePointerClick className="w-4 h-4 text-blue-600" />
                      Select Dates to Override
                    </span>
                    <span className="text-[11px] text-blue-700 hidden sm:inline">
                      Click rows/dates. Hold <kbd className="px-1 py-0.5 bg-white border border-blue-200 rounded font-mono text-[10px]">Shift</kbd> for range, <kbd className="px-1 py-0.5 bg-white border border-blue-200 rounded font-mono text-[10px]">Ctrl</kbd> for multi-select.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs text-[11px] font-semibold text-blue-700 bg-white hover:bg-blue-50"
                      onClick={() => setSelectedDates([...allWeekdayDates])}
                    >
                      Select Weekdays
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100"
                      onClick={handleSelectAllToggle}
                    >
                      {selectedDates.length === allMonthDates.length ? 'Deselect All' : 'Select All Month'}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-secondary btn-xs text-[11px] font-semibold flex items-center gap-1 ${
                        tableRangeOpen ? 'bg-blue-100 text-blue-800 border-blue-300' : 'text-blue-700 bg-white hover:bg-blue-50'
                      }`}
                      onClick={() => setTableRangeOpen(prev => !prev)}
                    >
                      <CalendarRange className="w-3.5 h-3.5" />
                      {tableRangeOpen ? 'Hide Range' : 'Select Range...'}
                    </button>
                    {selectedDates.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-xs text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 bg-white border border-red-200"
                        onClick={() => setSelectedDates([])}
                      >
                        Clear ({selectedDates.length})
                      </button>
                    )}
                    {selectedDates.length > 0 && (
                      <button
                        type="button"
                        id="override-selected-dates-toolbar-btn"
                        className="btn btn-primary btn-xs text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white shadow-xs flex items-center gap-1.5"
                        onClick={handleOpenMultiOverrideModal}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Override {selectedDates.length} Date{selectedDates.length > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable Date Range Selector for DTR Table */}
                {tableRangeOpen && (
                  <div className="pt-2 border-t border-blue-200/70 flex flex-wrap items-center gap-2.5 animate-fade-in bg-white/70 p-2 rounded-lg">
                    <span className="font-bold text-slate-700 text-xs flex items-center gap-1">
                      <CalendarRange className="w-3.5 h-3.5 text-blue-600" />
                      Select Range:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-semibold text-[11px]">From:</span>
                      <input
                        type="date"
                        className="form-input text-xs py-1 px-2 font-semibold text-gray-800 w-auto"
                        value={tableRangeFrom}
                        onChange={(e) => setTableRangeFrom(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-semibold text-[11px]">To:</span>
                      <input
                        type="date"
                        className="form-input text-xs py-1 px-2 font-semibold text-gray-800 w-auto"
                        value={tableRangeTo}
                        onChange={(e) => setTableRangeTo(e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-1 text-[11px] text-slate-700 font-medium cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={tableRangeExcludeWeekends}
                        onChange={(e) => setTableRangeExcludeWeekends(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500 text-xs"
                      />
                      Exclude weekends
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary btn-xs text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white ml-auto"
                      onClick={() => {
                        const range = generateDateRange(tableRangeFrom, tableRangeTo, tableRangeExcludeWeekends);
                        if (range.length === 0) {
                          toast.error('No dates found in the specified range');
                          return;
                        }
                        setSelectedDates(range);
                        toast.success(`Selected ${range.length} date(s)`);
                      }}
                    >
                      Apply Selection
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="w-full max-w-[800px] border border-gray-300 rounded-xl p-4 bg-gray-50/50 overflow-x-auto">
              <DTRPrint
                intern={selectedInternData}
                internId={selectedInternId}
                records={dtrRecords}
                month={filters.month}
                year={filters.year}
                onRowClick={handleRowClick}
                onDateClick={handleDateClick}
                isSelectable={canManageOverrides}
                selectedDates={selectedDates}
                onDateToggle={handleDateToggle}
                onSelectAllDates={handleSelectAllToggle}
                allDatesSelected={selectedDates.length > 0 && selectedDates.length === allMonthDates.length}
              />
            </div>
          </div>

        </div>
      )}

      {/* Override Single / Multi-Day Modal */}
      {overrideModalOpen && (datesForOverrideModal.length > 0 || overrideDateMode === 'range') && (
        <Modal
          isOpen={overrideModalOpen}
          onClose={() => setOverrideModalOpen(false)}
          title={
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Set Attendance Status
              </span>
              <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 rounded-full">
                {effectiveOverrideDates.length === 1 ? effectiveOverrideDates[0] : `${effectiveOverrideDates.length} Dates`}
              </span>
            </div>
          }
          size="md"
          footer={
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => setOverrideModalOpen(false)}
                disabled={savingOverride}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn text-xs font-bold flex items-center gap-1.5 shadow-sm ${
                  overrideForm.type === 'absent'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : overrideForm.type === 'holiday'
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    : overrideForm.type === 'suspended'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : overrideForm.type === 'school'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : overrideForm.type === 'excused'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : overrideForm.type === 'none'
                    ? 'bg-slate-700 hover:bg-slate-800 text-white'
                    : 'btn-primary'
                }`}
                onClick={handleSaveOverride}
                disabled={savingOverride || effectiveOverrideDates.length === 0}
              >
                {savingOverride ? (
                  'Saving...'
                ) : overrideForm.type === 'absent' ? (
                  <>
                    <UserX className="w-3.5 h-3.5" />
                    Set {effectiveOverrideDates.length > 1 ? `${effectiveOverrideDates.length} Dates` : 'Date'} as Absent
                  </>
                ) : overrideForm.type === 'holiday' ? (
                  <>
                    <Calendar className="w-3.5 h-3.5" />
                    Set {effectiveOverrideDates.length > 1 ? `${effectiveOverrideDates.length} Dates` : 'Date'} as Holiday
                  </>
                ) : overrideForm.type === 'suspended' ? (
                  <>
                    <CloudRain className="w-3.5 h-3.5" />
                    Set {effectiveOverrideDates.length > 1 ? `${effectiveOverrideDates.length} Dates` : 'Date'} as Suspended
                  </>
                ) : overrideForm.type === 'school' ? (
                  <>
                    <GraduationCap className="w-3.5 h-3.5" />
                    Set {effectiveOverrideDates.length > 1 ? `${effectiveOverrideDates.length} Dates` : 'Date'} as School Class / F2F
                  </>
                ) : overrideForm.type === 'excused' ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    Set {effectiveOverrideDates.length > 1 ? `${effectiveOverrideDates.length} Dates` : 'Date'} as Excused
                  </>
                ) : overrideForm.type === 'none' ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset {effectiveOverrideDates.length > 1 ? `${effectiveOverrideDates.length} Dates` : 'Date'}
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Apply Override ({effectiveOverrideDates.length})
                  </>
                )}
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            {/* Intern Info Banner */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900 text-sm">{selectedInternData?.full_name || 'Intern'}</p>
                <p className="text-[11px] text-gray-500">
                  {divisionLabel(selectedInternData?.division_name)} &bull; Student ID: {selectedInternData?.student_id || 'N/A'}
                </p>
              </div>
              <div className="text-right">
                <span className="font-bold text-blue-700 block text-xs">
                  {effectiveOverrideDates.length} Date{effectiveOverrideDates.length > 1 ? 's' : ''} Selected
                </span>
              </div>
            </div>

            {/* Target Dates to Override with Mode Selector Tabs */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-800">
                    Target Date(s) to Override ({effectiveOverrideDates.length})
                  </span>
                  {effectiveOverrideDates.length > 0 && (
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full">
                      {effectiveOverrideDates.length} date{effectiveOverrideDates.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-lg self-start sm:self-auto">
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                      overrideDateMode === 'single'
                        ? 'bg-white text-blue-700 font-bold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                    onClick={() => setOverrideDateMode('single')}
                  >
                    Single Date
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
                      overrideDateMode === 'range'
                        ? 'bg-white text-blue-700 font-bold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                    onClick={() => setOverrideDateMode('range')}
                  >
                    <CalendarRange className="w-3.5 h-3.5" />
                    Date Range (From &rarr; To)
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                      overrideDateMode === 'multi'
                        ? 'bg-white text-blue-700 font-bold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                    onClick={() => setOverrideDateMode('multi')}
                  >
                    Custom List
                  </button>
                </div>
              </div>

              {/* Mode 1: Single Date */}
              {overrideDateMode === 'single' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    className="form-input text-xs py-1.5 px-3 font-semibold text-gray-800 w-full sm:w-auto min-w-[200px]"
                    value={newDateInput || datesForOverrideModal[0] || getPhtTodayKey()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setDatesForOverrideModal([val]);
                        setNewDateInput(val);
                        setRangeFrom(val);
                        setRangeTo(val);
                      }
                    }}
                    required
                  />
                  <span className="text-xs text-slate-500 font-medium">
                    Choose a single calendar date to override
                  </span>
                </div>
              )}

              {/* Mode 2: Date Range (From -> To) */}
              {overrideDateMode === 'range' && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-700">From:</span>
                      <input
                        type="date"
                        className="form-input text-xs py-1.5 px-2.5 font-semibold text-gray-800 w-auto"
                        value={rangeFrom}
                        onChange={(e) => setRangeFrom(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-700">To:</span>
                      <input
                        type="date"
                        className="form-input text-xs py-1.5 px-2.5 font-semibold text-gray-800 w-auto"
                        value={rangeTo}
                        onChange={(e) => setRangeTo(e.target.value)}
                        required
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer select-none bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                      <input
                        type="checkbox"
                        checked={excludeWeekends}
                        onChange={(e) => setExcludeWeekends(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      Exclude weekends (Sat &amp; Sun)
                    </label>
                  </div>

                  {/* Range Preview Chips */}
                  {effectiveOverrideDates.length > 0 ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>
                          Generated <strong>{effectiveOverrideDates.length}</strong> date(s) between {rangeFrom} and {rangeTo}:
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white rounded-lg border border-slate-200">
                        {effectiveOverrideDates.map(d => (
                          <span
                            key={d}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-blue-50 text-blue-900 border border-blue-200"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs">
                      Please choose a valid From and To date.
                    </div>
                  )}
                </div>
              )}

              {/* Mode 3: Custom List */}
              {overrideDateMode === 'multi' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white rounded-lg border border-slate-200">
                    {datesForOverrideModal.map(d => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg font-mono text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs"
                      >
                        {d}
                        {datesForOverrideModal.length > 1 && (
                          <button
                            type="button"
                            className="text-slate-400 hover:text-red-600 transition-colors font-bold text-sm leading-none ml-1"
                            onClick={() => setDatesForOverrideModal(prev => prev.filter(x => x !== d))}
                            title="Remove date"
                          >
                            &times;
                          </button>
                        )}
                      </span>
                    ))}
                  </div>

                  {/* Add Date Inline */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                    <input
                      type="date"
                      className="form-input text-xs py-1 px-2 font-medium w-auto"
                      value={newDateInput}
                      onChange={e => setNewDateInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs text-xs font-semibold py-1 px-2.5 text-blue-700 bg-blue-50/50 hover:bg-blue-100/60 border-blue-200"
                      onClick={() => {
                        if (newDateInput && !datesForOverrideModal.includes(newDateInput)) {
                          setDatesForOverrideModal(prev => [...prev, newDateInput].sort());
                          setNewDateInput('');
                        } else if (datesForOverrideModal.includes(newDateInput)) {
                          toast.error('Date already added');
                        }
                      }}
                      disabled={!newDateInput || datesForOverrideModal.includes(newDateInput)}
                    >
                      + Add Date
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Status Option Grid */}
            <div>
              <label className="form-label font-bold text-slate-800 mb-1.5 block">
                Select Attendance Status
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {/* Absent Option */}
                <button
                  type="button"
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    overrideForm.type === 'absent'
                      ? 'border-red-500 bg-red-50 text-red-950 ring-2 ring-red-400 font-bold shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                  onClick={() => setOverrideForm(f => ({ ...f, type: 'absent', hours: 0 }))}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <UserX className={`w-4 h-4 ${overrideForm.type === 'absent' ? 'text-red-600' : 'text-slate-500'}`} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-red-100 text-red-800">0.0h</span>
                  </div>
                  <div>
                    <p className="font-bold text-xs">Absent</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Mark intern absent</p>
                  </div>
                </button>

                {/* Holiday Option */}
                <button
                  type="button"
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    overrideForm.type === 'holiday'
                      ? 'border-yellow-500 bg-yellow-50 text-yellow-950 ring-2 ring-yellow-400 font-bold shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                  onClick={() => setOverrideForm(f => ({ ...f, type: 'holiday', hours: 0 }))}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <Calendar className={`w-4 h-4 ${overrideForm.type === 'holiday' ? 'text-yellow-600' : 'text-slate-500'}`} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-yellow-100 text-yellow-900">0.0h</span>
                  </div>
                  <div>
                    <p className="font-bold text-xs">Holiday</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Official holiday</p>
                  </div>
                </button>

                {/* Suspended Option */}
                <button
                  type="button"
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    overrideForm.type === 'suspended'
                      ? 'border-blue-500 bg-blue-50 text-blue-950 ring-2 ring-blue-400 font-bold shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                  onClick={() => setOverrideForm(f => ({ ...f, type: 'suspended', hours: 0 }))}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <CloudRain className={`w-4 h-4 ${overrideForm.type === 'suspended' ? 'text-blue-600' : 'text-slate-500'}`} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-blue-100 text-blue-800">0.0h</span>
                  </div>
                  <div>
                    <p className="font-bold text-xs">Suspended</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Typhoon/weather</p>
                  </div>
                </button>

                {/* School Face to Face / Class Option */}
                <button
                  type="button"
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    overrideForm.type === 'school'
                      ? 'border-purple-500 bg-purple-50 text-purple-950 ring-2 ring-purple-400 font-bold shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                  onClick={() => setOverrideForm(f => ({ ...f, type: 'school', hours: 0, remarks: f.remarks || 'University Face-to-Face Class' }))}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <GraduationCap className={`w-4 h-4 ${overrideForm.type === 'school' ? 'text-purple-600' : 'text-slate-500'}`} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-purple-100 text-purple-800">0.0h</span>
                  </div>
                  <div>
                    <p className="font-bold text-xs">School F2F / Class</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Face-to-face class</p>
                  </div>
                </button>

                {/* Excused Option */}
                <button
                  type="button"
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    overrideForm.type === 'excused'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-400 font-bold shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                  onClick={() => setOverrideForm(f => ({ ...f, type: 'excused', hours: 8 }))}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <CheckCircle className={`w-4 h-4 ${overrideForm.type === 'excused' ? 'text-emerald-600' : 'text-slate-500'}`} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-emerald-100 text-emerald-800">8.0h</span>
                  </div>
                  <div>
                    <p className="font-bold text-xs">Excused</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Credited 8 hrs</p>
                  </div>
                </button>

                {/* Custom Hours Option */}
                <button
                  type="button"
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    overrideForm.type === 'hours'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-400 font-bold shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                  onClick={() => setOverrideForm(f => ({ ...f, type: 'hours' }))}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <Clock className={`w-4 h-4 ${overrideForm.type === 'hours' ? 'text-indigo-600' : 'text-slate-500'}`} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-indigo-100 text-indigo-800">Custom</span>
                  </div>
                  <div>
                    <p className="font-bold text-xs">Custom Hours</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Credit specific hrs</p>
                  </div>
                </button>

                {/* Clear Override Option */}
                <button
                  type="button"
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    overrideForm.type === 'none'
                      ? 'border-gray-500 bg-gray-100 text-gray-950 ring-2 ring-gray-400 font-bold shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                  onClick={() => setOverrideForm(f => ({ ...f, type: 'none', hours: 0, remarks: '' }))}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <RotateCcw className={`w-4 h-4 ${overrideForm.type === 'none' ? 'text-gray-700' : 'text-slate-500'}`} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-gray-200 text-gray-800">Reset</span>
                  </div>
                  <div>
                    <p className="font-bold text-xs">Normal / Reset</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Remove override</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Custom Hours Input if hours or others selected */}
            {(overrideForm.type === 'hours' || overrideForm.type === 'others') && (
              <div className="form-group bg-blue-50 border border-blue-200 rounded-xl p-3">
                <label className="form-label font-bold text-xs text-blue-900">Custom Hours to Credit (0 to 8)</label>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="0.25"
                  className="form-input font-bold text-sm"
                  value={overrideForm.hours}
                  onChange={e => setOverrideForm(f => ({ ...f, hours: Number(e.target.value) }))}
                />
              </div>
            )}

            {/* Remarks / Reason input */}
            {overrideForm.type !== 'none' && (
              <div className="form-group">
                <label className="form-label font-bold text-xs text-slate-700">
                  {overrideForm.type === 'holiday'
                    ? 'Holiday Name / Banner Label'
                    : overrideForm.type === 'absent'
                    ? 'Absent Reason / Remarks'
                    : overrideForm.type === 'school'
                    ? 'School / Subject / Class Reason'
                    : 'Reason / Remarks'}
                </label>
                
                {overrideForm.type === 'holiday' && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['Special Non-Working Holiday', 'Regular Holiday', 'City Holiday'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="px-2 py-0.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-900 border border-yellow-200 rounded text-[11px] font-medium"
                        onClick={() => setOverrideForm(f => ({ ...f, remarks: preset }))}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                )}

                {overrideForm.type === 'absent' && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['Sick Leave', 'Unexcused Absence', 'Family Emergency', 'Personal Matter'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 rounded text-[11px] font-medium"
                        onClick={() => setOverrideForm(f => ({ ...f, remarks: preset }))}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                )}

                {overrideForm.type === 'suspended' && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['Typhoon Suspension', 'Inclement Weather', 'Office Maintenance'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded text-[11px] font-medium"
                        onClick={() => setOverrideForm(f => ({ ...f, remarks: preset }))}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                )}

                {overrideForm.type === 'school' && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['University Face-to-Face Class', 'Academic Exam / Midterms', 'School Laboratory / Thesis', 'Official Class Schedule'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded text-[11px] font-medium"
                        onClick={() => setOverrideForm(f => ({ ...f, remarks: preset }))}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  className="form-input text-xs"
                  value={overrideForm.remarks}
                  onChange={e => setOverrideForm(f => ({ ...f, remarks: e.target.value }))}
                  placeholder={
                    overrideForm.type === 'absent'
                      ? "e.g. Sick Leave, Unexcused, Family Emergency..."
                      : overrideForm.type === 'holiday'
                      ? "e.g. Special Non-Working Holiday, Bonifacio Day (Default: Holiday)"
                      : overrideForm.type === 'suspended'
                      ? "e.g. Typhoon Suspension, Heavy Rain"
                      : overrideForm.type === 'school'
                      ? "e.g. University Face-to-Face Class, Midterm Exam, Major Subject"
                      : overrideForm.type === 'excused'
                      ? "e.g. ITMS General Assembly, Official school event"
                      : "Optional remarks or label..."
                  }
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Enhanced Bulk Override Modal */}
      <BulkDTROverrideModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        initialDates={selectedDates.length > 0 ? selectedDates : undefined}
        onSuccess={() => {
          if (selectedInternId) loadDTR();
        }}
      />

      {/* Superadmin DTR Manual Edit Modal */}
      {isSuperadmin && (
        <DTREditModal
          isOpen={dtrEditModalOpen}
          onClose={() => setDtrEditModalOpen(false)}
          intern={selectedInternData}
          date={selectedDateForEdit}
          record={selectedRecordForEdit}
          onSaveSuccess={loadDTR}
        />
      )}

      {/* Superadmin DTR Modification Audit History Modal */}
      {isSuperadmin && (
        <DTRHistoryModal
          isOpen={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          internId={selectedInternId || null}
          internName={selectedInternData?.full_name || null}
        />
      )}

      {/* Floating Action Dock for Selected Dates */}
      {canManageOverrides && selectedDates.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-2xl bg-slate-900/95 backdrop-blur-md text-white shadow-2xl rounded-2xl p-3.5 px-5 border border-slate-700/80 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-sm shadow-inner text-white">
              {selectedDates.length}
            </div>
            <div>
              <p className="font-bold text-sm text-slate-100">
                {selectedDates.length === 1 ? '1 Date Selected' : `${selectedDates.length} Dates Selected`}
              </p>
              <p className="text-[11px] text-slate-400">
                {isSuperadmin
                  ? 'Set attendance status (Absent, Holiday, Suspended) or alter time logs'
                  : 'Ready to set attendance status (Absent, Holiday, Suspended)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-sm btn-ghost text-slate-300 hover:text-white hover:bg-slate-800 text-xs"
              onClick={() => setSelectedDates([])}
            >
              Clear
            </button>
            <button
              type="button"
              id="dock-override-status-btn"
              className="btn btn-sm bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 shadow-md text-xs px-3.5"
              onClick={handleOpenMultiOverrideModal}
            >
              <Calendar className="w-3.5 h-3.5" />
              Set Status ({selectedDates.length} Date{selectedDates.length > 1 ? 's' : ''})
            </button>
            {isSuperadmin && (
              <button
                type="button"
                className="btn btn-sm bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center gap-1.5 shadow-md text-xs px-3.5"
                onClick={() => setBatchAlterModalOpen(true)}
              >
                <Edit className="w-3.5 h-3.5" />
                Alter Times / Logs
              </button>
            )}
          </div>
        </div>
      )}

      {/* Superadmin Batch / Single Date Alteration Modal */}
      {isSuperadmin && batchAlterModalOpen && (
        <DTRBatchAlterModal
          isOpen={batchAlterModalOpen}
          onClose={() => setBatchAlterModalOpen(false)}
          intern={selectedInternData}
          selectedDates={selectedDates}
          existingRecords={dtrRecords}
          onSaveSuccess={() => {
            loadDTR();
            setSelectedDates([]);
          }}
        />
      )}
    </div>
  );
}
