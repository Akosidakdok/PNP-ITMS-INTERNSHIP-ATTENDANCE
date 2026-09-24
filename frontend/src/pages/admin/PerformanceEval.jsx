import { useState, useEffect, useCallback } from 'react';
import {
  PlusCircle, Edit2, Eye, Lock, Unlock,
  Archive, ArchiveRestore, Trash2, AlertTriangle,
} from 'lucide-react';
import api from '../../utils/api.js';
import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext.jsx';

const PROJECT_CRITERIA = [
  { key: 'project_quality', label: 'Quality of Work', weight: 20 },
  { key: 'project_timeliness', label: 'Timeliness / Meeting Deadlines', weight: 10 },
  { key: 'project_problem_solving', label: 'Problem Solving & Creativity', weight: 10 },
  { key: 'project_initiative', label: 'Initiative & Proactivity', weight: 10 },
  { key: 'project_accuracy', label: 'Accuracy & Attention to Detail', weight: 5 },
  { key: 'project_documentation', label: 'Documentation', weight: 5 },
];

const PERFORMANCE_CRITERIA = [
  { key: 'performance_punctuality', label: 'Work Discipline & Punctuality', weight: 10 },
  { key: 'performance_attendance', label: 'Attendance & Reliability', weight: 10 },
  { key: 'performance_teamwork', label: 'Teamwork & Collaboration', weight: 5 },
  { key: 'performance_learning', label: 'Learning & Adaptability', weight: 5 },
  { key: 'performance_initiative', label: 'Initiative & Motivation', weight: 5 },
  { key: 'performance_communication', label: 'Communication Skills', weight: 5 },
];

const INIT_FORM = {
  intern_id: '',
  project_quality: 80,
  project_timeliness: 80,
  project_problem_solving: 80,
  project_initiative: 80,
  project_accuracy: 80,
  project_documentation: 80,
  performance_punctuality: 80,
  performance_attendance: 80,
  performance_teamwork: 80,
  performance_learning: 80,
  performance_initiative: 80,
  performance_communication: 80,
  project_comments: '',
  performance_comments: '',
  is_visible: false
};

function getRatingAndLetter(score) {
  const rounded = Math.round(score);
  if (rounded >= 96) return { rating: 'Outstanding', letter: 'A+', interpretation: 'Exceptional performance in both project and duties' };
  if (rounded >= 91) return { rating: 'Very Satisfactory', letter: 'A', interpretation: 'Exceeds expectations' };
  if (rounded >= 86) return { rating: 'Satisfactory', letter: 'B+', interpretation: 'Meets expectations with good performance' };
  if (rounded >= 81) return { rating: 'Fair', letter: 'B', interpretation: 'Acceptable but needs improvement' };
  if (rounded >= 75) return { rating: 'Needs Improvement', letter: 'C', interpretation: 'Minimum passing performance' };
  return { rating: 'Poor', letter: 'F', interpretation: 'Failed / Unsatisfactory' };
}

function parseEvaluationDetails(ev) {
  if (!ev) return null;
  let details = {};
  try {
    details = JSON.parse(ev.comments);
  } catch {
    details = {
      project_scores: {
        project_quality: ev.work_quality || 80,
        project_timeliness: ev.punctuality || 80,
        project_problem_solving: ev.initiative || 80,
        project_initiative: ev.initiative || 80,
        project_accuracy: ev.work_quality || 80,
        project_documentation: ev.work_quality || 80,
      },
      performance_scores: {
        performance_punctuality: ev.punctuality || 80,
        performance_attendance: ev.punctuality || 80,
        performance_teamwork: ev.teamwork || 80,
        performance_learning: ev.teamwork || 80,
        performance_initiative: ev.initiative || 80,
        performance_communication: ev.communication || 80,
      },
      project_comments: ev.comments || '',
      performance_comments: '',
      is_visible: true
    };
  }
  return details;
}

