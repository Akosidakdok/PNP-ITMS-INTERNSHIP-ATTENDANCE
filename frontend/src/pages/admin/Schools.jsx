import { useState, useEffect } from 'react';
import { GraduationCap, PlusCircle, Edit2, Trash2, Users } from 'lucide-react';
import api from '../../utils/api.js';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';

export default function Schools() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'form' | 'delete' | 'interns'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '' });
  const [saving, setSaving] = useState(false);

  // Intern States
  const [interns, setInterns] = useState([]);
  const [internsLoading, setInternsLoading] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.get('/schools');
      setSchools(res.data.schools);
    } catch {
      toast.error('Failed to load schools.');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => { setForm({ name: '' }); setSelected(null); setModal('form'); };
  const openEdit = (s) => { setSelected(s); setForm({ name: s.name }); setModal('form'); };
  const openDelete = (s) => { setSelected(s); setModal('delete'); };

  const handleSave = async () => {
    if (!form.name) { toast.error('School name required'); return; }
    setSaving(true);
    try {
      if (selected) await api.put(`/schools/${selected.id}`, form);
      else await api.post('/schools', form);
      toast.success(selected ? 'School updated' : 'School created');
      setModal(null);
      fetch();
    } catch (err) { toast.error(err?.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/schools/${selected.id}`);
      toast.success('School deleted');
      setModal(null);
      fetch();
    } catch (err) { toast.error(err?.response?.data?.error || 'Delete failed'); }
    finally { setSaving(false); }
  };

  // Intern Logic
  const fetchInternsForSchool = async (schoolId) => {
    setInternsLoading(true);
    try {
      const res = await api.get('/interns', { params: { school_id: schoolId, limit: 100 } });
      setInterns(res.data.interns || []);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to load interns for this school.';
      toast.error(msg);
      setInterns([]);
    } finally {
      setInternsLoading(false);
    }
  };

  const openInternsList = (s) => {
    setSelected(s);
    setInterns([]);
    setModal('interns');
    fetchInternsForSchool(s.id);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Schools / Universities</h1>
          <p className="text-gray-500 text-sm">{schools.length} schools</p>
        </div>
        <button id="create-school-btn" className="btn btn-primary w-full sm:w-auto" onClick={openCreate}>
          <PlusCircle className="w-4 h-4" /> Add School
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {schools.map(s => (
            <div
              key={s.id}
              className="card p-5 animate-fade-in hover:shadow-lg transition-shadow cursor-pointer border border-transparent hover:border-blue-100"
              onClick={() => openInternsList(s)}
            >
              <div className="flex items-start justify-between mb-3" onClick={e => e.stopPropagation()}>
                <div className="p-2 rounded-xl bg-blue-50">
                  <GraduationCap className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex gap-1">
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(s)}><Edit2 className="w-3.5 h-3.5" /></button>
                  <button className="btn btn-ghost btn-icon btn-sm text-red-500" onClick={() => openDelete(s)}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <h3 className="font-bold text-gray-800 text-sm mb-3">{s.name}</h3>
              <div className="flex items-center justify-between text-xs">
                <span className="badge badge-active flex items-center gap-1">
                  <Users className="w-3 h-3" /> {s.intern_count} {s.intern_count === 1 ? 'intern' : 'interns'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit School Modal */}
      <Modal
        isOpen={modal === 'form'}
        onClose={() => setModal(null)}
        title={selected ? 'Edit School' : 'Add School'}
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button id="save-school-btn" className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="form-group"><label className="form-label">School Name *</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        </div>
      </Modal>

      {/* Delete School Modal */}
      <Modal isOpen={modal === 'delete'} onClose={() => setModal(null)} title="Delete School" size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button id="confirm-delete-school-btn" className="btn btn-danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete'}</button>
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
          {internsLoading ? (
            <div className="space-y-2 py-4">
              <div className="skeleton h-8 rounded-lg" />
              <div className="skeleton h-8 rounded-lg" />
            </div>
          ) : interns.length === 0 ? (
            <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No interns currently assigned from this school.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-left border-collapse text-xs table-card-mobile">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                    <th className="p-3">Name</th>
                    <th className="p-3">Course</th>
                    <th className="p-3">Required Hours</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {interns.map(i => (
                    <tr key={i.id} className="hover:bg-gray-50/50">
                      <td className="p-3 font-medium text-gray-800" data-label="Name">{i.full_name}</td>
                      <td className="p-3 text-gray-500" data-label="Course">
                        <div className="text-[10px] text-gray-400">{i.course || '—'}</div>
                      </td>
                      <td className="p-3 text-gray-600" data-label="Required Hours">{i.required_hours} hrs</td>
                      <td className="p-3" data-label="Status">
                        <span className={`badge ${i.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                          {i.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
