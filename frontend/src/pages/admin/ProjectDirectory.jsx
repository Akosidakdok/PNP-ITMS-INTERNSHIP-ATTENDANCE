import { useState, useEffect, useCallback } from 'react';
import {
  FolderGit2, Search, Filter, Download, FileText, Users, Code,
  Presentation, CheckCircle2, Clock, AlertCircle, Layers, ExternalLink,
  Github, BarChart3, FolderKanban, ShieldCheck, Loader2
} from 'lucide-react';
import api from '../../utils/api.js';
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

export default function ProjectDirectory() {
  const [projects, setProjects] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [divisionFilter, setDivisionFilter] = useState('');

  // Selected project for detailed deliverables view
  const [selectedProject, setSelectedProject] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, divRes, statsRes] = await Promise.allSettled([
        api.get('/projects', { params: { search, status: statusFilter, division_id: divisionFilter } }),
        api.get('/divisions'),
        api.get('/projects/stats')
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
  }, [search, statusFilter, divisionFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Divisions</option>
            {divisions.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

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
                <div className="p-5 space-y-4">
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

                  {/* Repository Links */}
                  {(proj.github_repo || proj.demo_url) && (
                    <div className="flex items-center gap-3 text-xs pt-1 border-t border-slate-100">
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

                  <button
                    onClick={() => setSelectedProject(proj)}
                    className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" /> View Directory Files
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
