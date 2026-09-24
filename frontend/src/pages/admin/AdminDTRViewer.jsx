import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Clock, Filter, AlertCircle, Edit, Calendar, History, Shield, ShieldCheck, CheckSquare, Square, MousePointerClick } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../utils/api.js';
import DTRPrint from '../../components/dtr/DTRPrint.jsx';
import Modal from '../../components/common/Modal.jsx';
import DTREditModal from '../../components/dtr/DTREditModal.jsx';
import DTRHistoryModal from '../../components/dtr/DTRHistoryModal.jsx';
import DTRBatchAlterModal from '../../components/dtr/DTRBatchAlterModal.jsx';
import BulkDTROverrideModal from '../../components/dtr/BulkDTROverrideModal.jsx';
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

  // Superadmin DTR manual edit modal state
  const [dtrEditModalOpen, setDtrEditModalOpen] = useState(false);
  const [selectedRecordForEdit, setSelectedRecordForEdit] = useState(null);
  const [selectedDateForEdit, setSelectedDateForEdit] = useState(null);

  // Superadmin modification audit history modal state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Single override dialog state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [overrideForm, setOverrideForm] = useState({
    type: 'none', // 'none' | 'suspended' | 'excused' | 'hours' | 'others'
    hours: 8,
    remarks: '',
  });
  const [savingOverride, setSavingOverride] = useState(false);

  // Bulk override dialog state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // Load interns list
  useEffect(() => {
    api.get('/interns', { params: { limit: 100 } })
      .then(res => {
        setInterns(res.data.interns || []);
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

  // Clear date selection when changing intern or month/year
  useEffect(() => {
    setSelectedDates([]);
    lastClickedDateRef.current = null;
  }, [selectedInternId, filters.month, filters.year]);

  const daysInMonth = filters.month && filters.year ? new Date(filters.year, filters.month, 0).getDate() : 31;

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

  const handleRowClick = (day, record) => {
    const dateStr = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isSuperadmin) {
      handleDateToggle(dateStr, false, false);
    }
  };

  const handleSaveOverride = async () => {
    if (!selectedInternId || !selectedDay) return;
    
    // Construct date string (YYYY-MM-DD)
    const dateStr = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;

    setSavingOverride(true);
    try {
      await api.post(`/admin/dtr/${selectedInternId}/override`, {
        date: dateStr,
        type: overrideForm.type,
        hours: overrideForm.hours,
        remarks: overrideForm.remarks
      });
      toast.success('DTR day configuration updated');
      setOverrideModalOpen(false);
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
                  {i.full_name} ({i.division_name || 'No Division'})
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
                  <li>**Excel Date Selection**: Click any date row or checkbox to select.</li>
                  <li>Hold **Shift** to select a range of dates, or **Ctrl** for multi-select.</li>
                  <li>Click **Alter Selected Dates** to batch adjust Time In/Out or apply schedule overrides.</li>
                  <li>Every manual correction requires a **reason** and is permanently recorded in the audit trail.</li>
                </ul>
              </div>
            ) : (
              <div className="card p-5 bg-gray-50 border border-gray-200 space-y-2">
                <h3 className="font-bold text-sm text-gray-700 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-gray-500" /> View-Only Access
                </h3>
                <p className="text-xs text-gray-600">
                  You have view-only access to this trainee&apos;s Daily Time Record. Manual adjustments and schedule overrides are restricted to Superadmin.
                </p>
              </div>
            )}

            {selectedInternData && (
              <div className="card p-4 border border-gray-150 space-y-2.5">
                <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider">Intern Profile Info</h4>
                <div className="text-xs text-gray-600 space-y-1">
                  <p><span className="font-bold text-gray-800">School:</span> {selectedInternData.school || '—'}</p>
                  <p><span className="font-bold text-gray-800">Course:</span> {selectedInternData.course || '—'}</p>
                  <p><span className="font-bold text-gray-800">Division:</span> {selectedInternData.division_name || '—'}</p>
                  <p><span className="font-bold text-gray-800">Required:</span> {selectedInternData.required_hours || 0} Hrs</p>
                </div>
              </div>
            )}
          </div>

          {/* DTR Sheet Rendering */}
          <div className="xl:col-span-3 card p-6 bg-white overflow-hidden shadow-sm flex flex-col items-center dtr-sheet-card">
            {isSuperadmin && (
              <div className="w-full max-w-[800px] mb-3 p-2.5 px-3 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-950 flex items-center gap-1.5">
                    <MousePointerClick className="w-4 h-4 text-blue-600" />
                    Excel Date Selection
                  </span>
                  <span className="text-[11px] text-blue-700 hidden sm:inline">
                    Click rows/checkboxes. Hold <kbd className="px-1 py-0.5 bg-white border border-blue-200 rounded font-mono text-[10px]">Shift</kbd> for range, <kbd className="px-1 py-0.5 bg-white border border-blue-200 rounded font-mono text-[10px]">Ctrl</kbd> for multi-select.
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
                  {selectedDates.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-xs text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 bg-white border border-red-200"
                      onClick={() => setSelectedDates([])}
                    >
                      Clear ({selectedDates.length})
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="w-full max-w-[800px] border border-gray-300 rounded-xl p-4 bg-gray-50/50 overflow-x-auto">
              <DTRPrint
                intern={selectedInternData}
                records={dtrRecords}
                month={filters.month}
                year={filters.year}
                onRowClick={handleRowClick}
                isSelectable={isSuperadmin}
                selectedDates={selectedDates}
                onDateToggle={handleDateToggle}
                onSelectAllDates={handleSelectAllToggle}
                allDatesSelected={selectedDates.length > 0 && selectedDates.length === allMonthDates.length}
              />
            </div>
          </div>

        </div>
      )}

      {/* Override Single Day Modal */}
      {overrideModalOpen && selectedDay && (
        <Modal
          isOpen={overrideModalOpen}
          onClose={() => setOverrideModalOpen(false)}
          title={`Configure Attendance for ${months[filters.month - 1]} ${selectedDay}, ${filters.year}`}
          size="md"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setOverrideModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveOverride} disabled={savingOverride}>
                {savingOverride ? 'Saving...' : 'Apply Configuration'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="form-group">
              <label className="form-label font-bold text-xs">Configuration Type</label>
              <select
                className="form-input form-select text-sm font-semibold"
                value={overrideForm.type}
                onChange={e => setOverrideForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="none">No Override (Scans process normally)</option>
                <option value="suspended">Suspended (No hours, label &quot;SUSPENDED&quot;)</option>
                <option value="excused">Excused (Credits 8.00 hours, label &quot;EXCUSED&quot;)</option>
                <option value="hours">Custom Hours (Override total daily hours)</option>
                <option value="others">Others (Custom label and custom hours)</option>
              </select>
            </div>

            {(overrideForm.type === 'hours' || overrideForm.type === 'others') && (
              <div className="form-group">
                <label className="form-label font-bold text-xs">Custom Hours to Credit</label>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="0.25"
                  className="form-input font-bold"
                  value={overrideForm.hours}
                  onChange={e => setOverrideForm(f => ({ ...f, hours: Number(e.target.value) }))}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label font-bold text-xs">Remarks / Label</label>
              <textarea
                className="form-input"
                rows={3}
                value={overrideForm.remarks}
                onChange={e => setOverrideForm(f => ({ ...f, remarks: e.target.value }))}
                placeholder={
                  overrideForm.type === 'others'
                    ? "e.g. SEMINAR, HOLIDAY OVERRIDE, etc. (will show as row label)"
                    : "e.g. Typhoon Suspension, Excused leave, System issue..."
                }
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Enhanced Bulk Override Modal */}
      <BulkDTROverrideModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
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

      {/* Superadmin Floating Action Dock for Excel Selection */}
      {isSuperadmin && selectedDates.length > 0 && (
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
                Ready to alter official time or schedule overrides
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-ghost text-slate-300 hover:text-white hover:bg-slate-800 text-xs"
              onClick={() => setSelectedDates([])}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-sm bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 shadow-md text-xs px-4"
              onClick={() => setBatchAlterModalOpen(true)}
            >
              <Edit className="w-3.5 h-3.5" />
              Alter Selected Date{selectedDates.length > 1 ? 's' : ''}
            </button>
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
