import { useState, useEffect, useCallback } from 'react';
import { Clock, Filter, AlertCircle, Edit, Calendar, History, Shield, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../utils/api.js';
import DTRPrint from '../../components/dtr/DTRPrint.jsx';
import Modal from '../../components/common/Modal.jsx';
import DTREditModal from '../../components/dtr/DTREditModal.jsx';
import DTRHistoryModal from '../../components/dtr/DTRHistoryModal.jsx';
import DTRPreviewModal from '../../components/dtr/DTRPreviewModal.jsx';
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

  // Superadmin DTR manual edit modal state
  const [dtrEditModalOpen, setDtrEditModalOpen] = useState(false);
  const [selectedRecordForEdit, setSelectedRecordForEdit] = useState(null);
  const [selectedDateForEdit, setSelectedDateForEdit] = useState(null);

  // DTR Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedRecordForPreview, setSelectedRecordForPreview] = useState(null);

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
  const [bulkForm, setBulkForm] = useState({
    date: getPhtTodayKey(),
    type: 'suspended', // 'none' | 'suspended' | 'excused' | 'hours' | 'others'
    hours: 8,
    remarks: '',
  });
  const [savingBulk, setSavingBulk] = useState(false);

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

  const handleRowClick = (day, record) => {
    const dateStr = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const defaultTimeIn = selectedInternData?.assigned_profile?.time_in ? selectedInternData.assigned_profile.time_in.slice(0, 5) : '08:00';
    const defaultTimeOut = selectedInternData?.assigned_profile?.time_out ? selectedInternData.assigned_profile.time_out.slice(0, 5) : '17:00';
    const targetRec = record || {
      date: dateStr,
      attendance_date: dateStr,
      time_in: defaultTimeIn,
      am_time_in: defaultTimeIn,
      time_out: defaultTimeOut,
      pm_time_out: defaultTimeOut,
      approval_status: 'approved',
    };
    setSelectedDay(day);
    setSelectedDateForEdit(dateStr);
    setSelectedRecordForEdit(targetRec);
    setSelectedRecordForPreview(targetRec);
    setPreviewModalOpen(true);
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

  const handleSaveBulkOverride = async () => {
    setSavingBulk(true);
    try {
      const res = await api.post('/admin/dtr/bulk-override', {
        date: bulkForm.date,
        type: bulkForm.type,
        hours: bulkForm.hours,
        remarks: bulkForm.remarks
      });
      toast.success(`Bulk override applied to ${res.data.count || 0} active interns`);
      setBulkModalOpen(false);
      if (selectedInternId) {
        loadDTR(); // Refresh current intern if visible
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to save bulk override';
      toast.error(errMsg);
    } finally {
      setSavingBulk(false);
    }
  };

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const filteredInterns = interns.filter(i => {
    const search = internSearch.toLowerCase();
    return (i.full_name?.toLowerCase().includes(search) || false) || (i.department_name?.toLowerCase().includes(search) || false);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Intern DTR Management</h1>
          <p className="text-gray-500 text-sm">
            {isSuperadmin
              ? 'Superadmin DTR management, manual corrections with audit logging, and schedule overrides'
              : 'View Daily Time Records for personnel under your supervision'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {selectedInternId && (
            <button
              className="btn btn-secondary flex items-center gap-1.5 text-xs"
              onClick={() => {
                const todayStr = getPhtTodayKey();
                const existing = dtrRecords.find(r => r.date === todayStr);
                const defaultTimeIn = selectedInternData?.assigned_profile?.time_in ? selectedInternData.assigned_profile.time_in.slice(0, 5) : '08:00';
                const defaultTimeOut = selectedInternData?.assigned_profile?.time_out ? selectedInternData.assigned_profile.time_out.slice(0, 5) : '17:00';
                const rec = existing || {
                  date: todayStr,
                  attendance_date: todayStr,
                  time_in: defaultTimeIn,
                  am_time_in: defaultTimeIn,
                  time_out: defaultTimeOut,
                  pm_time_out: defaultTimeOut,
                  approval_status: 'approved',
                };
                setSelectedRecordForPreview(rec);
                setPreviewModalOpen(true);
              }}
            >
              <ImageIcon className="w-4 h-4 text-blue-600" />
              Preview DTR Image
            </button>
          )}
          {isSuperadmin && (
            <>
              <button
                className="btn btn-secondary flex items-center gap-1.5 text-xs"
                onClick={() => setHistoryModalOpen(true)}
              >
                <History className="w-4 h-4 text-blue-600" />
                Modification History
              </button>
              <button
                className="btn btn-secondary flex items-center gap-1.5 text-xs"
                onClick={() => {
                  setBulkForm({
                    date: getPhtTodayKey(),
                    type: 'suspended',
                    hours: 8,
                    remarks: ''
                  });
                  setBulkModalOpen(true);
                }}
              >
                <Calendar className="w-4 h-4" /> Bulk DTR Override
              </button>
            </>
          )}
        </div>
      </div>

      {/* Trainee & Period Selectors */}
      <div className="card p-4 flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-end">
        <div className="form-group w-full sm:flex-1 sm:min-w-[300px]">
          <label className="form-label font-bold text-xs text-gray-700">Trainee / Intern</label>
          <div className="flex flex-col gap-2">
            <input 
              type="text" 
              className="form-input text-sm"
              placeholder="Type to filter by name or department..."
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
                  {i.full_name} ({i.department_name || 'No Dept'})
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
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          
          {/* Instructions Box */}
          <div className="xl:col-span-1 space-y-4">
            {isSuperadmin ? (
              <div className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 space-y-3">
                <h3 className="font-bold text-sm text-blue-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-700" /> Superadmin DTR Control
                </h3>
                <ul className="text-xs text-blue-800 space-y-2 list-disc list-inside">
                  <li>Click on **any date row** in the table to correct Time In, Time Out, or attendance status.</li>
                  <li>Every manual correction requires a **reason** and is permanently recorded in the audit trail.</li>
                  <li>View the full audit trail anytime via **Modification History**.</li>
                  <li>Schedule overrides (Suspended/Excused) remain supported.</li>
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
                  <p><span className="font-bold text-gray-800">Division:</span> {selectedInternData.division_name || selectedInternData.department_name || '—'}</p>
                  <p><span className="font-bold text-gray-800">Required:</span> {selectedInternData.required_hours || 0} Hrs</p>
                </div>
              </div>
            )}
          </div>

          {/* DTR Sheet Rendering */}
          <div className="xl:col-span-3 card p-6 bg-white overflow-hidden shadow-sm flex flex-col items-center">
            <div className="w-full max-w-[800px] border border-gray-300 rounded-xl p-4 bg-gray-50/50 overflow-x-auto">
              <DTRPrint
                intern={selectedInternData}
                records={dtrRecords}
                month={filters.month}
                year={filters.year}
                onRowClick={handleRowClick}
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

      {/* Bulk Override Modal */}
      {bulkModalOpen && (
        <Modal
          isOpen={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          title="Apply Bulk DTR Override (All Active Interns)"
          size="md"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setBulkModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveBulkOverride} disabled={savingBulk}>
                {savingBulk ? 'Saving...' : 'Apply to All Interns'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="form-group">
              <label className="form-label font-bold text-xs">Target Date</label>
              <input
                type="date"
                className="form-input font-semibold"
                value={bulkForm.date}
                onChange={e => setBulkForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label font-bold text-xs">Configuration Type</label>
              <select
                className="form-input form-select text-sm font-semibold"
                value={bulkForm.type}
                onChange={e => setBulkForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="suspended">Suspended (No hours, label &quot;SUSPENDED&quot;)</option>
                <option value="excused">Excused (Credits 8.00 hours, label &quot;EXCUSED&quot;)</option>
                <option value="hours">Custom Hours (Override total daily hours)</option>
                <option value="others">Others (Custom label and custom hours)</option>
                <option value="none">Clear Override (Remove custom configuration)</option>
              </select>
            </div>

            {(bulkForm.type === 'hours' || bulkForm.type === 'others') && (
              <div className="form-group">
                <label className="form-label font-bold text-xs">Custom Hours to Credit</label>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="0.25"
                  className="form-input font-bold"
                  value={bulkForm.hours}
                  onChange={e => setBulkForm(f => ({ ...f, hours: Number(e.target.value) }))}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label font-bold text-xs">Remarks / Label</label>
              <textarea
                className="form-input"
                rows={3}
                value={bulkForm.remarks}
                onChange={e => setBulkForm(f => ({ ...f, remarks: e.target.value }))}
                placeholder={
                  bulkForm.type === 'others'
                    ? "e.g. SEMINAR, HOLIDAY OVERRIDE, etc. (will show as row label)"
                    : "e.g. Typhoon Suspension, Excused leave, System issue..."
                }
              />
            </div>
          </div>
        </Modal>
      )}

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

      {/* Official DTR Attendance Preview Modal */}
      {previewModalOpen && selectedRecordForPreview && (
        <DTRPreviewModal
          isOpen={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          record={selectedRecordForPreview}
          intern={selectedInternData}
          currentUser={user}
          onSaveSuccess={(updatedRecord) => {
            loadDTR();
            if (updatedRecord) {
              setSelectedRecordForPreview(updatedRecord);
            }
          }}
        />
      )}
    </div>
  );
}
