import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Edit2, Trash2, Key, Archive, ShieldCheck, ClipboardList, Check, XCircle, History, RefreshCw, Eraser, Undo2 } from 'lucide-react';
import api from '../../utils/api.js';
import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';
import { AVAILABLE_COURSES } from '../../utils/constants.js';
import FaceRegistrationModal from '../../components/face/FaceRegistrationModal.jsx';

const INIT_FORM = {
  username: '', password: '', first_name: '', middle_name: '', last_name: '', name_suffix: '', email: '', phone: '', 
  school_id: '',
  course: '', year_level: '4th Year', department_id: '',
  required_hours: 300, start_date: '', end_date: '', status: 'active',
  student_id: '', home_address: '', emergency_name: '', emergency_relation: '', emergency_phone: ''
};

const SENTINEL_NEW_SCHOOL = '__new__';

const generateUsername = (firstName, lastName) => {
  const cleanFirst = (firstName || '').trim().toLowerCase().split(/\s+/)[0] || '';
  const cleanLast = (lastName || '').trim().toLowerCase().replace(/\s+/g, '') || '';
  if (!cleanFirst && !cleanLast) return '';
  return `${cleanFirst}.${cleanLast}`.replace(/[^a-z0-9.]/g, '');
};

const generatePassword = (lastName, studentId) => {
  if (!lastName) return '';
  const parts = lastName.trim().split(/\s+/);
  const surname = parts[parts.length - 1].toUpperCase().replace(/[^A-Z]/g, '');
  const digits = (studentId || '').replace(/\D/g, '');
  const last4 = digits.slice(-4).padStart(4, '0');
  return `${surname}-${last4}`;
};

