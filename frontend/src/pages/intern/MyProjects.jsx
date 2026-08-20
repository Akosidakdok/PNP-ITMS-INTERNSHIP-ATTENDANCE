import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderKanban, Plus, Search, Upload, Download, Trash2, Edit3,
  ExternalLink, Github, Users, CheckCircle2, Clock, AlertCircle,
  FileText, Code, Presentation, Layers, X, Loader2, Sparkles, Filter,
  ChevronDown, Eye
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

export default function MyProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [internList, setInternList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Create/Edit Modal State
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    group_name: '',
    division_id: '',
    status: 'in_progress',
    progress: 0,
    github_repo: '',
    demo_url: '',
    members: []
  });

  // Combobox member dropdown state
  const [memberSearch, setMemberSearch] = useState('');
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const memberDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (memberDropdownRef.current && !memberDropdownRef.current.contains(event.target)) {
        setMemberDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Files Modal State
  const [activeProjectForFiles, setActiveProjectForFiles] = useState(null);
  const [quickViewProject, setQuickViewProject] = useState(null);
  const [fileUploadCategory, setFileUploadCategory] = useState('documentation');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, divRes, intRes] = await Promise.allSettled([
        api.get('/projects', { params: { search, status: statusFilter } }),
        api.get('/divisions'),
        api.get('/projects/members')
      ]);

      if (projRes.status === 'fulfilled') {
        setProjects(projRes.value.data || []);
      } else {
        console.warn('Projects fetch failed:', projRes.reason);
      }

      if (divRes.status === 'fulfilled') {
        setDivisions(divRes.value.data?.divisions || divRes.value.data || []);
      }

      if (intRes.status === 'fulfilled') {
        setInternList(intRes.value.data || []);
      }
    } catch {
      toast.error('Failed to load project data');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const quickViewStatus = STATUS_CONFIG[quickViewProject?.status] || STATUS_CONFIG.in_progress;
  const QuickViewStatusIcon = quickViewStatus.icon;
  const quickViewMembers = Array.isArray(quickViewProject?.members) ? quickViewProject.members : [];

  const hasPermissionPayload = project => Boolean(
    project?.permissions && typeof project.permissions === 'object'
  );
  const isProjectMember = project => Array.isArray(project?.members)
    && project.members.some(member => String(member?.id) === String(user?.id));
  const isProjectLeader = project => String(project?.leader_id || '') === String(user?.id || '');
  const isProjectStaff = project => user?.role === 'admin'
    || (user?.role === 'supervisor'
      && String(project?.division_id || '') === String(user?.division_id || ''));
  const hasLegacyProjectAccess = project => isProjectStaff(project)
    || isProjectLeader(project)
    || isProjectMember(project);
  const canEditProject = project => hasPermissionPayload(project)
    ? Boolean(project.permissions.can_edit_details || project.permissions.can_update_progress)
    : hasLegacyProjectAccess(project);
  const canDeleteProject = project => Boolean(project?.permissions?.can_delete);
  const canArchiveProject = project => Boolean(project?.permissions?.can_archive);
  const canUploadToProject = project => hasPermissionPayload(project)
    ? Boolean(project.permissions.can_upload_files)
    : hasLegacyProjectAccess(project);
  const canDeleteProjectFile = (_project, file) => Boolean(file?.permissions?.can_delete);

  const handleOpenCreateModal = () => {
    setEditingProject(null);
    const userDiv = user?.division_id || '';
    const userDivName = user?.division_name || '';
    setForm({
      title: '',
      description: '',
      group_name: userDivName ? `${userDivName} Team` : 'Intern Project Group',
      division_id: userDiv,
      status: 'in_progress',
      progress: 0,
      github_repo: '',
      demo_url: '',
      members: [{ id: user.id, full_name: user.full_name, role: 'Lead Developer', division_name: userDivName }]
    });
    setProjectModalOpen(true);
  };

  const handleOpenEditModal = (proj) => {
    setEditingProject(proj);
    setForm({
      title: proj.title || '',
      description: proj.description || '',
      group_name: proj.group_name || '',
      division_id: proj.division_id || '',
      status: proj.status || 'in_progress',
      progress: proj.progress || 0,
      github_repo: proj.github_repo || '',
      demo_url: proj.demo_url || '',
      members: proj.members || []
    });
    setProjectModalOpen(true);
  };

  const handleSaveProject = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.group_name.trim()) {
      toast.error('Project title and group name are required');
      return;
    }

    setSaving(true);
    try {
      if (editingProject) {
        await api.put(`/projects/${editingProject.id}`, form);
        toast.success('Project updated successfully!');
      } else {
        await api.post('/projects', form);
        toast.success('Project created successfully!');
      }
      setProjectModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async (id) => {
    if (!confirm('Are you sure you want to delete this project and all its deliverables?')) return;
    try {
      await api.delete(`/projects/${id}`);
      toast.success('Project deleted');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete project');
    }
  };

  const handleArchiveProject = async (project) => {
    if (!confirm(`Archive "${project.title}"? It will be hidden from interns until assigned staff restores it.`)) return;
    try {
      await api.patch(`/projects/${project.id}/archive`, {
        reason: 'Archived from the intern project workspace',
      });
      toast.success('Project archived');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to archive project');
    }
  };

  const filteredInterns = internList.filter(i => {
    const name = i.full_name || '';
    const div = i.division_name || '';
    const query = memberSearch.trim().toLowerCase();
    return name.toLowerCase().includes(query) || div.toLowerCase().includes(query);
  });
  const editingPermissions = editingProject?.permissions || {};
  const usesBackendPermissions = hasPermissionPayload(editingProject);
  const mayEditDetails = !editingProject || (usesBackendPermissions
    ? editingPermissions.can_edit_details
    : isProjectStaff(editingProject) || isProjectLeader(editingProject));
  const mayUpdateProgress = !editingProject || (usesBackendPermissions
    ? editingPermissions.can_update_progress
    : hasLegacyProjectAccess(editingProject));
  const mayManageMembers = !editingProject || (usesBackendPermissions
    ? editingPermissions.can_manage_members
    : isProjectStaff(editingProject) || isProjectLeader(editingProject));

  const handleSelectIntern = (intern) => {
    if (form.members.some(m => String(m.id) === String(intern.id) || m.full_name === intern.full_name)) {
      toast.error('Member is already added to this project');
      return;
    }
    setForm(prev => ({
      ...prev,
      members: [...prev.members, {
        id: intern.id,
        full_name: intern.full_name,
        role: 'Team Member',
        division_name: intern.division_name || ''
      }]
    }));
    setMemberSearch('');
    setMemberDropdownOpen(false);
  };

  const handleSelectCustomName = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (form.members.some(m => (m.full_name || m.name || '').toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Member is already added');
      return;
    }
    setForm(prev => ({
      ...prev,
      members: [...prev.members, {
        id: `custom_${Date.now()}`,
        full_name: trimmed,
        role: 'Team Member',
        division_name: ''
      }]
    }));
    setMemberSearch('');
    setMemberDropdownOpen(false);
  };

  const handleRemoveMember = (target) => {
    setForm(prev => ({
      ...prev,
      members: prev.members.filter(m => {
        if (target.id) return String(m.id) !== String(target.id);
        return (m.full_name || m.name) !== (target.full_name || target.name || target);
      })
    }));
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile || !activeProjectForFiles) {
      toast.error('Please select a file to upload');
      return;
    }

    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('file_category', fileUploadCategory);

    try {
      await api.post(`/projects/${activeProjectForFiles.id}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('File uploaded to project repository!');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      const updated = await api.get(`/projects/${activeProjectForFiles.id}`);
      setActiveProjectForFiles(updated.data);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'File upload failed');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!confirm('Remove this deliverable file?')) return;
    try {
      await api.delete(`/projects/${activeProjectForFiles.id}/files/${fileId}`);
      toast.success('File removed');
      const updated = await api.get(`/projects/${activeProjectForFiles.id}`);
      setActiveProjectForFiles(updated.data);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove file');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 p-6 rounded-2xl text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-500/20 text-blue-300 text-xs px-2.5 py-1 rounded-full border border-blue-400/30 font-medium flex items-center gap-1">
              <FolderKanban className="w-3.5 h-3.5" /> Intern Project Hub
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">My Intern Projects & Progress</h1>
          <p className="text-blue-200 text-sm mt-1">Track development milestones, group team members, and manage deliverable files.</p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-4 py-2.5 rounded-xl shadow-lg hover:shadow-amber-500/20 transition-all text-sm shrink-0"
        >
          <Plus className="w-4 h-4" /> Create New Project
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search projects by title, group, or keywords..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Progress Statuses</option>
            <option value="planning">Planning</option>
            <option value="in_progress">In Progress</option>
            <option value="review">Under Review</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
      </div>

      {/* Projects Cards List */}
      {loading ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading projects & deliverables...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8">
          <FolderKanban className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-800">No Projects Found</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mt-1 mb-4">
            You haven't created or joined any project yet. Create a project to start tracking your development progress and upload deliverables.
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Create First Project
          </button>
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
                    {/* Title & Status */}
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

                    {/* Development Progress Bar */}
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

                    {/* Leader & Team Members */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-medium">Project Leader:</span>
                        <span className="font-semibold text-slate-800">{proj.leader_name}</span>
                      </div>

                      {members.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {members.map((m, idx) => (
                            <span key={idx} className="bg-slate-100 text-slate-700 text-[11px] px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
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

                  {/* External Links */}
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

                {/* Footer Buttons */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => setActiveProjectForFiles(proj)}
                    className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-900 font-semibold"
                  >
                    <FileText className="w-4 h-4 text-blue-600" />
                    Files / Deliverables ({proj.files?.length || 0})
                  </button>

                  <div className="flex items-center gap-2">
                    {canEditProject(proj) && (
                      <button
                        onClick={() => handleOpenEditModal(proj)}
                        className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
                        title="Edit Project"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    {canDeleteProject(proj) && (
                      <button
                        onClick={() => handleDeleteProject(proj.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
                        title="Delete Project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {!canDeleteProject(proj) && canArchiveProject(proj) && (
                      <button
                        onClick={() => handleArchiveProject(proj)}
                        className="p-1.5 text-slate-400 hover:text-amber-700 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
                        title="Archive Project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
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
            {canEditProject(quickViewProject) && (
              <button
                type="button"
                onClick={() => {
                  const project = quickViewProject;
                  setQuickViewProject(null);
                  handleOpenEditModal(project);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Edit Project
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setActiveProjectForFiles(quickViewProject);
                setQuickViewProject(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Files & Deliverables
            </button>
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
                  Project Summary
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

      {/* CREATE / EDIT PROJECT MODAL */}
      <Modal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title={editingProject ? 'Edit Intern Project' : 'Create New Intern Project'}
      >
        <form onSubmit={handleSaveProject} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Project Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Intern Attendance & QR Verification Mobile App"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              disabled={!mayEditDetails}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Group / Team Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Software Dev Group A"
                value={form.group_name}
                onChange={e => setForm({ ...form, group_name: e.target.value })}
                disabled={!mayEditDetails}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Division / Department</label>
              <select
                value={form.division_id}
                onChange={e => setForm({ ...form, division_id: e.target.value })}
                disabled
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Division</option>
                {divisions.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Project Description</label>
            <textarea
              rows={3}
              placeholder="Describe the objectives, technical features, and goal of this project..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              disabled={!mayEditDetails}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Development Progress & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Progress Status</label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                disabled={!mayUpdateProgress}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="planning">Planning</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Under Review</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-700">Development Progress</label>
                <span className="text-xs font-bold text-blue-700">{form.progress}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={form.progress}
                onChange={e => setForm({ ...form, progress: Number(e.target.value) })}
                disabled={!mayUpdateProgress}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Member Selection Combobox */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Group Members</label>
            
            {mayManageMembers && (
            <div className="relative mb-2" ref={memberDropdownRef}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Select or type intern member name..."
                  value={memberSearch}
                  onFocus={() => setMemberDropdownOpen(true)}
                  onChange={e => {
                    setMemberSearch(e.target.value);
                    setMemberDropdownOpen(true);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredInterns.length === 1 && filteredInterns[0].full_name.toLowerCase() === memberSearch.trim().toLowerCase()) {
                        handleSelectIntern(filteredInterns[0]);
                      } else if (memberSearch.trim()) {
                        handleSelectCustomName(memberSearch);
                      }
                    }
                  }}
                  className="w-full pl-9 pr-8 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setMemberDropdownOpen(!memberDropdownOpen)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {memberDropdownOpen && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {memberSearch.trim() && (
                    <button
                      type="button"
                      onClick={() => handleSelectCustomName(memberSearch)}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-blue-700 bg-blue-50/80 hover:bg-blue-100 flex items-center justify-between transition-colors"
                    >
                      <span className="truncate">Add typed member: "{memberSearch.trim()}"</span>
                      <Plus className="w-3.5 h-3.5 shrink-0 ml-2 text-blue-600" />
                    </button>
                  )}

                  {filteredInterns.length === 0 && !memberSearch.trim() && (
                    <div className="p-3 text-xs text-slate-500 text-center">
                      Type an intern name to add member
                    </div>
                  )}

                  {filteredInterns.map(i => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => handleSelectIntern(i)}
                      className="w-full px-3.5 py-2 text-left text-xs hover:bg-slate-50 flex items-center justify-between transition-colors"
                    >
                      <span className="font-semibold text-slate-800">{i.full_name}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-medium">{i.division_name || 'Intern'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1 max-h-32 overflow-y-auto">
              {form.members.map((m, idx) => (
                <span key={idx} className="bg-blue-50 text-blue-800 text-xs px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1.5 font-medium">
                  {m.full_name || m.name}
                  {mayManageMembers && (
                    <button type="button" onClick={() => handleRemoveMember(m)} className="text-blue-400 hover:text-red-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Repository Links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">GitHub / Code Repo URL</label>
              <input
                type="url"
                placeholder="https://github.com/org/repo"
                value={form.github_repo}
                onChange={e => setForm({ ...form, github_repo: e.target.value })}
                disabled={!mayEditDetails}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Live Demo / Deployment URL</label>
              <input
                type="url"
                placeholder="https://demo.app.com"
                value={form.demo_url}
                onChange={e => setForm({ ...form, demo_url: e.target.value })}
                disabled={!mayEditDetails}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setProjectModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingProject ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      {/* PROJECT FILES & DELIVERABLES MODAL */}
      <Modal
        isOpen={Boolean(activeProjectForFiles)}
        onClose={() => setActiveProjectForFiles(null)}
        title={`Project Deliverables Repository — ${activeProjectForFiles?.title || ''}`}
      >
        <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
          {/* Upload Deliverable Box */}
          {canUploadToProject(activeProjectForFiles) && (
          <form onSubmit={handleFileUpload} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-blue-600" /> Upload Project Deliverable / File
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">File Category</label>
                <select
                  value={fileUploadCategory}
                  onChange={e => setFileUploadCategory(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                >
                  {FILE_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Select File</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={e => setSelectedFile(e.target.files[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={uploadingFile || !selectedFile}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium text-xs rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload File to Directory
            </button>
          </form>
          )}

          {/* Files List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Uploaded Files ({activeProjectForFiles?.files?.length || 0})
            </h4>

            {(!activeProjectForFiles?.files || activeProjectForFiles.files.length === 0) ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-xs">No deliverable files uploaded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {activeProjectForFiles.files.map(file => {
                  const categoryInfo = FILE_CATEGORIES.find(c => c.id === file.file_category) || FILE_CATEGORIES[0];
                  const Icon = categoryInfo.icon;

                  return (
                    <div key={file.id} className="p-3 bg-white flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
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

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={file.public_url}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-semibold flex items-center gap-1 border border-blue-200"
                        >
                          <Download className="w-3.5 h-3.5" /> Download
                        </a>
                        {canDeleteProjectFile(activeProjectForFiles, file) && (
                          <button
                            onClick={() => handleDeleteFile(file.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
