import { useState, useEffect } from 'react';
import { Building2, PlusCircle, Edit2, Trash2, UserPlus, Users } from 'lucide-react';
import api from '../../utils/api.js';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { AVAILABLE_COURSES } from '../../utils/constants.js';

const INIT_INTERN_FORM = {
  username: '',
  password: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  name_suffix: '',
  email: '',
  phone: '',
  school: '',
  course: '',
  year_level: '4th Year',
  required_hours: 300,
  start_date: '',
  end_date: '',
  status: 'active',
  student_id: '',
  home_address: '',
  emergency_name: '',
  emergency_relation: '',
  emergency_phone: ''
};

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

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'form' | 'delete' | 'interns' | 'intern-form' | 'intern-delete'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', head_name: '' });
  const [saving, setSaving] = useState(false);

  // Intern States
  const [interns, setInterns] = useState([]);
  const [internsLoading, setInternsLoading] = useState(false);
  const [selectedIntern, setSelectedIntern] = useState(null);
  const [internForm, setInternForm] = useState(INIT_INTERN_FORM);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.get('/departments');
      setDepartments(res.data.departments);
    } catch {
      toast.error('Failed to load departments.');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => { setForm({ name: '', description: '', head_name: '' }); setSelected(null); setModal('form'); };
  const openEdit = (d) => { setSelected(d); setForm({ name: d.name, description: d.description || '', head_name: d.head_name || '' }); setModal('form'); };
  const openDelete = (d) => { setSelected(d); setModal('delete'); };

  const handleSave = async () => {
    if (!form.name) { toast.error('Department name required'); return; }
    setSaving(true);
    try {
      if (selected) await api.put(`/departments/${selected.id}`, form);
      else await api.post('/departments', form);
      toast.success(selected ? 'Department updated' : 'Department created');
      setModal(null);
      fetch();
    } catch (err) { toast.error(err?.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/departments/${selected.id}`);
      toast.success('Department deleted');
      setModal(null);
      fetch();
    } catch (err) { toast.error(err?.response?.data?.error || 'Delete failed'); }
    finally { setSaving(false); }
  };

  // Intern Logic
  const fetchInternsForDept = async (deptId) => {
    setInternsLoading(true);
    try {
      const res = await api.get('/interns', { params: { department_id: deptId, limit: 100 } });
      setInterns(res.data.interns);
    } catch {
      toast.error('Failed to load interns.');
    } finally {
      setInternsLoading(false);
    }
  };

  const openInternsList = (d) => {
    setSelected(d);
    setInterns([]);
    setModal('interns');
    fetchInternsForDept(d.id);
  };

  const openCreateIntern = () => {
    setInternForm({
      ...INIT_INTERN_FORM,
      department_id: selected.id
    });
    setSelectedIntern(null);
    setModal('intern-form');
  };

  const openEditIntern = (i) => {
    setSelectedIntern(i);
    setInternForm({
      ...i,
      password: '',
      student_id: i.student_id || '',
      home_address: i.home_address || '',
      emergency_name: i.emergency_name || '',
      emergency_relation: i.emergency_relation || '',
      emergency_phone: i.emergency_phone || ''
    });
    setModal('intern-form');
  };

  const openDeleteIntern = (i) => {
    setSelectedIntern(i);
    setModal('intern-delete');
  };



  const handleInternSave = async () => {
    if (!internForm.first_name || !internForm.first_name.trim() || !internForm.last_name || !internForm.last_name.trim()) {
      toast.error('First Name and Last Name are required');
      return;
    }
    if (!selectedIntern) {
      if (!internForm.username || !internForm.username.trim()) {
        toast.error('Username is required');
        return;
      }
      if (!internForm.password || !internForm.password.trim()) {
        toast.error('Initial Password is required');
        return;
      }
      if (!internForm.email || !internForm.email.trim()) {
        toast.error('Email Address is required');
        return;
      }
    }

    setSaving(true);
    try {
      if (!selectedIntern) {
        await api.post('/interns', internForm);
        toast.success('Intern created successfully');
      } else {
        await api.put(`/interns/${selectedIntern.id}`, internForm);
        toast.success('Intern updated successfully');
      }
      setModal('interns');
      fetchInternsForDept(selected.id);
      fetch(); // Refresh department counts
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleInternDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/interns/${selectedIntern.id}`);
      toast.success('Intern deleted');
      setModal('interns');
      fetchInternsForDept(selected.id);
      fetch(); // Refresh department counts
    } catch {
      toast.error('Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Departments</h1>
          <p className="text-gray-500 text-sm">{departments.length} departments</p>
        </div>
        <button id="create-dept-btn" className="btn btn-primary" onClick={openCreate}>
          <PlusCircle className="w-4 h-4" /> Add Department
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map(d => (
            <div
              key={d.id}
              className="card p-5 animate-fade-in hover:shadow-lg transition-shadow cursor-pointer border border-transparent hover:border-blue-100"
              onClick={() => openInternsList(d)}
            >
              <div className="flex items-start justify-between mb-3" onClick={e => e.stopPropagation()}>
                <div className="p-2 rounded-xl bg-blue-50">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex gap-1">
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(d)}><Edit2 className="w-3.5 h-3.5" /></button>
                  <button className="btn btn-ghost btn-icon btn-sm text-red-500" onClick={() => openDelete(d)}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <h3 className="font-bold text-gray-800 text-sm mb-1">{d.name}</h3>
              <p className="text-xs text-gray-500 mb-3 line-clamp-2">{d.description || 'No description'}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{d.head_name || 'No head assigned'}</span>
                <span className="badge badge-active flex items-center gap-1">
                  <Users className="w-3 h-3" /> {d.intern_count} {d.intern_count === 1 ? 'intern' : 'interns'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Department Modal */}
      <Modal
        isOpen={modal === 'form'}
        onClose={() => setModal(null)}
        title={selected ? 'Edit Department' : 'Add Department'}
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button id="save-dept-btn" className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="form-group"><label className="form-label">Department Name *</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Department Head</label><input className="form-input" value={form.head_name} onChange={e => setForm(f => ({ ...f, head_name: e.target.value }))} /></div>
        </div>
      </Modal>

      {/* Delete Department Modal */}
      <Modal isOpen={modal === 'delete'} onClose={() => setModal(null)} title="Delete Department" size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button id="confirm-delete-dept-btn" className="btn btn-danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete'}</button>
          </>
        }
      >
        <p className="text-gray-600">Delete <strong>{selected?.name}</strong>? This cannot be undone if no interns are assigned.</p>
      </Modal>

      {/* Interns List Modal */}
      <Modal
        isOpen={modal === 'interns'}
        onClose={() => setModal(null)}
        title={`Interns assigned to ${selected?.name || ''}`}
        size="lg"
        footer={<button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button>}
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">Manage all interns working in this department.</p>
            <button className="btn btn-primary btn-sm" onClick={openCreateIntern}>
              <UserPlus className="w-3.5 h-3.5" /> Add Intern
            </button>
          </div>

          {internsLoading ? (
            <div className="space-y-2 py-4">
              <div className="skeleton h-8 rounded-lg" />
              <div className="skeleton h-8 rounded-lg" />
            </div>
          ) : interns.length === 0 ? (
            <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No interns currently assigned to this department.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                    <th className="p-3">Name</th>
                    <th className="p-3">School / Course</th>
                    <th className="p-3">Required Hours</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {interns.map(i => (
                    <tr key={i.id} className="hover:bg-gray-50/50">
                      <td className="p-3 font-medium text-gray-800">{i.full_name}</td>
                      <td className="p-3 text-gray-500">
                        <div>{i.school || '—'}</div>
                        <div className="text-[10px] text-gray-400">{i.course || '—'}</div>
                      </td>
                      <td className="p-3 text-gray-600">{i.required_hours} hrs</td>
                      <td className="p-3">
                        <span className={`badge ${i.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                          {i.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditIntern(i)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm text-red-500" onClick={() => openDeleteIntern(i)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Add/Edit Intern Modal */}
      <Modal
        isOpen={modal === 'intern-form'}
        onClose={() => setModal('interns')}
        title={selectedIntern ? `Edit ${selectedIntern.full_name}` : `Add Intern to ${selected?.name}`}
        size="md"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal('interns')}>Back</button>
            <button className="btn btn-primary" onClick={handleInternSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Intern'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1 p-0.5">
          {/* Account Details */}
          <div className="col-span-1 md:col-span-2 border-b border-gray-100 pb-2">
            <h4 className="font-bold text-gray-700 text-xs">Account Credentials</h4>
          </div>

          <div className="form-group">
            <label className="form-label">First Name *</label>
            <input
              className="form-input"
              value={internForm.first_name || ''}
              onChange={e => {
                const val = e.target.value;
                setInternForm(f => {
                  const updated = { ...f, first_name: val };
                  if (!selectedIntern) updated.username = generateUsername(val, f.last_name);
                  return updated;
                });
              }}
              placeholder="e.g. Juan"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Middle Name</label>
            <input
              className="form-input"
              value={internForm.middle_name || ''}
              onChange={e => setInternForm(f => ({ ...f, middle_name: e.target.value }))}
              placeholder="e.g. Santos"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Last Name *</label>
            <input
              className="form-input"
              value={internForm.last_name || ''}
              onChange={e => {
                const val = e.target.value;
                setInternForm(f => {
                  const updated = { ...f, last_name: val };
                  if (!selectedIntern) {
                    updated.username = generateUsername(f.first_name, val);
                    updated.password = generatePassword(val, f.student_id);
                  }
                  return updated;
                });
              }}
              placeholder="e.g. De La Cruz"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Suffix</label>
            <input
              className="form-input"
              value={internForm.name_suffix || ''}
              onChange={e => setInternForm(f => ({ ...f, name_suffix: e.target.value }))}
              placeholder="e.g. Jr., III"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Student ID</label>
            <input
              className="form-input"
              value={internForm.student_id}
              onChange={e => {
                const val = e.target.value;
                setInternForm(f => {
                  const updated = { ...f, student_id: val };
                  if (!selectedIntern) updated.password = generatePassword(f.last_name, val);
                  return updated;
                });
              }}
              placeholder="e.g. 2022-10432"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Username *</label>
            <input
              className="form-input"
              value={internForm.username}
              onChange={e => setInternForm(f => ({ ...f, username: e.target.value }))}
              disabled={!!selectedIntern}
              placeholder="Auto-generated"
            />
          </div>

          {!selectedIntern && (
            <div className="form-group">
              <label className="form-label">Password *</label>
              <input
                className="form-input"
                type="text"
                value={internForm.password}
                onChange={e => setInternForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Auto-generated"
              />
            </div>
          )}

          <div className="form-group col-span-1 md:col-span-2">
            <label className="form-label">Email Address *</label>
            <input
              className="form-input"
              type="email"
              value={internForm.email}
              onChange={e => setInternForm(f => ({ ...f, email: e.target.value }))}
              placeholder="juan.delacruz@school.edu.ph"
            />
          </div>

          {/* Education Details */}
          <div className="col-span-1 md:col-span-2 border-b border-gray-100 pb-2 pt-2">
            <h4 className="font-bold text-gray-700 text-xs">Education details</h4>
          </div>

          <div className="form-group">
            <label className="form-label">School / University</label>
            <input
              className="form-input"
              value={internForm.school}
              onChange={e => setInternForm(f => ({ ...f, school: e.target.value }))}
              placeholder="e.g. PLV"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Course / Program</label>
            <select
              className="form-input form-select"
              value={internForm.course}
              onChange={e => setInternForm(f => ({ ...f, course: e.target.value }))}
            >
              <option value="">Select course</option>
              {AVAILABLE_COURSES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Internship parameters */}
          <div className="col-span-1 md:col-span-2 border-b border-gray-100 pb-2 pt-2">
            <h4 className="font-bold text-gray-700 text-xs">Internship parameters</h4>
          </div>

          <div className="form-group">
            <label className="form-label">Required Hours</label>
            <input
              className="form-input"
              type="number"
              value={internForm.required_hours}
              onChange={e => setInternForm(f => ({ ...f, required_hours: Number(e.target.value) }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              className="form-input form-select"
              value={internForm.status}
              onChange={e => setInternForm(f => ({ ...f, status: e.target.value }))}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Delete Intern Modal */}
      <Modal
        isOpen={modal === 'intern-delete'}
        onClose={() => setModal('interns')}
        title="Delete Intern"
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal('interns')}>Cancel</button>
            <button className="btn btn-danger" onClick={handleInternDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-gray-600">Delete <strong>{selectedIntern?.full_name}</strong> permanently? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