const calculateEstimatedEndDate = (startDateStr, requiredHours) => {
  if (!startDateStr || !requiredHours) return '';
  const parts = startDateStr.split('-');
  if (parts.length !== 3) return '';
  const start = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(start.getTime())) return '';
  
  let hours = Number(requiredHours);
  if (isNaN(hours) || hours <= 0) return '';
  
  let daysNeeded = Math.ceil(hours / 8);
  let current = new Date(start);
  
  let daysAdded = 0;
  while (daysNeeded > 0) {
    if (daysAdded > 0) {
      current.setDate(current.getDate() + 1);
    }
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip Sunday (0) and Saturday (6)
      daysNeeded--;
    }
    daysAdded++;
  }
  
  const yyyy = current.getFullYear();
  const mm = String(current.getMonth() + 1).padStart(2, '0');
  const dd = String(current.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function InternManagement() {
  const [interns, setInterns] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [schools, setSchools] = useState([]);
  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'delete' | 'reset'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(INIT_FORM);
  const [saving, setSaving] = useState(false);
  const [resetPwd, setResetPwd] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'archived'
  const [sortBy, setSortBy] = useState('full_name'); // 'full_name' | 'department' | 'school'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
  const [faceEnrollmentTarget, setFaceEnrollmentTarget] = useState(null);
  const [renewalRequests, setRenewalRequests] = useState([]);
  const [renewalLoading, setRenewalLoading] = useState(true);
  const [renewalError, setRenewalError] = useState('');
  const [renewalView, setRenewalView] = useState('active');
  const [renewalActionId, setRenewalActionId] = useState(null);
  const [clearingResolved, setClearingResolved] = useState(false);
  const [renewalConfirm, setRenewalConfirm] = useState(null);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewAction, setReviewAction] = useState('approve');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [enrollmentHistory, setEnrollmentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchInterns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/interns', {
        params: {
          search,
          page,
          limit: 10,
          status: activeTab,
          sort_by: sortBy,
          sort_order: sortOrder
        }
      });
      setInterns(res.data.interns);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load interns'); }
    finally { setLoading(false); }
  }, [search, page, activeTab, sortBy, sortOrder]);

  const fetchRenewalRequests = useCallback(async () => {
    setRenewalLoading(true);
    setRenewalError('');
    try {
      const res = await api.get('/face-renewal-requests', {
        params: { status: 'all', include_dismissed: true },
      });
      setRenewalRequests(res.data.requests || []);
    } catch (error) {
      const isMissingRoute = error?.response?.status === 404;
      setRenewalError(
        isMissingRoute
          ? 'The Face ID renewal service is not loaded by the running backend. Restart the backend and try again.'
          : error?.response?.data?.error || 'Face ID renewal requests are temporarily unavailable.'
      );
      setRenewalRequests([]);
    } finally {
      setRenewalLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get('/divisions').catch(() => api.get('/departments'))
      .then(r => setDepartments(r.data.divisions || r.data.departments || []))
      .catch(() => toast.error('Could not load division list.'));
    api.get('/schools')
      .then(r => setSchools(r.data.schools))
      .catch(() => toast.error('Could not load school list.'));
  }, []);

  useEffect(() => { fetchInterns(); }, [fetchInterns]);
  useEffect(() => { fetchRenewalRequests(); }, [fetchRenewalRequests]);

  useEffect(() => {
    if (form.start_date && form.required_hours) {
      const estimatedEnd = calculateEstimatedEndDate(form.start_date, form.required_hours);
      if (estimatedEnd && form.end_date !== estimatedEnd) {
        setForm(f => ({ ...f, end_date: estimatedEnd }));
      }
    }
  }, [form.start_date, form.required_hours]);

  const openCreate = () => { setForm(INIT_FORM); setNewSchoolName(''); setModal('create'); };
  const openEdit = (i) => {
    setSelected(i);
    setForm({
      ...i,
      password: '',
      student_id: i.student_id || '',
      home_address: i.home_address || '',
      emergency_name: i.emergency_name || '',
      emergency_relation: i.emergency_relation || '',
      emergency_phone: i.emergency_phone || ''
    });
    setModal('edit');
    setNewSchoolName('');
  };
  const openDelete = (i) => { setSelected(i); setModal('delete'); };
  const openReset = (i) => { setSelected(i); setResetPwd(''); setModal('reset'); };
  const openArchive = (i) => { setSelected(i); setModal('archive'); };

  const openReview = (request, action) => {
    setReviewTarget(request);
    setReviewAction(action);
    setReviewRemarks('');
  };

  const handleReviewRequest = async () => {
    if (reviewAction === 'reject' && reviewRemarks.trim().length < 3) {
      toast.error('Enter a short explanation for rejecting the request');
      return;
    }
    setReviewSaving(true);
    try {
      const res = await api.patch(`/face-renewal-requests/${reviewTarget.id}/review`, {
        action: reviewAction,
        remarks: reviewRemarks.trim(),
      });
      toast.success(res.data.message || `Request ${reviewAction}d`);
      setReviewTarget(null);
      await fetchRenewalRequests();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not review renewal request');
    } finally {
      setReviewSaving(false);
    }
  };

  const handleRequestVisibility = async (request, dismissed) => {
    const verb = dismissed ? 'clear' : 'restore';
    setRenewalActionId(request.id);
    try {
      const res = await api.patch(`/face-renewal-requests/${request.id}/visibility`, { dismissed });
      toast.success(res.data.message || `Renewal request ${dismissed ? 'cleared' : 'restored'}`);
      setRenewalConfirm(null);
      await fetchRenewalRequests();
    } catch (error) {
      toast.error(error?.response?.data?.error || `Could not ${verb} renewal request`);
    } finally {
      setRenewalActionId(null);
    }
  };

  const handleClearResolved = async () => {
    const count = renewalRequests.filter(request =>
      !request.dismissed_at && ['rejected', 'completed'].includes(request.status)
    ).length;
    if (!count) return;
    setClearingResolved(true);
    try {
      const res = await api.patch('/face-renewal-requests/clear-resolved');
      toast.success(res.data.message || 'Resolved requests cleared');
      setRenewalView('active');
      setRenewalConfirm(null);
      await fetchRenewalRequests();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not clear resolved requests');
    } finally {
      setClearingResolved(false);
    }
  };

  const openEnrollmentHistory = async intern => {
    setHistoryTarget(intern);
    setEnrollmentHistory([]);
    setHistoryLoading(true);
    try {
      const res = await api.get('/face-enrollment-history', { params: { intern_id: intern.id } });
      setEnrollmentHistory(res.data.history || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not load enrollment history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.first_name || !form.first_name.trim() || !form.last_name || !form.last_name.trim()) {
      toast.error('First Name and Last Name are required');
      return;
    }
    if (modal === 'create') {
      if (!form.username || !form.username.trim()) {
        toast.error('Username is required');
        return;
      }
      if (!form.password || !form.password.trim()) {
        toast.error('Initial Password is required');
        return;
      }
      if (!form.email || !form.email.trim()) {
        toast.error('Email Address is required');
        return;
      }
    }

    setSaving(true);
    try {
      let school_id = form.school_id;

      // Auto-register a new school if the user typed one in
      if (form.school_id === SENTINEL_NEW_SCHOOL) {
        const trimmed = newSchoolName.trim();
        if (!trimmed) {
          toast.error('Please enter a name for the new school');
          setSaving(false);
          return;
        }
        try {
          const schoolRes = await api.post('/schools', { name: trimmed });
          school_id = schoolRes.data.school.id;
          // Refresh the schools list so the new one shows next time
          setSchools(prev => [...prev, schoolRes.data.school].sort((a, b) => a.name.localeCompare(b.name)));
          toast.success(`School "${trimmed}" registered automatically`);
        } catch (schoolErr) {
          const msg = schoolErr?.response?.data?.error || 'Failed to register new school';
          toast.error(msg);
          setSaving(false);
          return;
        }
      }

      const payload = { ...form, school_id: school_id || '' };

      if (modal === 'create') {
        await api.post('/interns', payload);
        toast.success('Intern created successfully');
      } else {
        await api.put(`/interns/${selected.id}`, payload);
        toast.success('Intern updated successfully');
      }
      setModal(null);
      setNewSchoolName('');
      fetchInterns();
    } catch (err) {
      const msg = err?.response?.data?.error || 'Save failed. Please check the form and try again.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/interns/${selected.id}`);
      toast.success('Intern deleted');
      setModal(null);
      fetchInterns();
    } catch { toast.error('Delete failed'); }
    finally { setSaving(false); }
  };

  const handleResetPwd = async () => {
    if (resetPwd.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      await api.post(`/interns/${selected.id}/reset-password`, { new_password: resetPwd });
      toast.success('Password reset successfully');
      setModal(null);
    } catch { toast.error('Reset failed'); }
    finally { setSaving(false); }
  };

  const handleArchiveToggle = async () => {
    setSaving(true);
    try {
      const isArchived = selected.status === 'archived';
      const newStatus = isArchived ? 'active' : 'archived';
      await api.put(`/interns/${selected.id}`, { status: newStatus });
      toast.success(`Intern ${isArchived ? 'unarchived' : 'archived'} successfully`);
      setModal(null);
      fetchInterns();
    } catch { toast.error('Archive operation failed'); }
    finally { setSaving(false); }
  };

  const columns = [
    {
      key: 'full_name', label: 'Intern Name',
      render: (v, row) => (
        <div className="flex items-center gap-2">
          <div className="avatar-placeholder w-8 h-8 text-xs flex-shrink-0">
            {v.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-800 text-sm">{v}</p>
            <p className="text-xs text-gray-400">{row.username}</p>
          </div>
        </div>
      )
    },
    { key: 'department_name', label: 'Division', render: (v, row) => row.division_name || v || <span className="text-gray-400">—</span> },
    { key: 'school', label: 'School', render: v => <span className="text-xs text-gray-600">{v || '—'}</span> },
    {
      key: 'rendered_hours', label: 'Progress',
      render: (v, row) => {
        const pct = Math.min(100, ((v || 0) / (row.required_hours || 486)) * 100);
        return (
          <div className="w-28">
            <div className="flex justify-between text-xs mb-1">
              <span>{(v || 0).toFixed(0)}h</span>
              <span className="text-gray-400">{row.required_hours}h</span>
            </div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          </div>
        );
      }
    },
    {
      key: 'status', label: 'Status',
      render: v => <span className={`badge badge-${v}`}>{v}</span>
    },
    {
      key: 'id', label: 'Actions',
      render: (_, row) => {
        const activeRenewalRequest = renewalRequests.find(request =>
          Number(request.intern_id) === Number(row.id)
          && ['pending', 'approved'].includes(request.status)
        );
        return (
          <div className="flex gap-1">
          <button className="btn btn-ghost btn-icon btn-sm" data-tooltip="Edit" onClick={() => openEdit(row)}><Edit2 className="w-3.5 h-3.5" /></button>
          <button className="btn btn-ghost btn-icon btn-sm" data-tooltip="Reset Password" onClick={() => openReset(row)}><Key className="w-3.5 h-3.5" /></button>
          <button
            className={`btn btn-ghost btn-icon btn-sm ${row.face_registered ? 'text-emerald-600' : 'text-blue-600'} disabled:opacity-40`}
            data-tooltip={activeRenewalRequest
              ? 'Resolve the active renewal request first'
              : row.face_registered ? 'Replace Face Enrollment' : 'Enroll Face'}
            onClick={() => setFaceEnrollmentTarget(row)}
            disabled={!!activeRenewalRequest}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm text-indigo-600"
            data-tooltip="Face Enrollment History"
            onClick={() => openEnrollmentHistory(row)}
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button 
            className={`btn btn-ghost btn-icon btn-sm ${row.status === 'archived' ? 'text-amber-600' : 'text-gray-500'}`} 
            data-tooltip={row.status === 'archived' ? 'Unarchive' : 'Archive'} 
            onClick={() => openArchive(row)}
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm text-red-500" data-tooltip="Delete" onClick={() => openDelete(row)}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        );
      }
    },
  ];

  const formFields = (
    <div className="space-y-6">
      {/* 1. Portal Authentication Credentials */}
      {modal === 'create' && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase font-extrabold tracking-widest text-blue-500">
            Portal Authentication Credentials
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Username <span className="text-red-500">*</span></label>
              <input
                className="form-input bg-gray-50/50"
                placeholder="e.g. john.doe"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Initial Password <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="form-input bg-gray-50/50"
                placeholder="Auto-generated password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. Personal Information */}
      <div className="space-y-3 pt-3 border-t border-gray-100">
        <p className="text-[10px] uppercase font-extrabold tracking-widest text-blue-500">
          Personal Information
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">First Name <span className="text-red-500">*</span></label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. Juan"
              value={form.first_name || ''}
              onChange={e => {
                const val = e.target.value;
                setForm(f => {
                  const updated = { ...f, first_name: val };
                  if (modal === 'create') {
                    updated.username = generateUsername(val, f.last_name);
                  }
                  return updated;
                });
              }}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Middle Name</label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. Santos"
              value={form.middle_name || ''}
              onChange={e => setForm(f => ({ ...f, middle_name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Last Name <span className="text-red-500">*</span></label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. De La Cruz"
              value={form.last_name || ''}
              onChange={e => {
                const val = e.target.value;
                setForm(f => {
                  const updated = { ...f, last_name: val };
                  if (modal === 'create') {
                    updated.username = generateUsername(f.first_name, val);
                    updated.password = generatePassword(val, f.student_id);
                  }
                  return updated;
                });
              }}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Suffix</label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. Jr., III"
              value={form.name_suffix || ''}
              onChange={e => setForm(f => ({ ...f, name_suffix: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Student ID / Number</label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. 2023-1200"
              value={form.student_id || ''}
              onChange={e => {
                const val = e.target.value;
                setForm(f => {
                  const updated = { ...f, student_id: val };
                  if (modal === 'create') {
                    updated.password = generatePassword(f.last_name, val);
                  }
                  return updated;
                });
              }}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Email Address</label>
            <input
              type="email"
              className="form-input bg-gray-50/50"
              placeholder="email@example.com"
              value={form.email || ''}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Contact Number</label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="0917-XXX-XXXX"
              value={form.phone || ''}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="form-group col-span-2">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">School / University</label>
            <select
              className="form-input form-select bg-gray-50/50"
              value={form.school_id || ''}
              onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
            >
              <option value="">Select school</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value={SENTINEL_NEW_SCHOOL}>➕ Add new school not in list...</option>
            </select>
            {form.school_id === SENTINEL_NEW_SCHOOL && (
              <div className="mt-2">
                <input
                  className="form-input bg-yellow-50/60 border-yellow-300 focus:ring-yellow-400"
                  placeholder="Enter full school / university name"
                  value={newSchoolName}
                  autoFocus
                  onChange={e => setNewSchoolName(e.target.value)}
                />
                <p className="text-[10px] text-yellow-600 mt-1 flex items-center gap-1">
                  <span>⚠</span> This school will be automatically registered when the intern is saved.
                </p>
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Year Level</label>
            <select
              className="form-input form-select bg-gray-50/50"
              value={form.year_level || '4th Year'}
              onChange={e => setForm(f => ({ ...f, year_level: e.target.value }))}
            >
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
              <option value="3rd Year">3rd Year</option>
              <option value="4th Year">4th Year</option>
              <option value="5th Year">5th Year</option>
            </select>
          </div>
          <div className="form-group col-span-2">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Course / Degree Program</label>
            <select
              className="form-input form-select bg-gray-50/50"
              value={form.course || ''}
              onChange={e => setForm(f => ({ ...f, course: e.target.value }))}
            >
              <option value="">Select course</option>
              {AVAILABLE_COURSES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-group col-span-2">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Home Address</label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="Complete Street, Barangay, City, Province"
              value={form.home_address || ''}
              onChange={e => setForm(f => ({ ...f, home_address: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* 3. Emergency Contact Details */}
      <div className="space-y-3 pt-3 border-t border-gray-100">
        <p className="text-[10px] uppercase font-extrabold tracking-widest text-blue-500">
          Emergency Contact Details
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Contact Name</label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="Parent or Guardian"
              value={form.emergency_name || ''}
              onChange={e => setForm(f => ({ ...f, emergency_name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Relationship</label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. Mother, Father"
              value={form.emergency_relation || ''}
              onChange={e => setForm(f => ({ ...f, emergency_relation: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Contact Phone</label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="0919-XXX-XXXX"
              value={form.emergency_phone || ''}
              onChange={e => setForm(f => ({ ...f, emergency_phone: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* 4. ITMS Deployment Information */}
      <div className="space-y-3 pt-3 border-t border-gray-100">
        <p className="text-[10px] uppercase font-extrabold tracking-widest text-blue-500">
          ITMS Deployment Information
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Division Assignment</label>
            {useAuth().user?.role === 'supervisor' ? (
              <select
                className="form-input form-select bg-gray-100 text-gray-500 cursor-not-allowed"
                value={useAuth().user?.division_id || useAuth().user?.department_id || ''}
                disabled
              >
                <option value={useAuth().user?.division_id || useAuth().user?.department_id}>{useAuth().user?.division_name || useAuth().user?.department_name || 'Your Division'}</option>
              </select>
            ) : (
              <select
                className="form-input form-select bg-gray-50/50"
                value={form.division_id || form.department_id || ''}
                onChange={e => setForm(f => ({ ...f, division_id: e.target.value, department_id: e.target.value }))}
              >
                <option value="">Select division</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Required Internship Hours</label>
            <input
              type="number"
              className="form-input bg-gray-50/50"
              placeholder="300"
              value={form.required_hours || 300}
              onChange={e => setForm(f => ({ ...f, required_hours: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Internship Start Date</label>
            <input
              type="date"
              className="form-input bg-gray-50/50"
              value={form.start_date || ''}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Estimated Internship End Date</label>
            <input
              type="date"
              className="form-input bg-gray-50/50"
              value={form.end_date || ''}
              onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
            />
          </div>
          {modal === 'edit' && (
            <div className="form-group col-span-2">
              <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Status</label>
              <select
                className="form-input form-select bg-gray-50/50"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="dropped">Dropped</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const tableActions = (
    <div className="flex items-center gap-2">
      <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Sort By:</label>
      <select
        className="form-input form-select text-xs py-1 px-2 bg-gray-50 border border-gray-200 rounded-lg max-w-40"
        value={sortBy}
        onChange={e => { setSortBy(e.target.value); setPage(1); }}
      >
        <option value="full_name">Name</option>
        <option value="department">Division</option>
        <option value="school">School</option>
      </select>
      <button
        className="btn btn-ghost btn-sm btn-icon border border-gray-200 bg-white hover:bg-gray-50 rounded-lg flex items-center justify-center w-8 h-8"
        data-tooltip={sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
        onClick={() => { setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); setPage(1); }}
      >
        <span className="text-xs font-bold">{sortOrder === 'asc' ? '▲' : '▼'}</span>
      </button>
    </div>
  );

  const visibleRenewalRequests = renewalRequests.filter(request => {
    const isResolved = ['rejected', 'completed'].includes(request.status);
    if (renewalView === 'active') return !request.dismissed_at && !isResolved;
    if (renewalView === 'resolved') return !request.dismissed_at && isResolved;
    if (renewalView === 'cleared') return Boolean(request.dismissed_at);
    return !request.dismissed_at;
  });
  const unresolvedRenewalCount = renewalRequests.filter(request =>
    !request.dismissed_at && ['pending', 'approved'].includes(request.status)
  ).length;
  const resolvedRenewalCount = renewalRequests.filter(request =>
    !request.dismissed_at && ['rejected', 'completed'].includes(request.status)
  ).length;
  const clearedRenewalCount = renewalRequests.filter(request => request.dismissed_at).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Intern Management</h1>
          <p className="text-gray-500 text-sm">{total} total interns</p>
        </div>
        <button id="create-intern-btn" className="btn btn-primary w-full sm:w-auto" onClick={openCreate}>
          <UserPlus className="w-4 h-4" /> Add Intern
        </button>
      </div>

      <div className="card border border-gray-100 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-gray-800">Face ID Renewal Requests</h2>
              <p className="text-xs text-gray-500">
                {unresolvedRenewalCount} active · {resolvedRenewalCount} resolved
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {resolvedRenewalCount > 0 && (
              <button
                className="btn btn-secondary btn-sm text-red-600"
                onClick={() => setRenewalConfirm({ type: 'clear-resolved', count: resolvedRenewalCount })}
                disabled={clearingResolved}
              >
                <Eraser className="w-4 h-4" />
                {clearingResolved ? 'Clearing...' : 'Clear resolved'}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={fetchRenewalRequests} disabled={renewalLoading}>
              <RefreshCw className={`w-4 h-4 ${renewalLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex flex-wrap gap-2">
          {[
            ['active', 'Active', unresolvedRenewalCount],
            ['resolved', 'Resolved', resolvedRenewalCount],
            ['cleared', 'Cleared', clearedRenewalCount],
            ['all', 'All visible', unresolvedRenewalCount + resolvedRenewalCount],
          ].map(([value, label, count]) => (
            <button
              key={value}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                renewalView === value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
              onClick={() => setRenewalView(value)}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        <div className="divide-y divide-gray-100">
          {renewalLoading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading renewal requests...</div>
          ) : renewalError ? (
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50">
              <div>
                <p className="text-sm font-semibold text-amber-800">Renewal requests could not be loaded</p>
                <p className="text-xs text-amber-700 mt-1">{renewalError}</p>
              </div>
              <button className="btn btn-secondary btn-sm flex-shrink-0" onClick={fetchRenewalRequests}>
                Try Again
              </button>
            </div>
          ) : visibleRenewalRequests.length === 0 ? (
            <div className="p-8 text-center">
              <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-600">No {renewalView} Face ID renewal requests</p>
            </div>
          ) : visibleRenewalRequests.map(request => (
            <div key={request.id} className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm text-gray-800">
                    {request.intern?.full_name || request.intern_name}
                  </p>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                    request.status === 'pending'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : request.status === 'approved'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : request.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {request.status}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">{request.reason}</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {request.intern?.division_name || 'No division'} · {new Date(request.created_at).toLocaleString()}
                  {request.reviewer_name ? ` · Reviewed by ${request.reviewer_name}` : ''}
                </p>
                {request.review_remarks && (
                  <p className="text-[11px] text-gray-500 mt-1">Review note: {request.review_remarks}</p>
                )}
              </div>
              {request.status === 'pending' && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button className="btn btn-primary btn-sm" onClick={() => openReview(request, 'approve')}>
                    <Check className="w-4 h-4" />
                    Approve
                  </button>
                  <button className="btn btn-secondary btn-sm text-red-600" onClick={() => openReview(request, 'reject')}>
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}
              {request.status === 'approved' && (
                <p className="text-[11px] font-semibold text-blue-600 flex-shrink-0">Waiting for intern update</p>
              )}
              {['rejected', 'completed'].includes(request.status) && !request.dismissed_at && (
                <button
                  className="btn btn-secondary btn-sm text-red-600 flex-shrink-0"
                  onClick={() => setRenewalConfirm({ type: 'visibility', request, dismissed: true })}
                  disabled={renewalActionId === request.id}
                  title="Remove from the active admin queue without deleting its audit record"
                >
                  <Eraser className="w-4 h-4" />
                  {renewalActionId === request.id ? 'Clearing...' : 'Clear'}
                </button>
              )}
              {request.dismissed_at && (
                <div className="flex flex-col items-start lg:items-end gap-1 flex-shrink-0">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setRenewalConfirm({ type: 'visibility', request, dismissed: false })}
                    disabled={renewalActionId === request.id}
                  >
                    <Undo2 className="w-4 h-4" />
                    {renewalActionId === request.id ? 'Restoring...' : 'Restore'}
                  </button>
                  <span className="text-[10px] text-gray-400">
                    Cleared by {request.dismissed_by_name || 'staff'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Archive Tabs */}
      <div className="flex flex-wrap border-b border-gray-200 mb-2 gap-1">
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'active'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
          onClick={() => { setActiveTab('active'); setPage(1); }}
        >
          Active Interns
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'archived'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
          onClick={() => { setActiveTab('archived'); setPage(1); }}
        >
          Archived Interns
        </button>
      </div>

      <DataTable
        columns={columns}
        data={interns}
        loading={loading}
        total={total}
        page={page}
        limit={10}
        onPageChange={setPage}
        searchValue={search}
        onSearchChange={v => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search Here"
        emptyMessage="No interns found"
        actions={tableActions}
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modal === 'create' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'REGISTER NEW PNP-ITMS INTERN' : 'EDIT INTERN DETAILS'}
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary border border-gray-200" onClick={() => setModal(null)}>Cancel</button>
            <button 
              id="save-intern-btn" 
              className="btn btn-primary bg-pnp-900 hover:bg-pnp-950 text-white font-bold" 
              onClick={handleSave} 
              disabled={saving}
            >
              {saving ? 'Registering...' : modal === 'create' ? 'Complete Registration' : 'Save Changes'}
            </button>
          </>
        }
      >
        {formFields}
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={modal === 'delete'} onClose={() => setModal(null)} title="Delete Intern" size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button id="confirm-delete-btn" className="btn btn-danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete'}</button>
          </>
        }
      >
        <p className="text-gray-600">Are you sure you want to delete <strong>{selected?.full_name}</strong>? This action cannot be undone.</p>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={modal === 'reset'} onClose={() => setModal(null)} title="Reset Password" size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button id="confirm-reset-pwd-btn" className="btn btn-primary" onClick={handleResetPwd} disabled={saving}>{saving ? 'Resetting...' : 'Reset'}</button>
          </>
        }
      >
        <p className="text-gray-600 mb-4">Set new password for <strong>{selected?.full_name}</strong></p>
        <div className="form-group">
          <label className="form-label">New Password</label>
          <input type="password" className="form-input" value={resetPwd} onChange={e => setResetPwd(e.target.value)} placeholder="Minimum 8 characters" />
        </div>
      </Modal>

      {/* Archive Modal */}
      <Modal isOpen={modal === 'archive'} onClose={() => setModal(null)} title={selected?.status === 'archived' ? "Unarchive Intern" : "Archive Intern"} size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button id="confirm-archive-btn" className="btn btn-primary" onClick={handleArchiveToggle} disabled={saving}>
              {saving ? 'Processing...' : selected?.status === 'archived' ? 'Unarchive' : 'Archive'}
            </button>
          </>
        }
      >
        <p className="text-gray-600">
          Are you sure you want to {selected?.status === 'archived' ? 'unarchive' : 'archive'} <strong>{selected?.full_name}</strong>?
          {selected?.status !== 'archived' && " Archiving will keep their account and profile history in the database but change their status to Archived."}
        </p>
      </Modal>

      <Modal
        isOpen={!!renewalConfirm}
        onClose={() => {
          if (!clearingResolved && !renewalActionId) setRenewalConfirm(null);
        }}
        title={renewalConfirm?.type === 'clear-resolved'
          ? 'Clear Resolved Requests'
          : renewalConfirm?.dismissed
            ? 'Clear Renewal Request'
            : 'Restore Renewal Request'}
        size="sm"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setRenewalConfirm(null)}
              disabled={clearingResolved || !!renewalActionId}
            >
              Cancel
            </button>
            <button
              className={renewalConfirm?.dismissed === false ? 'btn btn-primary' : 'btn btn-danger'}
              onClick={() => {
                if (renewalConfirm?.type === 'clear-resolved') {
                  handleClearResolved();
                } else if (renewalConfirm?.request) {
                  handleRequestVisibility(renewalConfirm.request, renewalConfirm.dismissed);
                }
              }}
              disabled={clearingResolved || !!renewalActionId}
            >
              {clearingResolved || renewalActionId
                ? 'Processing...'
                : renewalConfirm?.dismissed === false
                  ? 'Restore Request'
                  : renewalConfirm?.type === 'clear-resolved'
                    ? 'Clear Resolved'
                    : 'Clear Request'}
            </button>
          </>
        }
      >
        {renewalConfirm?.type === 'clear-resolved' ? (
          <p className="text-gray-600">
            Clear <strong>{renewalConfirm.count}</strong> resolved renewal request{renewalConfirm.count === 1 ? '' : 's'} from the admin queue?
            The audit records will be retained in the Cleared view and can be restored later.
          </p>
        ) : renewalConfirm?.dismissed ? (
          <p className="text-gray-600">
            Clear the resolved renewal request for <strong>{renewalConfirm.request?.intern?.full_name || renewalConfirm.request?.intern_name}</strong>?
            Its audit record will be retained and can be restored later.
          </p>
        ) : (
          <p className="text-gray-600">
            Restore the renewal request for <strong>{renewalConfirm?.request?.intern?.full_name || renewalConfirm?.request?.intern_name}</strong> to the Resolved view?
          </p>
        )}
      </Modal>

      <Modal
        isOpen={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        title={reviewAction === 'approve' ? 'Approve Face ID Renewal' : 'Reject Face ID Renewal'}
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setReviewTarget(null)}>Cancel</button>
            <button
              className={reviewAction === 'approve' ? 'btn btn-primary' : 'btn btn-danger'}
              onClick={handleReviewRequest}
              disabled={reviewSaving}
            >
              {reviewSaving ? 'Saving...' : reviewAction === 'approve' ? 'Approve Request' : 'Reject Request'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <p className="text-xs font-bold text-gray-700">{reviewTarget?.intern?.full_name || reviewTarget?.intern_name}</p>
            <p className="text-xs text-gray-600 mt-1">{reviewTarget?.reason}</p>
          </div>
          <div className="form-group">
            <label className="form-label">
              {reviewAction === 'approve' ? 'Approval note (optional)' : 'Rejection explanation'}
            </label>
            <textarea
              className="form-input min-h-24 resize-y"
              maxLength={500}
              value={reviewRemarks}
              onChange={event => setReviewRemarks(event.target.value)}
              placeholder={reviewAction === 'approve'
                ? 'Optional instructions for the intern'
                : 'Explain why the request cannot be approved'}
            />
          </div>
          {reviewAction === 'approve' && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-3">
              Approval gives this intern one Face ID update. It is automatically consumed after a successful capture.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        title={`Face Enrollment History${historyTarget ? ` · ${historyTarget.full_name}` : ''}`}
        size="lg"
      >
        {historyLoading ? (
          <p className="text-sm text-gray-500 py-8 text-center">Loading enrollment history...</p>
        ) : enrollmentHistory.length === 0 ? (
          <div className="py-8 text-center">
            <History className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No audited enrollment events yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {enrollmentHistory.map(item => (
              <div key={item.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                    item.enrollment_type === 'initial'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {item.enrollment_type} enrollment
                  </span>
                  <span className="text-[11px] text-gray-500">{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-700 mt-3">{item.renewal_reason}</p>
                <p className="text-[11px] text-gray-500 mt-2">
                  Completed by {item.enrolled_by_name} ({item.enrolled_by_role})
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <FaceRegistrationModal
        isOpen={!!faceEnrollmentTarget}
        intern={faceEnrollmentTarget}
        onClose={() => setFaceEnrollmentTarget(null)}
        onSuccess={async () => {
          await Promise.all([fetchInterns(), fetchRenewalRequests()]);
        }}
      />
    </div>
  );
}
