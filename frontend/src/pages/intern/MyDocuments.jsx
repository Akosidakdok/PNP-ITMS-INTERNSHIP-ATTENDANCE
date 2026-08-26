import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Eye, Trash2, FileText, CheckCircle, AlertCircle, Clock, Download, ListChecks, X, AlertTriangle } from 'lucide-react';
import api from '../../utils/api.js';
import Modal from '../../components/common/Modal.jsx';
import DocumentPreview from '../../components/common/DocumentPreview.jsx';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { REQUIRED_DOCUMENTS, UPLOAD_DOCUMENT_TYPES } from '../../utils/documentRequirements.js';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

// File types that cannot be previewed in the browser
const PREVIEWABLE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];

export default function MyDocuments() {
  const [docs, setDocs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm]   = useState({ document_type: '', file: null });
  const [uploading, setUploading]     = useState(false);
  const [previewDoc, setPreviewDoc]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // doc to confirm-delete
  const [deleting, setDeleting]       = useState(false);
  const [dupeConfirm, setDupeConfirm] = useState(null); // For duplicate upload confirmation
  const [showChecklist, setShowChecklist] = useState(false);
  const fileRef = useRef(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/documents');
      setDocs(res.data.documents);
    } catch { toast.error('Failed to load documents'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // 1. Add file size validation on the frontend
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`File too large. Maximum size is 25 MB (selected: ${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      e.target.value = '';
      return;
    }
    setUploadForm(f => ({ ...f, file }));
  };

  const proceedWithUpload = async (formToUpload) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', formToUpload.file);
    fd.append('document_type', formToUpload.document_type);

    try {
      const response = await api.post('/documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (response.data && response.data.document) {
        toast.success('Document uploaded successfully!');
        setUploadModal(false);
        setDupeConfirm(null);
        setUploadForm({ document_type: '', file: null });
        fetchDocs();
      } else {
        throw new Error(response.data?.error || 'Upload failed with an unknown error.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleUpload = async () => {
    if (!uploadForm.document_type) { toast.error('Select a document type'); return; }
    if (!uploadForm.file)          { toast.error('Select a file'); return; }

    // 4. Guard against duplicate document types with a modal
    const existing = docs.find(d => d.document_type === uploadForm.document_type);
    if (existing) {
      setDupeConfirm({ existing, form: uploadForm });
      return; // Stop and wait for modal confirmation
    }

    // If no duplicate, proceed directly
    await proceedWithUpload(uploadForm);
  };

  // ── Delete (with confirmation modal) ───────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/documents/${deleteTarget.id}`);
      toast.success('Document deleted');
      setDeleteTarget(null);
      fetchDocs();
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(false); }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const formatSize = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

  const getFileIcon = (type) => {
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type)) return '🖼️';
    if (type === 'pdf') return '📄';
    if (['doc', 'docx'].includes(type)) return '📝';
    return '📁';
  };

  const isPreviewable = (fileType) => PREVIEWABLE_TYPES.includes(fileType?.toLowerCase());

  // 5. Build checklist data for progress tracking
  // Build checklist: one entry per required type (excluding "Other")
  const checklistTypes = REQUIRED_DOCUMENTS;
  const docsByType = docs.reduce((acc, d) => {
    if (!acc[d.document_type]) acc[d.document_type] = [];
    acc[d.document_type].push(d);
    return acc;
  }, {});

  const checklistStats = {
    done:    checklistTypes.filter(requirement => docsByType[requirement.value]?.some(d => d.status === 'accepted')).length,
    pending: checklistTypes.filter(requirement => !docsByType[requirement.value]?.some(d => d.status === 'accepted') && docsByType[requirement.value]?.some(d => d.status === 'pending')).length,
    revision: checklistTypes.filter(requirement => !docsByType[requirement.value]?.some(d => d.status === 'accepted') && docsByType[requirement.value]?.some(d => d.status === 'revision')).length,
    missing: checklistTypes.filter(requirement => !docsByType[requirement.value]).length,
  };

  return (
    <div className="intern-mobile-page intern-documents-page space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>My Documents</h1>
          <p className="text-gray-500 text-sm">{docs.length} document{docs.length !== 1 ? 's' : ''} uploaded</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            id="toggle-checklist-btn"
            className="btn btn-secondary flex-1 sm:flex-none"
            onClick={() => setShowChecklist(v => !v)}
            title="Toggle document checklist"
          >
            <ListChecks className="w-4 h-4" />
            <span className="hidden sm:inline">Checklist</span>
          </button>
          <button id="upload-doc-btn" className="btn btn-primary flex-1 sm:flex-none" onClick={() => setUploadModal(true)}>
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>
      </div>

      {/* 5. Document Checklist UI */}
      {showChecklist && (
        <div className="card p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-gray-800 text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Document Checklist
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="text-green-600 font-medium">{checklistStats.done} accepted</span>
                {' · '}
                <span className="text-blue-500 font-medium">{checklistStats.pending} pending</span>
                {' · '}
                <span className="text-orange-500 font-medium">{checklistStats.revision} for revision</span>
                {' · '}
                <span className="text-gray-400 font-medium">{checklistStats.missing} not yet uploaded</span>
              </p>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowChecklist(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {checklistTypes.map(requirement => {
              const entries = docsByType[requirement.value] || [];
              const accepted = entries.some(d => d.status === 'accepted');
              const revision = entries.some(d => d.status === 'revision');
              const pending  = entries.some(d => d.status === 'pending');
              const missing  = entries.length === 0;

              let Icon = Clock, iconClass = 'text-gray-300', labelClass = 'text-gray-400', label = 'Not uploaded';
              if (accepted) { Icon = CheckCircle; iconClass = 'text-green-500'; labelClass = 'text-green-600'; label = 'Accepted'; }
              else if (revision) { Icon = AlertCircle; iconClass = 'text-orange-500'; labelClass = 'text-orange-600'; label = 'Needs revision'; }
              else if (pending)  { Icon = Clock;        iconClass = 'text-blue-400';   labelClass = 'text-blue-500';   label = 'Pending review'; }

              return (
                <div
                  key={requirement.value}
                  title={requirement.details}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                    accepted ? 'bg-green-50 border-green-100' :
                    revision ? 'bg-orange-50 border-orange-100' :
                    pending  ? 'bg-blue-50 border-blue-100' :
                               'bg-gray-50 border-gray-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-700">{requirement.label}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-gray-400">{requirement.details}</p>
                    <p className={`text-xs ${labelClass} font-medium`}>{label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Document Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {docs.map(doc => (
          <div key={doc.id} className="card p-4 flex flex-col justify-between animate-fade-in-up">
            <div>
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-xl bg-blue-50 mb-3">
                  <span className="text-lg">{getFileIcon(doc.file_type)}</span>
                </div>
                <span className={`badge badge-${doc.status}`}>{doc.status}</span>
              </div>
              <p className="font-bold text-sm text-gray-800 truncate">{doc.document_type}</p>
              <p className="text-xs text-gray-400 truncate">{doc.original_name}</p>
              <p className="text-xs text-gray-400">{formatSize(doc.file_size)} · {format(new Date(doc.upload_date), 'MMM dd, yyyy')}</p>
              {doc.status === 'revision' && doc.admin_remarks && (
                <div className="mt-2 p-2 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-700">
                  <strong>Remarks:</strong> {doc.admin_remarks}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 mt-4 pt-3 border-t border-gray-100">
              {/* 6. Conditionally show Preview or Download */}
              {isPreviewable(doc.file_type) ? (
                <button className="btn btn-secondary btn-sm flex-1" onClick={() => setPreviewDoc(doc)}>
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
              ) : (
                <a href={doc.public_url} download className="btn btn-secondary btn-sm flex-1" target="_blank" rel="noopener noreferrer">
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              )}
              <button className="btn btn-danger btn-icon btn-sm" onClick={() => setDeleteTarget(doc)}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {loading && docs.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
        </div>
      )}

      {!loading && docs.length === 0 && (
        <div className="text-center py-12 text-gray-400 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <h3 className="font-semibold text-gray-600">No documents uploaded yet</h3>
          <p className="text-sm mt-1">Click the "Upload" button to get started.</p>
        </div>
      )}

      {/* Upload Modal */}
      <Modal isOpen={uploadModal} onClose={() => setUploadModal(false)} title="Upload Document" size="md"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setUploadModal(false)}>Cancel</button>
          <button id="confirm-upload-btn" className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="form-group">
            <label className="form-label">Document Type *</label>
            <select className="form-input form-select" value={uploadForm.document_type} onChange={e => setUploadForm(f => ({ ...f, document_type: e.target.value }))}>
              <option value="">Select a type...</option>
              {UPLOAD_DOCUMENT_TYPES.map(requirement => <option key={requirement.value} value={requirement.value}>{requirement.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">File *</label>
            <input type="file" ref={fileRef} className="form-input" onChange={handleFileChange} />
            <p className="text-xs text-gray-400 mt-1">Max file size: 25 MB</p>
          </div>
          {uploadForm.file && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p><strong>File:</strong> {uploadForm.file.name}</p>
              <p><strong>Size:</strong> {formatSize(uploadForm.file.size)}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* 2. Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Document"
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button id="confirm-delete-btn" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </>
        }
      >
        {deleteTarget && <p>Are you sure you want to delete "<strong>{deleteTarget.original_name}</strong>"? This action cannot be undone.</p>}
      </Modal>

      {/* 4. Duplicate Upload Confirmation Modal */}
      <Modal
        isOpen={!!dupeConfirm}
        onClose={() => setDupeConfirm(null)}
        title="Duplicate Document Type"
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDupeConfirm(null)}>Cancel</button>
            <button
              id="confirm-dupe-upload-btn"
              className="btn btn-primary"
              onClick={() => proceedWithUpload(dupeConfirm.form)}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload Anyway'}
            </button>
          </>
        }
      >
        {dupeConfirm && (
          <div className="text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-orange-400 mx-auto" />
            <p className="text-gray-600">
              You already have a "<strong>{dupeConfirm.existing.document_type}</strong>" uploaded (status: {dupeConfirm.existing.status}).
              <br /><br />
              Are you sure you want to upload another one?
            </p>
          </div>
        )}
      </Modal>

      {/* Document Preview */}
      <DocumentPreview isOpen={!!previewDoc} onClose={() => setPreviewDoc(null)} document={previewDoc} />
    </div>
  );
}
