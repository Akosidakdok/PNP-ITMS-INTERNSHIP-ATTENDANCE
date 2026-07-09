import { useState, useEffect, useCallback } from 'react';
import { Eye, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import api from '../../utils/api.js';
import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import DocumentPreview from '../../components/common/DocumentPreview.jsx';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function DocumentReview() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [preview, setPreview] = useState(null);
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewForm, setReviewForm] = useState({ status: 'accepted', admin_remarks: '' });
  const [saving, setSaving] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/documents', { params: { status: statusFilter || undefined } });
      setDocs(res.data.documents);
    } catch { toast.error('Failed to load documents'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleReview = async () => {
    setSaving(true);
    try {
      await api.patch(`/documents/${reviewModal.id}/status`, reviewForm);
      toast.success(`Document marked as ${reviewForm.status}`);
      setReviewModal(null);
      fetchDocs();
    } catch { toast.error('Review failed'); }
    finally { setSaving(false); }
  };

  const formatSize = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

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
          <button id={`preview-doc-${row.id}`} className="btn btn-secondary btn-sm" onClick={() => setPreview(row)}>
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
          <button id={`review-doc-${row.id}`} className="btn btn-primary btn-sm" onClick={() => { setReviewModal(row); setReviewForm({ status: 'accepted', admin_remarks: '' }); }}>
            Review
          </button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Document Review</h1>
        <p className="text-gray-500 text-sm">Review and manage intern-submitted documents</p>
      </div>

      <div className="flex gap-2">
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

      {/* Review Modal */}
      <Modal
        isOpen={!!reviewModal}
        onClose={() => setReviewModal(null)}
        title="Review Document"
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setReviewModal(null)}>Cancel</button>
            <button id="confirm-review-btn" className="btn btn-primary" onClick={handleReview} disabled={saving}>
              {saving ? 'Saving...' : 'Save Review'}
            </button>
          </>
        }
      >
        {reviewModal && (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-xl p-3 text-sm">
              <p><strong>{reviewModal.document_type}</strong></p>
              <p className="text-gray-500">{reviewModal.full_name}</p>
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
              <textarea className="form-input" rows={3} value={reviewForm.admin_remarks} onChange={e => setReviewForm(f => ({ ...f, admin_remarks: e.target.value }))} placeholder="Add feedback..." />
            </div>
          </div>
        )}
      </Modal>

      {/* Document Preview */}
      <DocumentPreview isOpen={!!preview} onClose={() => setPreview(null)} document={preview} />
    </div>
  );
}
