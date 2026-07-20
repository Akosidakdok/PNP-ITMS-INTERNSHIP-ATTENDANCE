import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Edit2, Trash2, Key } from 'lucide-react';
import api from '../../utils/api.js';
import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';

const INIT_FORM = {
  username: '', password: '', full_name: '', email: '', phone: '',
  department_id: '', status: 'active', home_address: ''
};

const generateUsername = (fullName) => {
  const cleanName = (fullName || '').trim().toLowerCase();
  const parts = cleanName.split(/\s+/);
  if (parts.length === 0 || !cleanName) return '';
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastName = parts.slice(1).join('');
  return `${firstName}.${lastName}`.replace(/[^a-z0-9.]/g, '');
};

const generatePassword = (fullName) => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  const surname = parts[parts.length - 1].toUpperCase().replace(/[^A-Z]/g, '');
  return `${surname}-1234`; // simplified since there is no student id
};

export default function SupervisorManagement() {
  const [supervisors, setSupervisors] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'delete' | 'reset'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(INIT_FORM);
  const [saving, setSaving] = useState(false);
  const [resetPwd, setResetPwd] = useState('');

  const fetchSupervisors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/supervisors', { params: { search, page, limit: 10 } });
      setSupervisors(res.data.supervisors);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load supervisors'); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => {
    api.get('/departments')
      .then(r => setDepartments(r.data.departments))
      .catch(() => toast.error('Could not load department list.'));
  }, []);

  useEffect(() => { fetchSupervisors(); }, [fetchSupervisors]);

  const openCreate = () => { setForm(INIT_FORM); setModal('create'); };
  const openEdit = (s) => {
    setSelected(s);
    setForm({
      ...s,
      password: '',
      home_address: s.home_address || '',
      phone: s.phone || '',
    });
    setModal('edit');
  };
  const openDelete = (s) => { setSelected(s); setModal('delete'); };
  const openReset = (s) => { setSelected(s); setResetPwd(''); setModal('reset'); };

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
      if (modal === 'create') {
        await api.post('/supervisors', form);
        toast.success('Supervisor created successfully');
      } else {
        await api.put(`/supervisors/${selected.id}`, form);
        toast.success('Supervisor updated successfully');
      }
      setModal(null);
      fetchSupervisors();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/supervisors/${selected.id}`);
      toast.success('Supervisor deleted');
      setModal(null);
      fetchSupervisors();
    } catch { toast.error('Delete failed'); }
    finally { setSaving(false); }
  };

  const handleResetPwd = async () => {
    if (resetPwd.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      await api.post(`/supervisors/${selected.id}/reset-password`, { new_password: resetPwd });
      toast.success('Password reset successfully');
      setModal(null);
    } catch { toast.error('Reset failed'); }
    finally { setSaving(false); }
  };

  const columns = [
    {
      key: 'full_name', label: 'Supervisor Name',
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
    { key: 'email', label: 'Email', render: v => <span className="text-xs text-gray-600">{v || '—'}</span> },
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
                    updated.password = generatePassword(val);
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
          <div className="form-group sm:col-span-2">
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

      {/* 3. Deployment Information */}
      <div className="space-y-3 pt-3 border-t border-gray-100">
        <p className="text-[10px] uppercase font-extrabold tracking-widest text-blue-500">
          Deployment Information
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          {modal === 'edit' && (
            <div className="form-group">
              <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Status</label>
              <select
                className="form-input form-select bg-gray-50/50"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Supervisor Management</h1>
          <p className="text-gray-500 text-sm">{total} total supervisors</p>
        </div>
        <button id="create-supervisor-btn" className="btn btn-primary w-full sm:w-auto" onClick={openCreate}>
          <UserPlus className="w-4 h-4" /> Add Supervisor
        </button>
      </div>

      <DataTable
        columns={columns}
        data={supervisors}
        loading={loading}
        total={total}
        page={page}
        limit={10}
        onPageChange={setPage}
        searchValue={search}
        onSearchChange={v => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search by name, email, username..."
        emptyMessage="No supervisors found"
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modal === 'create' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'REGISTER NEW SUPERVISOR' : 'EDIT SUPERVISOR DETAILS'}
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary border border-gray-200" onClick={() => setModal(null)}>Cancel</button>
            <button 
              id="save-supervisor-btn" 
              className="btn btn-primary bg-pnp-900 hover:bg-pnp-950 text-white font-bold" 
              onClick={handleSave} 
              disabled={saving}
            >
              {saving ? 'Saving...' : modal === 'create' ? 'Complete Registration' : 'Save Changes'}
            </button>
          </>
        }
      >
        {formFields}
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={modal === 'delete'} onClose={() => setModal(null)} title="Delete Supervisor" size="sm"
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
