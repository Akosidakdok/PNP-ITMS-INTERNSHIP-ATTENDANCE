import { useState, useEffect, useCallback } from 'react';
import { Eye, FileText } from 'lucide-react';
import api from '../../utils/api.js';
import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import DocumentPreview from '../../components/common/DocumentPreview.jsx';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

/** Delays invoking `fn` until `delay` ms have elapsed since the last call. */
function useDebounce(value, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debouncedValue;
}

export default function DocumentReview() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [reviewForm, setReviewForm] = useState({ status: 'accepted', admin_remarks: '' });
  const [saving, setSaving] = useState(false);

  // Only fire the API call once the user has stopped typing for 350ms
  const debouncedSearch = useDebounce(searchQuery, 350);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
      };
      const res = await api.get('/documents', { params });
      setDocs(res.data.documents);
    } catch { toast.error('Failed to load documents'); }
    finally { setLoading(false); }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleReview = async (docId) => {
    setSaving(true);
    try {
      await api.patch(`/documents/${docId}/status`, reviewForm);
      toast.success(`Document marked as ${reviewForm.status}`);
      setPreviewDoc(null);
      fetchDocs();
    } catch { toast.error('Review failed'); }
    finally { setSaving(false); }
  };

  const formatSize = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

  const openReview = (doc) => {
    setPreviewDoc(doc);
    setReviewForm({
      status: doc.status === 'pending' ? 'accepted' : doc.status,
      admin_remarks: doc.admin_remarks || '',
    });
  };

  const columns = [
    {
      key: 'full_name', label: 'Intern',
      render: v => <p className="font-medium text-sm text-gray-800">{v}</p>
    },
    {
      key: 'document_type', label: 'Document Type',
      render: (v, row) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-800">{v}</p>
            <p className="text-xs text-gray-400">{row.original_name}</p>
          </div>
        </div>
      )
    },
    {
      key: 'file_type', label: 'Type',
      render: (v, row) => (
        <div>
          <span className="badge badge-active uppercase">{v}</span>
          <p className="text-xs text-gray-400 mt-0.5">{formatSize(row.file_size)}</p>
        </div>
      )
    },
    {
      key: 'upload_date', label: 'Uploaded',
      render: v => <span className="text-xs text-gray-500">{format(new Date(v), 'MMM dd, yyyy')}</span>
    },
    {
      key: 'status', label: 'Status',
      render: v => <span className={`badge badge-${v}`}>{v}</span>
    },
    {
      key: 'id', label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-1">
          <button id={`review-doc-${row.id}`} className="btn btn-primary btn-sm" onClick={() => openReview(row)}>
            <Eye className="w-3.5 h-3.5" /> View & Review
          </button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Document Review</h1>
        <p className="text-gray-500 text-sm">Review and manage intern-submitted documents</p>
      </div>

      <div className="flex flex-col md:flex-row gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          {['', 'pending', 'accepted', 'revision'].map(s => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative md:max-w-xs w-full">
          <input
            type="text"
            className="form-input form-input-sm w-full"
            placeholder="Search by document name or type…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {/* Subtle loading indicator while debounce is in-flight */}
          {searchQuery !== debouncedSearch && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      <div className="table-responsive">
        <DataTable
          columns={columns}
          data={docs}
          loading={loading}
          total={docs.length}
          page={1}
          limit={docs.length || 1}
          onPageChange={() => {}} // No-op as pagination is not implemented here
          emptyMessage="No documents found"
        />
      </div>

      {/* Unified Document Preview & Review Modal */}
      {previewDoc && (
        <Modal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          title={`Review: ${previewDoc.document_type}`}
          size="lg"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setPreviewDoc(null)}>Cancel</button>
              <button id="confirm-review-btn" className="btn btn-primary" onClick={() => handleReview(previewDoc.id)} disabled={saving}>
                {saving ? 'Saving...' : 'Save Review'}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <DocumentPreview document={previewDoc} isEmbedded={true} />
            </div>
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-xl p-3 text-sm">
                <p><strong>{previewDoc.full_name}</strong></p>
                <p className="text-gray-500">{previewDoc.original_name}</p>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input form-select" value={reviewForm.status} onChange={e => setReviewForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="accepted">Accept</option>
                  <option value="revision">Needs Revision</option>
                  <option value="pending">Reset to Pending</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Admin Remarks</label>
                <textarea className="form-input" rows={5} value={reviewForm.admin_remarks} onChange={e => setReviewForm(f => ({ ...f, admin_remarks: e.target.value }))} placeholder="Add feedback for the intern..." />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
