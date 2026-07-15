import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Edit2, Trash2, Key, Eye } from 'lucide-react';
import api from '../../utils/api.js';
import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';

const INIT_FORM = {
  username: '', password: '', full_name: '', email: '', phone: '', 
  school_id: '',
  course: '', year_level: '4th Year', department_id: '',
  required_hours: 300, start_date: '', end_date: '', status: 'active',
  student_id: '', home_address: '', emergency_name: '', emergency_relation: '', emergency_phone: ''
};

const SENTINEL_NEW_SCHOOL = '__new__';

const generateUsername = (fullName) => {
  const cleanName = (fullName || '').trim().toLowerCase();
  const parts = cleanName.split(/\s+/);
  if (parts.length === 0 || !cleanName) return '';
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastName = parts.slice(1).join('');
  return `${firstName}.${lastName}`.replace(/[^a-z0-9.]/g, '');
};

const generatePassword = (fullName, studentId) => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  const surname = parts[parts.length - 1].toUpperCase().replace(/[^A-Z]/g, '');
  const digits = (studentId || '').replace(/\D/g, '');
  const last4 = digits.slice(-4).padStart(4, '0');
  return `${surname}-${last4}`;
};

export default function InternManagement() {
  const [interns, setInterns] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [schools, setSchools] = useState([]);
  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'delete' | 'reset' | 'view'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(INIT_FORM);
  const [saving, setSaving] = useState(false);
  const [resetPwd, setResetPwd] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');

  const fetchInterns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/interns', { params: { search, page, limit: 10 } });
      setInterns(res.data.interns);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load interns'); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => {
    api.get('/departments')
      .then(r => setDepartments(r.data.departments))
      .catch(() => toast.error('Could not load department list.'));
    api.get('/schools')
      .then(r => setSchools(r.data.schools))
      .catch(() => toast.error('Could not load school list.'));
  }, []);

  useEffect(() => { fetchInterns(); }, [fetchInterns]);

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

  const handleSave = async () => {
    if (!form.full_name || !form.full_name.trim()) {
      toast.error('Full Name is required');
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
    { key: 'department_name', label: 'Department', render: v => v || <span className="text-gray-400">—</span> },
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
      render: (_, row) => (
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-icon btn-sm" data-tooltip="Edit" onClick={() => openEdit(row)}><Edit2 className="w-3.5 h-3.5" /></button>
          <button className="btn btn-ghost btn-icon btn-sm" data-tooltip="Reset Password" onClick={() => openReset(row)}><Key className="w-3.5 h-3.5" /></button>
          <button className="btn btn-ghost btn-icon btn-sm text-red-500" data-tooltip="Delete" onClick={() => openDelete(row)}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      )
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
          <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-2 gap-4">
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Full Name <span className="text-red-500">*</span></label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. Juan De La Cruz"
              value={form.full_name}
              onChange={e => {
                const val = e.target.value;
                setForm(f => {
                  const updated = { ...f, full_name: val };
                  if (modal === 'create') {
                    updated.username = generateUsername(val);
                    updated.password = generatePassword(val, f.student_id);
                  }
                  return updated;
                });
              }}
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
                    updated.password = generatePassword(f.full_name, val);
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
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. BS Information Technology"
              value={form.course || ''}
              onChange={e => setForm(f => ({ ...f, course: e.target.value }))}
            />
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
        <div className="grid grid-cols-3 gap-4">
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
        <div className="grid grid-cols-2 gap-4">
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Department Assignment</label>
            <select
              className="form-input form-select bg-gray-50/50"
              value={form.department_id || ''}
              onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
            >
              <option value="">Select department</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
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
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Internship End Date</label>
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
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Intern Management</h1>
          <p className="text-gray-500 text-sm">{total} total interns</p>
        </div>
        <button id="create-intern-btn" className="btn btn-primary" onClick={openCreate}>
          <UserPlus className="w-4 h-4" /> Add Intern
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
        searchPlaceholder="Search by name, email, username..."
        emptyMessage="No interns found"
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
    </div>
  );
}
