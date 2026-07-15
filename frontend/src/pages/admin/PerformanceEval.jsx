import { useState, useEffect, useCallback } from 'react';
import { Star, PlusCircle, Edit2, Eye } from 'lucide-react';
import api from '../../utils/api.js';
import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const CRITERIA = [
  { key: 'work_quality', label: 'Work Quality' },
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'teamwork', label: 'Teamwork' },
  { key: 'communication', label: 'Communication' },
  { key: 'initiative', label: 'Initiative' },
];

const INIT_FORM = { intern_id: '', work_quality: 80, punctuality: 80, teamwork: 80, communication: 80, initiative: 80, comments: '' };

function ScoreSlider({ label, value, onChange, disabled }) {
  const color = value >= 90 ? 'text-green-600' : value >= 70 ? 'text-blue-600' : value >= 60 ? 'text-yellow-600' : 'text-red-600';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className={`font-bold ${color}`}>{value}</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-blue-600" disabled={disabled} />
    </div>
  );
}

export default function PerformanceEval({ readOnly = false }) {
  const [evals, setEvals] = useState([]);
  const [interns, setInterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(INIT_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewEval, setViewEval] = useState(null);

  const fetchEvals = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, inRes] = await Promise.all([api.get('/evaluations'), api.get('/interns', { params: { limit: 100 } })]);
      setEvals(evRes.data.evaluations);
      setInterns(inRes.data.interns);
    } catch { toast.error('Failed to load evaluations'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEvals(); }, [fetchEvals]);

  const openCreate = () => { setForm(INIT_FORM); setEditId(null); setModal('form'); };
  const openEdit = (e) => {
    setForm({ intern_id: e.intern_id, work_quality: e.work_quality, punctuality: e.punctuality, teamwork: e.teamwork, communication: e.communication, initiative: e.initiative, comments: e.comments || '' });
    setEditId(e.id);
    setModal('form');
  };

  const openView = (e) => {
    setViewEval(e);
    setModal('view');
  };

  const handleSave = async () => {
    if (!form.intern_id) { toast.error('Select an intern'); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/evaluations/${editId}`, form);
        toast.success('Evaluation updated');
      } else {
        await api.post('/evaluations', form);
        toast.success('Evaluation submitted');
      }
      setModal(null);
      fetchEvals();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const ratingColor = (r) => ({ 'Outstanding': 'badge-approved', 'Very Satisfactory': 'badge-accepted', 'Satisfactory': 'badge-active', 'Fair': 'badge-pending', 'Needs Improvement': 'badge-rejected' }[r] || 'badge-pending');

  const columns = [
    { key: 'full_name', label: 'Intern', render: v => <p className="font-medium text-sm text-gray-800">{v}</p> },
    { key: 'evaluation_date', label: 'Date', render: v => <span className="text-sm text-gray-500">{format(new Date(v), 'MMM dd, yyyy')}</span> },
    { key: 'overall_score', label: 'Score', render: v => <span className="font-bold text-blue-700">{Number(v).toFixed(1)}</span> },
    { key: 'overall_rating', label: 'Rating', render: v => <span className={`badge ${ratingColor(v)}`}>{v}</span> },
    { key: 'evaluator_name', label: 'Evaluator', render: v => <span className="text-xs text-gray-500">{v}</span> },
    ...(readOnly
      ? [{
          key: 'id', label: 'Actions',
          render: (_, row) => (
            <button className="btn btn-ghost btn-sm" onClick={() => openView(row)}>
              <Eye className="w-3.5 h-3.5" /> View
            </button>
          )
        }]
      : [{
          key: 'id', label: 'Actions',
          render: (_, row) => (
            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          )
        }]
    ),
  ];

  const avgScore = form.work_quality + form.punctuality + form.teamwork + form.communication + form.initiative;
  const overallPreview = avgScore / 5;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Performance Evaluations</h1>
          <p className="text-gray-500 text-sm">{evals.length} evaluations on record</p>
        </div>
        {!readOnly && (
          <button id="create-eval-btn" className="btn btn-primary" onClick={openCreate}>
            <PlusCircle className="w-4 h-4" /> Evaluate Intern
          </button>
        )}
        {readOnly && (
          <span className="badge badge-active text-xs px-3 py-1.5">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Only
          </span>
        )}
      </div>

      <DataTable columns={columns} data={evals} loading={loading} total={evals.length} page={1} limit={100} onPageChange={() => {}} emptyMessage="No evaluations yet" />

      {/* Create/Edit Modal — only for admin */}
      {!readOnly && (
        <Modal
          isOpen={modal === 'form'}
          onClose={() => setModal(null)}
          title={editId ? 'Edit Evaluation' : 'New Evaluation'}
          size="md"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button id="save-eval-btn" className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Submit'}</button>
            </>
          }
        >
          <div className="space-y-5">
            {!editId && (
              <div className="form-group">
                <label className="form-label">Intern *</label>
                <select className="form-input form-select" value={form.intern_id} onChange={e => setForm(f => ({ ...f, intern_id: e.target.value }))}>
                  <option value="">Select intern</option>
                  {interns.map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-4">
              {CRITERIA.map(c => (
                <ScoreSlider key={c.key} label={c.label} value={form[c.key]} onChange={v => setForm(f => ({ ...f, [c.key]: v }))} />
              ))}
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-sm text-gray-600">Overall Score Preview</p>
              <p className="text-3xl font-bold text-blue-700">{overallPreview.toFixed(1)}</p>
            </div>
            <div className="form-group">
              <label className="form-label">Comments</label>
              <textarea className="form-input" rows={3} value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} placeholder="General comments about the intern's performance..." />
            </div>
          </div>
        </Modal>
      )}

      {/* View-only Modal — for supervisor */}
      {readOnly && viewEval && (
        <Modal
          isOpen={modal === 'view'}
          onClose={() => { setModal(null); setViewEval(null); }}
          title="Evaluation Details"
          size="md"
          footer={
            <button className="btn btn-secondary" onClick={() => { setModal(null); setViewEval(null); }}>Close</button>
          }
        >
          <div className="space-y-5">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Intern</p>
              <p className="text-sm font-semibold text-gray-800">{viewEval.full_name}</p>
            </div>
            <div className="space-y-4">
              {CRITERIA.map(c => (
                <ScoreSlider key={c.key} label={c.label} value={viewEval[c.key] || 0} onChange={() => {}} disabled />
              ))}
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-sm text-gray-600">Overall Score</p>
              <p className="text-3xl font-bold text-blue-700">{Number(viewEval.overall_score || 0).toFixed(1)}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-sm text-gray-600">Overall Rating</p>
              <p className={`text-lg font-bold badge ${ratingColor(viewEval.overall_rating)} inline-block mt-1`}>{viewEval.overall_rating}</p>
            </div>
            {viewEval.comments && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Comments</p>
                <p className="text-sm text-gray-700">{viewEval.comments}</p>
              </div>
            )}
            <div className="flex gap-4">
              <div className="bg-gray-50 rounded-xl p-4 flex-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Evaluator</p>
                <p className="text-sm font-medium text-gray-800">{viewEval.evaluator_name}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 flex-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Date</p>
                <p className="text-sm font-medium text-gray-800">{viewEval.evaluation_date ? format(new Date(viewEval.evaluation_date), 'MMM dd, yyyy') : '—'}</p>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
