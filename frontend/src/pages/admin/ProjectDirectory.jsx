import { useState, useEffect, useCallback } from 'react';
import {
  FolderGit2, Search, Filter, Download, FileText, Users, Code,
  Presentation, CheckCircle2, Clock, AlertCircle, Layers, ExternalLink,
  Github, BarChart3, FolderKanban, ShieldCheck, Loader2, Eye,
  Archive, RotateCcw, History, Trash2, Edit3, Save
} from 'lucide-react';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const FILE_CATEGORIES = [
  { id: 'documentation', label: 'Documentation', icon: FileText, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'source_code', label: 'Source Code / Archive', icon: Code, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { id: 'presentation', label: 'Presentation / Pitch', icon: Presentation, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'deliverable', label: 'Final Deliverable', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'other', label: 'Other File', icon: Layers, color: 'text-slate-600 bg-slate-50 border-slate-200' }
];

const STATUS_CONFIG = {
  planning: { label: 'Planning', bg: 'bg-purple-100 text-purple-700 border-purple-200', icon: Clock },
  in_progress: { label: 'In Progress', bg: 'bg-blue-100 text-blue-700 border-blue-200', icon: Loader2 },
  review: { label: 'Under Review', bg: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertCircle },
  completed: { label: 'Completed', bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  on_hold: { label: 'On Hold', bg: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock }
};

const formatProjectDate = value => {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : format(date, 'MMM d, yyyy');
};

export default function ProjectDirectory() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Selected project for detailed deliverables view
  const [selectedProject, setSelectedProject] = useState(null);
  const [quickViewProject, setQuickViewProject] = useState(null);
  const [auditProject, setAuditProject] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [staffMemberOptions, setStaffMemberOptions] = useState([]);
  const [savingProject, setSavingProject] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '', description: '', group_name: '', division_id: '', leader_id: '',
    status: 'in_progress', progress: 0, github_repo: '', demo_url: '', members: [],
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, divRes, statsRes] = await Promise.allSettled([
        api.get('/projects', { params: { search, status: statusFilter, division_id: divisionFilter, include_archived: showArchived } }),
        api.get('/divisions'),
        api.get('/projects/stats', { params: { division_id: divisionFilter, include_archived: showArchived } })
      ]);

      if (projRes.status === 'fulfilled') {
        setProjects(projRes.value.data || []);
      }
      if (divRes.status === 'fulfilled') {
        setDivisions(divRes.value.data?.divisions || divRes.value.data || []);
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data || null);
      }
    } catch {
      toast.error('Failed to load project directory data');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, divisionFilter, showArchived]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const quickViewStatus = STATUS_CONFIG[quickViewProject?.status] || STATUS_CONFIG.in_progress;
  const QuickViewStatusIcon = quickViewStatus.icon;
  const quickViewMembers = Array.isArray(quickViewProject?.members) ? quickViewProject.members : [];

  const archiveProject = async project => {
    const restoring = Boolean(project.archived_at);
    if (!confirm(`${restoring ? 'Restore' : 'Archive'} "${project.title}"?`)) return;
    try {
      await api.patch(`/projects/${project.id}/${restoring ? 'restore' : 'archive'}`, restoring ? {} : {
        reason: 'Archived by assigned staff from the project directory',
      });
      toast.success(`Project ${restoring ? 'restored' : 'archived'}`);
      setQuickViewProject(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || `Could not ${restoring ? 'restore' : 'archive'} project`);
    }
  };

  const permanentlyDeleteProject = async project => {
    if (!confirm(`Permanently delete "${project.title}" and all its files? This cannot be undone.`)) return;
    try {
      await api.delete(`/projects/${project.id}`);
      toast.success('Project permanently deleted');
      setQuickViewProject(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not delete project');
    }
  };

  const openAuditHistory = async project => {
    setAuditProject(project);
    setAuditLoading(true);
    try {
      const response = await api.get(`/projects/${project.id}/audit`);
      setAuditHistory(response.data?.history || []);
    } catch (error) {
      setAuditHistory([]);
      toast.error(error.response?.data?.error || 'Could not load project history');
    } finally {
      setAuditLoading(false);
    }
  };

  const updateProjectStatus = async (project, status) => {
    try {
      const response = await api.put(`/projects/${project.id}`, { status });
      setQuickViewProject(response.data);
      toast.success('Project status updated');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not update project status');
    }
  };

  const loadStaffMemberOptions = async divisionId => {
    try {
      const response = await api.get('/projects/members', { params: { division_id: divisionId } });
      setStaffMemberOptions(response.data || []);
    } catch (error) {
      setStaffMemberOptions([]);
      toast.error(error.response?.data?.error || 'Could not load eligible project members');
    }
  };

  const openProjectEditor = async project => {
    setEditingProject(project);
    setEditForm({
      title: project.title || '',
      description: project.description || '',
      group_name: project.group_name || '',
      division_id: project.division_id || '',
      leader_id: project.leader_id || '',
      status: project.status || 'in_progress',
      progress: Number(project.progress || 0),
      github_repo: project.github_repo || '',
      demo_url: project.demo_url || '',
      members: Array.isArray(project.members) ? project.members : [],
    });
    await loadStaffMemberOptions(project.division_id);
  };

  const toggleStaffMember = member => {
    setEditForm(current => {
      const exists = current.members.some(item => String(item.id) === String(member.id));
      return {
        ...current,
        members: exists
          ? current.members.filter(item => String(item.id) !== String(member.id))
          : [...current.members, member],
      };
    });
  };

  const saveStaffProject = async event => {
    event.preventDefault();
    if (!editingProject) return;
    setSavingProject(true);
    try {
      await api.put(`/projects/${editingProject.id}`, editForm);
      toast.success('Project updated');
      setEditingProject(null);
      setQuickViewProject(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not update project');
    } finally {
      setSavingProject(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-500/20 text-amber-300 text-xs px-2.5 py-1 rounded-full border border-amber-400/30 font-medium flex items-center gap-1">
              <FolderGit2 className="w-3.5 h-3.5" /> Central Directory
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Intern Project Directory & Deliverables</h1>
          <p className="text-slate-300 text-sm mt-1">Browse, track, and evaluate intern development projects across all groups and divisions.</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Projects</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats?.total_projects ?? 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">In Progress</p>
          <p className="text-2xl font-bold text-blue-700 mt-2">{stats?.in_progress_projects ?? 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Under Review</p>
          <p className="text-2xl font-bold text-amber-700 mt-2">{stats?.review_projects ?? 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Completed</p>
          <p className="text-2xl font-bold text-emerald-700 mt-2">{stats?.completed_projects ?? 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between col-span-2 md:col-span-1">
          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Files & Deliverables</p>
          <p className="text-2xl font-bold text-purple-700 mt-2">{stats?.total_files ?? 0}</p>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search directory by project title, group name, or leader..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={divisionFilter}
            onChange={e => setDivisionFilter(e.target.value)}
            disabled={user?.role === 'supervisor'}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Divisions</option>
            {divisions.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={event => setShowArchived(event.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Include archived
          </label>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="planning">Planning</option>
            <option value="in_progress">In Progress</option>
            <option value="review">Under Review</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
      </div>

      {/* Projects Directory List */}
      {loading ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading project directory...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8">
          <FolderGit2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-800">No Projects Found</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mt-1">
            No intern projects match the selected search criteria or filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(proj => {
            const StatusIcon = STATUS_CONFIG[proj.status]?.icon || Clock;
            const statusStyle = STATUS_CONFIG[proj.status] || STATUS_CONFIG.in_progress;
            const members = Array.isArray(proj.members) ? proj.members : [];

            return (
              <div key={proj.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden">
                <div className="p-5">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Open quick information for ${proj.title}`}
                    onClick={() => setQuickViewProject(proj)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setQuickViewProject(proj);
                      }
                    }}
                    className="-m-2 p-2 rounded-xl space-y-4 cursor-pointer transition-colors hover:bg-blue-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    {/* Group & Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="inline-block text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full mb-1.5">
                          Group: {proj.group_name}
                        </span>
                        <h3 className="font-bold text-slate-900 text-lg leading-snug">{proj.title}</h3>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${statusStyle.bg}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {statusStyle.label}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-slate-600 text-sm line-clamp-2 leading-relaxed">
                      {proj.description || 'No detailed description provided.'}
                    </p>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-600">Development Progress</span>
                        <span className="text-blue-700 font-bold">{proj.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500 ${
                            proj.progress === 100 ? 'bg-emerald-500' : proj.progress > 50 ? 'bg-blue-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${proj.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Leader & Assigned Members */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-blue-600" />
                          <span className="font-medium">Leader:</span>
                          <span className="font-semibold text-slate-800">{proj.leader_name}</span>
                        </div>
                        {proj.leader_division && (
                          <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">{proj.leader_division}</span>
                        )}
                      </div>

                      {members.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {members.map((m, idx) => (
                            <span key={idx} className="bg-slate-50 border border-slate-200 text-slate-700 text-[11px] px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              {m.full_name || m.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600">
                      <Eye className="w-3.5 h-3.5" />
                      Click for quick project information
                    </div>
                  </div>

                  {/* Repository Links */}
                  {(proj.github_repo || proj.demo_url) && (
                    <div className="flex items-center gap-3 text-xs mt-4 pt-3 border-t border-slate-100">
                      {proj.github_repo && (
                        <a href={proj.github_repo} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-700 hover:text-blue-600">
                          <Github className="w-3.5 h-3.5" /> Repository
                        </a>
                      )}
                      {proj.demo_url && (
                        <a href={proj.demo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                          <ExternalLink className="w-3.5 h-3.5" /> Live Demo
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Button */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">
                    {proj.files?.length || 0} File Deliverable(s)
                  </span>

                  <div className="flex items-center gap-1.5">
                    {proj.permissions?.can_edit_details && (
                      <button
                        onClick={() => openProjectEditor(proj)}
                        className="p-1.5 text-slate-500 hover:text-blue-700 rounded-lg"
                        title="Edit project"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    {proj.permissions?.can_view_audit && (
                      <button
                        onClick={() => openAuditHistory(proj)}
                        className="p-1.5 text-slate-500 hover:text-blue-700 rounded-lg"
                        title="View project history"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    )}
                    {(proj.archived_at ? proj.permissions?.can_restore : proj.permissions?.can_archive) && (
                      <button
                        onClick={() => archiveProject(proj)}
                        className="p-1.5 text-slate-500 hover:text-amber-700 rounded-lg"
                        title={proj.archived_at ? 'Restore project' : 'Archive project'}
                      >
                        {proj.archived_at ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedProject(proj)}
                      className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" /> View Files
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PROJECT QUICK VIEW MODAL */}
      <Modal
        isOpen={Boolean(quickViewProject)}
        onClose={() => setQuickViewProject(null)}
        title="Project Quick View"
        size="lg"
        footer={(
          <>
            <button
              type="button"
              onClick={() => setQuickViewProject(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedProject(quickViewProject);
                setQuickViewProject(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              View Directory Files
            </button>
            {quickViewProject?.permissions?.can_edit_details && (
              <button
                type="button"
                onClick={() => {
                  const project = quickViewProject;
                  setQuickViewProject(null);
                  openProjectEditor(project);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                <Edit3 className="w-4 h-4" /> Edit
              </button>
            )}
            {quickViewProject?.permissions?.can_view_audit && (
              <button
                type="button"
                onClick={() => {
                  const project = quickViewProject;
                  setQuickViewProject(null);
                  openAuditHistory(project);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <History className="w-4 h-4" /> History
              </button>
            )}
            {(quickViewProject?.archived_at
              ? quickViewProject?.permissions?.can_restore
              : quickViewProject?.permissions?.can_archive) && (
              <button
                type="button"
                onClick={() => archiveProject(quickViewProject)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-200 text-sm font-semibold text-amber-700 hover:bg-amber-50"
              >
                {quickViewProject.archived_at ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                {quickViewProject.archived_at ? 'Restore' : 'Archive'}
              </button>
            )}
            {quickViewProject?.permissions?.can_delete && (
              <button
                type="button"
                onClick={() => permanentlyDeleteProject(quickViewProject)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </>
        )}
      >
        {quickViewProject && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <span className="inline-block text-xs font-semibold text-blue-700 bg-white border border-blue-100 px-2.5 py-1 rounded-full mb-2">
                    {quickViewProject.group_name || 'Unnamed group'}
                  </span>
                  <h3 className="text-xl font-bold text-slate-900">{quickViewProject.title}</h3>
                </div>
                <span className={`inline-flex self-start items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${quickViewStatus.bg}`}>
                  <QuickViewStatusIcon className="w-4 h-4" />
                  {quickViewStatus.label}
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                {quickViewProject.description || 'No detailed description provided.'}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Development Progress</span>
                <span className="font-bold text-blue-700">{quickViewProject.progress}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    quickViewProject.progress === 100
                      ? 'bg-emerald-500'
                      : quickViewProject.progress > 50
                        ? 'bg-blue-600'
                        : 'bg-amber-500'
                  }`}
                  style={{ width: `${quickViewProject.progress}%` }}
                />
              </div>
              {quickViewProject.permissions?.can_update_progress && (
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600">Staff status:</label>
                  <select
                    value={quickViewProject.status}
                    onChange={event => updateProjectStatus(quickViewProject, event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    <option value="planning">Planning</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Under Review</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Users className="w-4 h-4 text-blue-600" />
                  Project Leader
                </div>
                <p className="mt-2 font-bold text-slate-900">{quickViewProject.leader_name || 'Unassigned'}</p>
                <p className="mt-0.5 text-xs text-slate-500">{quickViewProject.leader_division || 'No division assigned'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <FolderKanban className="w-4 h-4 text-purple-600" />
                  Directory Summary
                </div>
                <p className="mt-2 font-bold text-slate-900">
                  {quickViewMembers.length} Team Member{quickViewMembers.length === 1 ? '' : 's'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {quickViewProject.files?.length || 0} File Deliverable(s)
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Team Members</h4>
              {quickViewMembers.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {quickViewMembers.map((member, index) => (
                    <span key={member.id || index} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      {member.full_name || member.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No additional team members listed.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-slate-200 p-3">
                <span className="text-xs text-slate-500">Created</span>
                <p className="mt-0.5 font-semibold text-slate-800">{formatProjectDate(quickViewProject.created_at)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <span className="text-xs text-slate-500">Last Updated</span>
                <p className="mt-0.5 font-semibold text-slate-800">{formatProjectDate(quickViewProject.updated_at)}</p>
              </div>
            </div>

            {(quickViewProject.github_repo || quickViewProject.demo_url) && (
              <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                {quickViewProject.github_repo && (
                  <a
                    href={quickViewProject.github_repo}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-600"
                  >
                    <Github className="w-4 h-4" />
                    Repository
                  </a>
                )}
                {quickViewProject.demo_url && (
                  <a
                    href={quickViewProject.demo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Live Demo
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* DELIVERABLES MODAL */}
      <Modal
        isOpen={Boolean(selectedProject)}
        onClose={() => setSelectedProject(null)}
        title={`Directory Deliverables — ${selectedProject?.title || ''}`}
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
            <p className="font-bold text-slate-800 text-sm">{selectedProject?.title}</p>
            <p className="text-slate-600">Group: <strong className="text-slate-800">{selectedProject?.group_name}</strong> | Leader: <strong className="text-slate-800">{selectedProject?.leader_name}</strong></p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Project Deliverables Repository ({selectedProject?.files?.length || 0})
            </h4>

            {(!selectedProject?.files || selectedProject.files.length === 0) ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-xs">No project files uploaded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {selectedProject.files.map(file => {
                  const categoryInfo = FILE_CATEGORIES.find(c => c.id === file.file_category) || FILE_CATEGORIES[0];
                  const Icon = categoryInfo.icon;

                  return (
                    <div key={file.id} className="p-3.5 bg-white flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg border ${categoryInfo.color} shrink-0`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{file.original_name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            <span>Uploaded by {file.uploader_name}</span>
                            <span>•</span>
                            <span>{(file.file_size / 1024 / 1024).toFixed(2)} MB</span>
                            <span>•</span>
                            <span>{format(new Date(file.upload_date), 'MMM d, yyyy')}</span>
                          </div>
                        </div>
                      </div>

                      <a
                        href={file.public_url}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-blue-200 shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(auditProject)}
        onClose={() => {
          setAuditProject(null);
          setAuditHistory([]);
        }}
        title={`Project History — ${auditProject?.title || ''}`}
        size="lg"
      >
        {auditLoading ? (
          <div className="py-10 text-center text-sm text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            Loading project history...
          </div>
        ) : auditHistory.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No audit events have been recorded yet.</p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {auditHistory.map(event => (
              <div key={event.id} className="p-3.5 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800 capitalize">
                    {String(event.action || '').replaceAll('_', ' ')}
                  </p>
                  <span className="text-[11px] text-slate-500">
                    {format(new Date(event.created_at), 'MMM d, yyyy h:mm a')}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  {event.actor_name} ({event.actor_role})
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(editingProject)}
        onClose={() => setEditingProject(null)}
        title={`Manage Project — ${editingProject?.title || ''}`}
        size="lg"
      >
        <form onSubmit={saveStaffProject} className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Project title</label>
              <input
                required
                value={editForm.title}
                onChange={event => setEditForm(current => ({ ...current, title: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Group name</label>
              <input
                required
                value={editForm.group_name}
                onChange={event => setEditForm(current => ({ ...current, group_name: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={editForm.description}
              onChange={event => setEditForm(current => ({ ...current, description: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Division</label>
              <select
                value={editForm.division_id}
                disabled={!editingProject?.permissions?.can_change_division}
                onChange={event => {
                  const divisionId = event.target.value;
                  setEditForm(current => ({ ...current, division_id: divisionId, leader_id: '', members: [] }));
                  loadStaffMemberOptions(divisionId);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              >
                <option value="">Select division</option>
                {divisions.map(division => <option key={division.id} value={division.id}>{division.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Project leader</label>
              <select
                value={editForm.leader_id}
                disabled={!editingProject?.permissions?.can_reassign_leader}
                onChange={event => setEditForm(current => ({ ...current, leader_id: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              >
                <option value="">Select leader</option>
                {staffMemberOptions.map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={editForm.status}
                onChange={event => setEditForm(current => ({ ...current, status: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="planning">Planning</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Under Review</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Progress</span><span>{editForm.progress}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={editForm.progress}
                onChange={event => setEditForm(current => ({ ...current, progress: Number(event.target.value) }))}
                className="w-full accent-blue-600"
              />
            </div>
          </div>

          {editingProject?.permissions?.can_manage_members && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Assigned team members</label>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {staffMemberOptions.map(member => {
                  const checked = editForm.members.some(item => String(item.id) === String(member.id));
                  return (
                    <label key={member.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                      <span>
                        <span className="font-semibold text-slate-800">{member.full_name}</span>
                        <span className="block text-[11px] text-slate-500">{member.division_name}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStaffMember(member)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Repository URL</label>
              <input
                type="url"
                value={editForm.github_repo}
                onChange={event => setEditForm(current => ({ ...current, github_repo: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Demo URL</label>
              <input
                type="url"
                value={editForm.demo_url}
                onChange={event => setEditForm(current => ({ ...current, demo_url: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setEditingProject(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200">
              Cancel
            </button>
            <button disabled={savingProject} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white disabled:bg-slate-300">
              {savingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
