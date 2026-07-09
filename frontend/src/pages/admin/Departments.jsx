import { useState, useEffect } from 'react';
import { Building2, PlusCircle, Edit2, Trash2 } from 'lucide-react';
import api from '../../utils/api.js';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', head_name: '' });
  const [saving, setSaving] = useState(false);

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
            <div key={d.id} className="card p-5 animate-fade-in hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
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
                <span className="badge badge-active">{d.intern_count} interns</span>
              </div>
            </div>
          ))}
        </div>
      )}

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
    </div>
  );
}