export default function PerformanceEval() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const [evals, setEvals] = useState([]);
  const [interns, setInterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'form' | 'view'
  const [form, setForm] = useState(INIT_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewEval, setViewEval] = useState(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [lifecycleTarget, setLifecycleTarget] = useState(null);
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [lifecycleSaving, setLifecycleSaving] = useState(false);

  const fetchEvals = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, inRes] = await Promise.all([
        api.get('/evaluations', { params: { include_archived: includeArchived } }),
        api.get('/interns', { params: { limit: 100 } })
      ]);
      setEvals(evRes.data.evaluations);
      setInterns(inRes.data.interns);
    } catch {
      toast.error('Failed to load evaluations');
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    fetchEvals();
  }, [fetchEvals]);

  const openCreate = () => {
    setForm(INIT_FORM);
    setEditId(null);
    setModal('form');
  };

  const openEdit = (e) => {
    const details = parseEvaluationDetails(e);
    setForm({
      intern_id: e.intern_id,
      project_quality: details.project_scores?.project_quality ?? 80,
      project_timeliness: details.project_scores?.project_timeliness ?? 80,
      project_problem_solving: details.project_scores?.project_problem_solving ?? 80,
      project_initiative: details.project_scores?.project_initiative ?? 80,
      project_accuracy: details.project_scores?.project_accuracy ?? 80,
      project_documentation: details.project_scores?.project_documentation ?? 80,
      performance_punctuality: details.performance_scores?.performance_punctuality ?? 80,
      performance_attendance: details.performance_scores?.performance_attendance ?? 80,
      performance_teamwork: details.performance_scores?.performance_teamwork ?? 80,
      performance_learning: details.performance_scores?.performance_learning ?? 80,
      performance_initiative: details.performance_scores?.performance_initiative ?? 80,
      performance_communication: details.performance_scores?.performance_communication ?? 80,
      project_comments: details.project_comments || '',
      performance_comments: details.performance_comments || '',
      is_visible: details.is_visible ?? false
    });
    setEditId(e.id);
    setModal('form');
  };

  const openView = (e) => {
    setViewEval(e);
    setModal('view');
  };

  const openLifecycleConfirmation = (row, action) => {
    setLifecycleTarget({ row, action });
    setLifecycleReason('');
  };

  const handleLifecycleAction = async () => {
    if (!lifecycleTarget) return;
    const { row, action } = lifecycleTarget;
    const isArchiving = action === 'archive';
    const reason = lifecycleReason.trim();

    if (isArchiving && !reason) {
      toast.error('A reason is required when archiving an evaluation');
      return;
    }

    setLifecycleSaving(true);
    try {
      await api.patch(`/evaluations/${row.id}/archive`, {
        archived: isArchiving,
        reason,
      });
      toast.success(isArchiving ? 'Evaluation archived' : 'Evaluation restored');
      setLifecycleTarget(null);
      setLifecycleReason('');
      fetchEvals();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update evaluation status');
    } finally {
      setLifecycleSaving(false);
    }
  };

  const openDeleteConfirmation = (row) => {
    setDeleteTarget(row);
    setDeleteConfirmation('');
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteConfirmation !== 'DELETE') return;

    setLifecycleSaving(true);
    try {
      await api.delete(`/evaluations/${deleteTarget.id}`);
      toast.success('Evaluation permanently deleted');
      setDeleteTarget(null);
      setDeleteConfirmation('');
      fetchEvals();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete evaluation');
    } finally {
      setLifecycleSaving(false);
    }
  };

  const handleToggleVisibility = async (row) => {
    const details = parseEvaluationDetails(row);
    const updatedVisible = !details.is_visible;
    details.is_visible = updatedVisible;

    try {
      await api.put(`/evaluations/${row.id}`, { comments: JSON.stringify(details) });
      toast.success(updatedVisible ? 'Evaluation opened to intern' : 'Evaluation locked from intern');
      fetchEvals();
    } catch {
      toast.error('Failed to toggle visibility');
    }
  };

  const handleSave = async () => {
    if (!form.intern_id) {
      toast.error('Select an intern');
      return;
    }

    const projectScore = (
      (form.project_quality * 0.20) +
      (form.project_timeliness * 0.10) +
      (form.project_problem_solving * 0.10) +
      (form.project_initiative * 0.10) +
      (form.project_accuracy * 0.05) +
      (form.project_documentation * 0.05)
    );

    const performanceScore = (
      (form.performance_punctuality * 0.10) +
      (form.performance_attendance * 0.10) +
      (form.performance_teamwork * 0.05) +
      (form.performance_learning * 0.05) +
      (form.performance_initiative * 0.05) +
      (form.performance_communication * 0.05)
    );

    const overallScore = projectScore + performanceScore;
    const { rating } = getRatingAndLetter(overallScore);

    const serializedDetails = JSON.stringify({
      project_scores: {
        project_quality: form.project_quality,
        project_timeliness: form.project_timeliness,
        project_problem_solving: form.project_problem_solving,
        project_initiative: form.project_initiative,
        project_accuracy: form.project_accuracy,
        project_documentation: form.project_documentation,
      },
      performance_scores: {
        performance_punctuality: form.performance_punctuality,
        performance_attendance: form.performance_attendance,
        performance_teamwork: form.performance_teamwork,
        performance_learning: form.performance_learning,
        performance_initiative: form.performance_initiative,
        performance_communication: form.performance_communication,
      },
      project_comments: form.project_comments,
      performance_comments: form.performance_comments,
      is_visible: form.is_visible
    });

    const payload = {
      overall_score: overallScore,
      overall_rating: rating,
      comments: serializedDetails,
      work_quality: Math.round(form.project_quality),
      punctuality: Math.round(form.performance_punctuality),
      teamwork: Math.round(form.performance_teamwork),
      communication: Math.round(form.performance_communication),
      initiative: Math.round(form.project_initiative)
    };
    if (!editId) payload.intern_id = form.intern_id;

    setSaving(true);
    try {
      if (editId) {
        await api.put(`/evaluations/${editId}`, payload);
        toast.success('Evaluation updated');
      } else {
        await api.post('/evaluations', payload);
        toast.success('Evaluation submitted');
      }
      setModal(null);
      fetchEvals();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const ratingColor = (r) => {
    return {
      'Outstanding': 'badge-approved',
      'Very Satisfactory': 'badge-accepted',
      'Satisfactory': 'badge-active',
      'Fair': 'badge-pending',
      'Needs Improvement': 'badge-rejected',
      'Poor': 'badge-rejected'
    }[r] || 'badge-pending';
  };

  const selectedInternDetails = interns.find(i => i.id === Number(form.intern_id));

  // Compute live scores for form preview
  const projectScoreLive = (
    (form.project_quality * 0.20) +
    (form.project_timeliness * 0.10) +
    (form.project_problem_solving * 0.10) +
    (form.project_initiative * 0.10) +
    (form.project_accuracy * 0.05) +
    (form.project_documentation * 0.05)
  );

  const performanceScoreLive = (
    (form.performance_punctuality * 0.10) +
    (form.performance_attendance * 0.10) +
    (form.performance_teamwork * 0.05) +
    (form.performance_learning * 0.05) +
    (form.performance_initiative * 0.05) +
    (form.performance_communication * 0.05)
  );

  const finalGradeLive = projectScoreLive + performanceScoreLive;
  const ratingDetailsLive = getRatingAndLetter(finalGradeLive);

  const columns = [
    {
      key: 'full_name',
      label: 'Intern',
      render: (v, row) => (
        <div>
          <p className="font-medium text-sm text-gray-800">{v}</p>
          {row.archived_at && (
            <span className="badge bg-slate-100 text-slate-600 border border-slate-200 mt-1">
              Archived
            </span>
          )}
        </div>
      ),
    },
    { key: 'evaluation_date', label: 'Date', render: v => <span className="text-sm text-gray-500">{format(new Date(v), 'MMM dd, yyyy')}</span> },
    { key: 'overall_score', label: 'Final Grade', render: v => <span className="font-bold text-blue-700">{Number(v).toFixed(2)}%</span> },
    {
      key: 'overall_rating',
      label: 'Rating',
      render: (v, row) => {
        const ratingInfo = getRatingAndLetter(row.overall_score);
        return (
          <div className="flex flex-col gap-0.5">
            <span className={`badge ${ratingColor(v)} w-fit`}>{v}</span>
            <span className="text-[10px] text-gray-400 font-semibold">Letter: {ratingInfo.letter}</span>
          </div>
        );
      }
    },
    {
      key: 'comments',
      label: 'Intern Visibility',
      render: (_, row) => {
        if (row.archived_at) {
          return <span className="text-xs text-gray-400">Unavailable while archived</span>;
        }
        const details = parseEvaluationDetails(row);
        const isVisible = !!details.is_visible;
        if (!isAdmin) {
          return (
            <span className={`text-xs font-semibold ${isVisible ? 'text-green-700' : 'text-amber-700'}`}>
              {isVisible ? 'Open' : 'Locked'}
            </span>
          );
        }
        return (
          <button
            onClick={() => handleToggleVisibility(row)}
            className={`btn btn-sm flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-xs font-semibold border ${
              isVisible
                ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
            }`}
          >
            {isVisible ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {isVisible ? 'Open (Click to Lock)' : 'Locked (Click to Open)'}
          </button>
        );
      }
    },
    { key: 'evaluator_name', label: 'Evaluator', render: v => <span className="text-xs text-gray-500">{v}</span> },
    {
      key: 'id',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-sm" onClick={() => openView(row)}>
            <Eye className="w-3.5 h-3.5" /> View
          </button>
          {isAdmin && !row.archived_at && (
            <button className="btn btn-ghost btn-sm text-blue-600" onClick={() => openEdit(row)}>
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {isAdmin && (
            <>
              <button
                className={`btn btn-ghost btn-sm ${row.archived_at ? 'text-emerald-600' : 'text-amber-600'}`}
                onClick={() => openLifecycleConfirmation(row, row.archived_at ? 'restore' : 'archive')}
              >
                {row.archived_at
                  ? <ArchiveRestore className="w-3.5 h-3.5" />
                  : <Archive className="w-3.5 h-3.5" />}
                {row.archived_at ? 'Restore' : 'Archive'}
              </button>
              <button className="btn btn-ghost btn-sm text-red-600" onClick={() => openDeleteConfirmation(row)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Performance Evaluations</h1>
          <p className="text-gray-500 text-sm">{evals.length} evaluations on record</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {isAdmin && (
            <button
              type="button"
              className="btn btn-secondary w-full sm:w-auto"
              onClick={() => setIncludeArchived(value => !value)}
            >
              {includeArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              {includeArchived ? 'Hide Archived' : 'Show Archived'}
            </button>
          )}
          <button id="create-eval-btn" className="btn btn-primary w-full sm:w-auto" onClick={openCreate}>
            <PlusCircle className="w-4 h-4" /> Evaluate Intern
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <DataTable columns={columns} data={evals} loading={loading} total={evals.length} page={1} limit={100} onPageChange={() => {}} emptyMessage="No evaluations yet" />
      </div>

      {/* Add / Edit Evaluation Modal (Admins can do both, Supervisors can only add/create) */}
      {modal === 'form' && (
        <Modal
          isOpen={modal === 'form'}
          onClose={() => setModal(null)}
          title={editId ? 'Edit Evaluation' : 'New Performance Evaluation'}
          size="lg"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button id="save-eval-btn" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Submit Evaluation'}
              </button>
            </>
          }
        >
          <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2">
            {/* Header info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="form-group">
                <label className="form-label">Trainee Name *</label>
                {editId ? (
                  <input
                    className="form-input bg-gray-100"
                    value={evals.find(e => e.id === editId)?.full_name || ''}
                    disabled
                  />
                ) : (
                  <select
                    className="form-input form-select font-medium"
                    value={form.intern_id}
                    onChange={e => setForm(f => ({ ...f, intern_id: e.target.value }))}
                  >
                    <option value="">Select intern</option>
                    {interns.map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Evaluator/Supervisor</label>
                <input className="form-input bg-gray-100 font-medium" value={user?.full_name || user?.username || ''} disabled />
              </div>

              {selectedInternDetails && (
                <>
                  <div className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">Course/Program:</span> {selectedInternDetails.course || '—'}
                  </div>
                  <div className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">Division:</span> {selectedInternDetails.division_name || '—'}
                  </div>
                  <div className="text-xs text-gray-500 md:col-span-2">
                    <span className="font-semibold text-gray-700">OJT Period:</span> {selectedInternDetails.start_date ? format(new Date(selectedInternDetails.start_date), 'MMM dd, yyyy') : '—'} to {selectedInternDetails.end_date ? format(new Date(selectedInternDetails.end_date), 'MMM dd, yyyy') : '—'}
                  </div>
                </>
              )}
            </div>

            {/* A. Project Evaluation Table */}
            <div>
              <h3 className="font-bold text-gray-800 text-sm border-b border-gray-200 pb-2 mb-3">
                A. Project Evaluation (60% of Total Grade)
              </h3>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs table-card-mobile">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                      <th className="p-3 w-[55%]">Competency</th>
                      <th className="p-3 text-center w-[15%]">Weight (%)</th>
                      <th className="p-3 text-center w-[15%]">Score Achieved (%)</th>
                      <th className="p-3 text-right w-[15%]">Weighted Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {PROJECT_CRITERIA.map(c => {
                      const scoreVal = form[c.key] ?? 80;
                      const weighted = (scoreVal * c.weight) / 100;
                      return (
                        <tr key={c.key} className="hover:bg-gray-50/50">
                          <td className="p-3 font-medium text-gray-800" data-label="Competency">{c.label}</td>
                          <td className="p-3 text-center font-semibold text-gray-500" data-label="Weight">{c.weight}%</td>
                          <td className="p-2 text-center" data-label="Score Achieved">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={scoreVal}
                              onChange={e => {
                                const val = Math.min(100, Math.max(0, Number(e.target.value)));
                                setForm(f => ({ ...f, [c.key]: val }));
                              }}
                              className="form-input text-center w-20 py-1 font-semibold border border-gray-300 rounded-lg"
                            />
                          </td>
                          <td className="p-3 text-right font-bold text-blue-700" data-label="Weighted Score">{weighted.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-blue-50/50 font-bold">
                      <td className="p-3 text-blue-900" data-label="Competency">Project Score (Total)</td>
                      <td className="p-3 text-center text-blue-900" data-label="Weight">60%</td>
                      <td className="p-3 text-center" data-label="Score Achieved"></td>
                      <td className="p-3 text-right text-blue-800 text-sm" data-label="Weighted Score">{projectScoreLive.toFixed(2)} / 60.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="form-group mt-3">
                <label className="form-label text-xs font-semibold text-gray-700">Comments on Project Performance</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={form.project_comments}
                  onChange={e => setForm(f => ({ ...f, project_comments: e.target.value }))}
                  placeholder="Enter feedback regarding project completion, code quality, accuracy, etc."
                />
              </div>
            </div>

            {/* B. Performance Evaluation Table */}
            <div>
              <h3 className="font-bold text-gray-800 text-sm border-b border-gray-200 pb-2 mb-3">
                B. OJT Performance Evaluation (40% of Total Grade)
              </h3>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs table-card-mobile">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                      <th className="p-3 w-[55%]">Competency</th>
                      <th className="p-3 text-center w-[15%]">Weight (%)</th>
                      <th className="p-3 text-center w-[15%]">Score Achieved (%)</th>
                      <th className="p-3 text-right w-[15%]">Weighted Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {PERFORMANCE_CRITERIA.map(c => {
                      const scoreVal = form[c.key] ?? 80;
                      const weighted = (scoreVal * c.weight) / 100;
                      return (
                        <tr key={c.key} className="hover:bg-gray-50/50">
                          <td className="p-3 font-medium text-gray-800" data-label="Competency">{c.label}</td>
                          <td className="p-3 text-center font-semibold text-gray-500" data-label="Weight">{c.weight}%</td>
                          <td className="p-2 text-center" data-label="Score Achieved">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={scoreVal}
                              onChange={e => {
                                const val = Math.min(100, Math.max(0, Number(e.target.value)));
                                setForm(f => ({ ...f, [c.key]: val }));
                              }}
                              className="form-input text-center w-20 py-1 font-semibold border border-gray-300 rounded-lg"
                            />
                          </td>
                          <td className="p-3 text-right font-bold text-blue-700" data-label="Weighted Score">{weighted.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-blue-50/50 font-bold">
                      <td className="p-3 text-blue-900" data-label="Competency">Performance Score (Total)</td>
                      <td className="p-3 text-center text-blue-900" data-label="Weight">40%</td>
                      <td className="p-3 text-center" data-label="Score Achieved"></td>
                      <td className="p-3 text-right text-blue-800 text-sm" data-label="Weighted Score">{performanceScoreLive.toFixed(2)} / 40.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="form-group mt-3">
                <label className="form-label text-xs font-semibold text-gray-700">Evaluator&apos;s Comments</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={form.performance_comments}
                  onChange={e => setForm(f => ({ ...f, performance_comments: e.target.value }))}
                  placeholder="Enter comments on discipline, reliability, collaboration, motivation, etc."
                />
              </div>
            </div>

            {/* Calculations Preview */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-800">Final Grade Computation</p>
                <p className="text-xs text-blue-600 mt-1">
                  Project ({projectScoreLive.toFixed(2)}) + Performance ({performanceScoreLive.toFixed(2)})
                </p>
              </div>
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Final Grade</p>
                  <p className="text-2xl font-black text-blue-700">{finalGradeLive.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Rating</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{ratingDetailsLive.rating}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Letter Grade</p>
                  <p className="text-sm font-bold text-blue-700 mt-1">{ratingDetailsLive.letter}</p>
                </div>
              </div>
            </div>

            {/* Publish Toggle */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <div>
                <h5 className="text-xs font-bold text-gray-700">Open evaluation results to intern?</h5>
                <p className="text-[10px] text-gray-400">If locked, the intern will not see their scores and comments.</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, is_visible: !f.is_visible }))}
                className={`btn btn-sm flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold border ${
                  form.is_visible
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}
              >
                {form.is_visible ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {form.is_visible ? 'Open' : 'Locked'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* View-only Modal (OJT Evaluation Form Layout) */}
      {modal === 'view' && viewEval && (() => {
        const details = parseEvaluationDetails(viewEval);
        const projectScores = details.project_scores || {};
        const performanceScores = details.performance_scores || {};
        
        // Compute project score
        const projectScore = (
          (Number(projectScores.project_quality || 0) * 0.20) +
          (Number(projectScores.project_timeliness || 0) * 0.10) +
          (Number(projectScores.project_problem_solving || 0) * 0.10) +
          (Number(projectScores.project_initiative || 0) * 0.10) +
          (Number(projectScores.project_accuracy || 0) * 0.05) +
          (Number(projectScores.project_documentation || 0) * 0.05)
        );

        // Compute performance score
        const performanceScore = (
          (Number(performanceScores.performance_punctuality || 0) * 0.10) +
          (Number(performanceScores.performance_attendance || 0) * 0.10) +
          (Number(performanceScores.performance_teamwork || 0) * 0.05) +
          (Number(performanceScores.performance_learning || 0) * 0.05) +
          (Number(performanceScores.performance_initiative || 0) * 0.05) +
          (Number(performanceScores.performance_communication || 0) * 0.05)
        );

        const finalGrade = projectScore + performanceScore;
        const ratingDetails = getRatingAndLetter(finalGrade);

        // Try to match course/division from intern record
        const internRecord = interns.find(i => i.id === viewEval.intern_id);

        return (
          <Modal
            isOpen={modal === 'view'}
            onClose={() => { setModal(null); setViewEval(null); }}
            title="OJT Evaluation Sheet"
            size="lg"
            footer={<button className="btn btn-secondary" onClick={() => { setModal(null); setViewEval(null); }}>Close</button>}
          >
            <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 bg-white text-gray-800 p-4">
              
              {/* PNP ITMS Official Header */}
              <div className="flex items-center justify-between border-b-2 border-gray-900 pb-4 text-center">
                <img src="/PNP_LOGO.png" alt="PNP Logo" className="w-16 h-16 object-contain" />
                <div className="flex-1 px-4">
                  <p className="text-[10px] font-medium leading-tight">Republic of the Philippines</p>
                  <p className="text-[10px] font-semibold leading-tight">NATIONAL POLICE COMMISSION</p>
                  <p className="text-[11px] font-bold leading-tight">PHILIPPINE NATIONAL POLICE</p>
                  <p className="text-[12px] font-extrabold leading-tight tracking-wider text-blue-900">INFORMATION TECHNOLOGY MANAGEMENT SERVICE</p>
                  <p className="text-[9px] font-medium text-gray-500 leading-none mt-0.5">Camp BGen Rafael T Crame, Quezon City</p>
                </div>
                <img src="/ITMS_LOGO.png" alt="ITMS Logo" className="w-16 h-16 object-contain" />
              </div>

              <h2 className="text-center font-black text-lg text-gray-900 tracking-wide mt-2">OJT Evaluation Form</h2>

              {/* Trainee Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 text-xs border border-gray-300 rounded-xl p-4 bg-gray-50/50">
                <div>
                  <span className="font-bold text-gray-700">Trainee Name:</span>
                  <span className="ml-2 border-b border-gray-400 pb-0.5 inline-block min-w-[200px] font-semibold">{viewEval.full_name}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Position/Program:</span>
                  <span className="ml-2 border-b border-gray-400 pb-0.5 inline-block min-w-[200px] font-semibold">{internRecord?.course || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Division:</span>
                  <span className="ml-2 border-b border-gray-400 pb-0.5 inline-block min-w-[200px] font-semibold">{internRecord?.division_name || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">OJT Period:</span>
                  <span className="ml-2 border-b border-gray-400 pb-0.5 inline-block min-w-[200px] font-semibold">
                    {internRecord?.start_date ? format(new Date(internRecord.start_date), 'MM/dd/yyyy') : '—'} to {internRecord?.end_date ? format(new Date(internRecord.end_date), 'MM/dd/yyyy') : '—'}
                  </span>
                </div>
                <div className="md:col-span-2">
                  <span className="font-bold text-gray-700">Evaluator/Supervisor:</span>
                  <span className="ml-2 border-b border-gray-400 pb-0.5 inline-block min-w-[200px] font-semibold">{viewEval.evaluator_name}</span>
                </div>
              </div>

              {/* A. Project Evaluation */}
              <div>
                <h3 className="font-extrabold text-xs text-gray-900 mb-2">A. Project Evaluation (60% of Total Grade)</h3>
                <div className="overflow-x-auto">
                <table className="w-full text-left border border-collapse border-gray-300 text-xs admin-evaluation-detail-table">
                  <thead>
                    <tr className="bg-gray-100 font-bold border-b border-gray-300 text-gray-700">
                      <th className="p-2.5 border-r border-gray-300 w-[55%]">Competency</th>
                      <th className="p-2.5 border-r border-gray-300 text-center w-[15%]">Weight (%)</th>
                      <th className="p-2.5 border-r border-gray-300 text-center w-[15%]">Percentage Achieved (%)</th>
                      <th className="p-2.5 text-right w-[15%]">Weighted Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-300">
                    {PROJECT_CRITERIA.map(c => {
                      const score = Number(projectScores[c.key] || 0);
                      const weighted = (score * c.weight) / 100;
                      return (
                        <tr key={c.key}>
                          <td data-label="Competency" className="p-2 border-r border-gray-300 font-medium text-gray-800">{c.label}</td>
                          <td data-label="Weight" className="p-2 border-r border-gray-300 text-center">{c.weight}%</td>
                          <td data-label="Percentage Achieved" className="p-2 border-r border-gray-300 text-center font-semibold">{score}</td>
                          <td data-label="Weighted Score" className="p-2 text-right font-bold text-gray-900">{weighted.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50/80 font-bold border-t-2 border-gray-400">
                      <td data-label="Competency" className="p-2.5 border-r border-gray-300 text-gray-900">Project Score (Total)</td>
                      <td data-label="Weight" className="p-2.5 border-r border-gray-300 text-center">60%</td>
                      <td data-label="Percentage Achieved" className="p-2.5 border-r border-gray-300 text-center"></td>
                      <td data-label="Weighted Score" className="p-2.5 text-right font-black text-blue-900 text-sm">{projectScore.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
                {details.project_comments && (
                  <div className="mt-2.5 border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-0.5">Comments on Project Performance:</p>
                    <p className="text-xs text-gray-700 italic leading-relaxed">{details.project_comments}</p>
                  </div>
                )}
              </div>

              {/* B. Performance Evaluation */}
              <div>
                <h3 className="font-extrabold text-xs text-gray-900 mb-2">B. OJT Performance Evaluation (40% of Total Grade)</h3>
                <div className="overflow-x-auto">
                <table className="w-full text-left border border-collapse border-gray-300 text-xs admin-evaluation-detail-table">
                  <thead>
                    <tr className="bg-gray-100 font-bold border-b border-gray-300 text-gray-700">
                      <th className="p-2.5 border-r border-gray-300 w-[55%]">Competency</th>
                      <th className="p-2.5 border-r border-gray-300 text-center w-[15%]">Weight (%)</th>
                      <th className="p-2.5 border-r border-gray-300 text-center w-[15%]">Percentage Achieved (%)</th>
                      <th className="p-2.5 text-right w-[15%]">Weighted Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-300">
                    {PERFORMANCE_CRITERIA.map(c => {
                      const score = Number(performanceScores[c.key] || 0);
                      const weighted = (score * c.weight) / 100;
                      return (
                        <tr key={c.key}>
                          <td data-label="Competency" className="p-2 border-r border-gray-300 font-medium text-gray-800">{c.label}</td>
                          <td data-label="Weight" className="p-2 border-r border-gray-300 text-center">{c.weight}%</td>
                          <td data-label="Percentage Achieved" className="p-2 border-r border-gray-300 text-center font-semibold">{score}</td>
                          <td data-label="Weighted Score" className="p-2 text-right font-bold text-gray-900">{weighted.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50/80 font-bold border-t-2 border-gray-400">
                      <td data-label="Competency" className="p-2.5 border-r border-gray-300 text-gray-900">Performance Score (Total)</td>
                      <td data-label="Weight" className="p-2.5 border-r border-gray-300 text-center">40%</td>
                      <td data-label="Percentage Achieved" className="p-2.5 border-r border-gray-300 text-center"></td>
                      <td data-label="Weighted Score" className="p-2.5 text-right font-black text-blue-900 text-sm">{performanceScore.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
                {details.performance_comments && (
                  <div className="mt-2.5 border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-0.5">Evaluator&apos;s Comments:</p>
                    <p className="text-xs text-gray-700 italic leading-relaxed">{details.performance_comments}</p>
                  </div>
                )}
              </div>

              {/* Final Grade Summary */}
              <div className="border-t border-gray-300 pt-4 flex flex-col items-end gap-1 text-right">
                <div>
                  <span className="font-extrabold text-sm text-gray-900">Final Grade:</span>
                  <span className="ml-2 font-black text-lg text-blue-900 border-b-2 border-double border-gray-900 pb-0.5 px-3">
                    {finalGrade.toFixed(2)}%
                  </span>
                </div>
                <div className="text-xs font-bold text-gray-700 mt-1">
                  Rating: <span className="text-blue-800">{ratingDetails.rating} ({ratingDetails.letter})</span>
                </div>
                <div className="text-[10px] text-gray-500 italic max-w-sm mt-0.5">
                  Interpretation: {ratingDetails.interpretation}
                </div>
              </div>

              {/* Signatures block */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10 pt-6 border-t border-dashed border-gray-200">
                <div className="text-center space-y-1">
                  <div className="border-b border-gray-600 h-10 w-[80%] mx-auto" />
                  <p className="text-xs font-bold text-gray-700">Evaluator&apos;s Signature</p>
                  <p className="text-[10px] text-gray-400">Date: {viewEval.evaluation_date ? format(new Date(viewEval.evaluation_date), 'MM/dd/yyyy') : '—'}</p>
                </div>
                <div className="text-center space-y-1">
                  <div className="border-b border-gray-600 h-10 w-[80%] mx-auto" />
                  <p className="text-xs font-bold text-gray-700">Trainee&apos;s Acknowledgment</p>
                  <p className="text-[10px] text-gray-400">Date: ————————</p>
                </div>
              </div>

            </div>
          </Modal>
        );
      })()}

      {/* Archive / restore confirmation (admins only) */}
      {lifecycleTarget && (
        <Modal
          isOpen={Boolean(lifecycleTarget)}
          onClose={() => setLifecycleTarget(null)}
          title={lifecycleTarget.action === 'archive' ? 'Archive Evaluation' : 'Restore Evaluation'}
          size="sm"
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setLifecycleTarget(null)}
                disabled={lifecycleSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${lifecycleTarget.action === 'archive' ? 'btn-primary bg-amber-600 hover:bg-amber-700' : 'btn-primary bg-emerald-600 hover:bg-emerald-700'}`}
                onClick={handleLifecycleAction}
                disabled={lifecycleSaving || (lifecycleTarget.action === 'archive' && !lifecycleReason.trim())}
              >
                {lifecycleSaving
                  ? 'Saving...'
                  : lifecycleTarget.action === 'archive' ? 'Archive Evaluation' : 'Restore Evaluation'}
              </button>
            </>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <p>
                {lifecycleTarget.action === 'archive'
                  ? 'This hides the evaluation from normal lists and from the intern. It can be restored later.'
                  : 'This makes the evaluation active again and returns it to normal lists.'}
              </p>
            </div>
            <p className="font-semibold text-gray-800">
              {lifecycleTarget.row.full_name || 'Selected intern'}
            </p>
            {lifecycleTarget.action === 'archive' && (
              <div className="form-group">
                <label className="form-label">Archive reason *</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={lifecycleReason}
                  onChange={e => setLifecycleReason(e.target.value)}
                  placeholder="Explain why this evaluation is being archived"
                  required
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Permanent deletion confirmation (admins only) */}
      {deleteTarget && (
        <Modal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Permanently Delete Evaluation"
          size="sm"
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={lifecycleSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary bg-red-600 hover:bg-red-700"
                onClick={handleDelete}
                disabled={lifecycleSaving || deleteConfirmation !== 'DELETE'}
              >
                {lifecycleSaving ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <p>This permanently removes the evaluation and cannot be undone. Archive it instead if it may be needed later.</p>
            </div>
            <p className="font-semibold text-gray-800">
              {deleteTarget.full_name || 'Selected intern'}
            </p>
            <div className="form-group">
              <label className="form-label">Type DELETE to confirm</label>
              <input
                className="form-input font-semibold"
                value={deleteConfirmation}
                onChange={e => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
