import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Eye, Trash2, FileText, File, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import api from '../../utils/api.js';
import Modal from '../../components/common/Modal.jsx';
import DocumentPreview from '../../components/common/DocumentPreview.jsx';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const DOCUMENT_TYPES = [
  'Resume', 'Endorsement Letter', 'MOA', 'Medical Certificate',
  'School ID', 'Government ID', 'Parent Consent', 'Weekly Report',
  'Monthly Report', 'Daily Journal', 'Certificate of Completion', 'Other'
];

const statusIcon = { accepted: CheckCircle, revision: AlertCircle, pending: Clock };
const statusColor = { accepted: 'text-green-600', revision: 'text-orange-500', pending: 'text-blue-500' };

export default function MyDocuments() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ document_type: '', file: null });
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
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

  const handleUpload = async () => {
    if (!uploadForm.document_type) { toast.error('Select a document type'); return; }
    if (!uploadForm.file) { toast.error('Select a file'); return; }

    setUploading(true);
    const fd = new FormData();
    fd.append('file', uploadForm.file);
    fd.append('document_type', uploadForm.document_type);

    try {
      const response = await api.post('/documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (response.data && response.data.document) {
        toast.success('Document uploaded successfully!');
        setUploadModal(false);
        setUploadForm({ document_type: '', file: null });
        fetchDocs();
      } else {
        throw new Error(response.data?.error || 'Upload failed with an unknown error.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDelete = async (doc) => {
    if (!confirm(`Delete "${doc.original_name}"?`)) return;
    try {
      await api.delete(`/documents/${doc.id}`);
      toast.success('Document deleted');
      fetchDocs();
    } catch { toast.error('Delete failed'); }
  };

  const formatSize = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

  const getFileIcon = (type) => {
    if (['jpg', 'jpeg', 'png'].includes(type)) return '🖼️';
    if (type === 'pdf') return '📄';
    if (['doc', 'docx'].includes(type)) return '📝';
    return '📁';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>My Documents</h1>
          <p className="text-gray-500 text-sm">{docs.length} documents uploaded</p>
        </div>
        <button id="upload-doc-btn" className="btn btn-primary" onClick={() => setUploadModal(true)}>
          <Upload className="w-4 h-4" /> Upload Document
        </button>
      </div>

      {/* Document Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-600 mb-1">No documents uploaded yet</h3>
          <p className="text-gray-400 text-sm mb-4">Start by uploading your required internship documents</p>
          <button className="btn btn-primary" onClick={() => setUploadModal(true)}>
            <Upload className="w-4 h-4" /> Upload First Document
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map(doc => {
            const StatusIcon = statusIcon[doc.status] || Clock;
            const scol = statusColor[doc.status] || 'text-gray-400';
            return (
              <div key={doc.id} className="card p-4 hover:shadow-lg transition-shadow animate-fade-in">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getFileIcon(doc.file_type)}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{doc.document_type}</p>
                      <p className="text-xs text-gray-400 truncate">{doc.original_name}</p>
                    </div>
                  </div>
                  <StatusIcon className={`w-4 h-4 flex-shrink-0 ${scol}`} />
                </div>

                <div className="space-y-1 text-xs text-gray-500 mb-3">
                  <p>{formatSize(doc.file_size)} &middot; .{doc.file_type.toUpperCase()}</p>
                  <p>Uploaded {format(new Date(doc.upload_date), 'MMM dd, yyyy')}</p>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`badge badge-${doc.status}`}>{doc.status}</span>
                  <div className="flex gap-1">
                    <button id={`preview-my-doc-${doc.id}`} className="btn btn-secondary btn-sm" onClick={() => setPreviewDoc(doc)}>
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                    <button className="btn btn-ghost btn-sm text-red-500" onClick={() => handleDelete(doc)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {doc.admin_remarks && (
                  <div className="mt-3 p-2 bg-orange-50 rounded-lg border border-orange-100">
                    <p className="text-xs text-orange-700">
                      <strong>Admin note:</strong> {doc.admin_remarks}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={uploadModal}
        onClose={() => { setUploadModal(false); setUploadForm({ document_type: '', file: null }); }}
        title="Upload Document"
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setUploadModal(false)}>Cancel</button>
            <button id="confirm-upload-btn" className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="form-group">
            <label className="form-label">Document Type *</label>
            <select className="form-input form-select" value={uploadForm.document_type} onChange={e => setUploadForm(f => ({ ...f, document_type: e.target.value }))}>
              <option value="">Select document type</option>
              {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">File *</label>
            <div
              className="border-2 border-dashed border-blue-200 rounded-xl p-6 text-center cursor-pointer hover:bg-blue-50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {uploadForm.file ? (
                <div>
                  <p className="font-medium text-blue-700">{uploadForm.file.name}</p>
                  <p className="text-xs text-gray-400">{(uploadForm.file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 text-blue-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Click to select a file</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, JPG, PNG (max 25MB)</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={e => setUploadForm(f => ({ ...f, file: e.target.files[0] }))}
            />
          </div>
        </div>
      </Modal>

      <DocumentPreview isOpen={!!previewDoc} onClose={() => setPreviewDoc(null)} document={previewDoc} />
    </div>
  );
}
