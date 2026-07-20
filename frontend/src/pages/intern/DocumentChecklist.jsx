import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';
import api from '../../utils/api.js';
import toast from 'react-hot-toast';

const DOCUMENT_TYPES = [
  'Resume', 'Endorsement Letter', 'MOA', 'Medical Certificate',
  'School ID', 'Government ID', 'Parent Consent', 'Weekly Report',
  'Monthly Report', 'Daily Journal', 'Certificate of Completion', 'Other'
];

export default function DocumentChecklist({ internId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = internId ? { intern_id: internId } : {};
      const res = await api.get('/documents', { params });
      setDocs(res.data.documents);
    } catch {
      toast.error('Failed to load document checklist');
    } finally {
      setLoading(false);
    }
  }, [internId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Build checklist data
  const checklistTypes = DOCUMENT_TYPES.filter(t => t !== 'Other');
  const docsByType = docs.reduce((acc, d) => {
    if (!acc[d.document_type]) acc[d.document_type] = [];
    acc[d.document_type].push(d);
    return acc;
  }, {});

  const checklistStats = {
    done: checklistTypes.filter(t => docsByType[t]?.some(d => d.status === 'accepted')).length,
    pending: checklistTypes.filter(t => !docsByType[t]?.some(d => d.status === 'accepted') && docsByType[t]?.some(d => d.status === 'pending')).length,
    revision: checklistTypes.filter(t => !docsByType[t]?.some(d => d.status === 'accepted') && docsByType[t]?.some(d => d.status === 'revision')).length,
    missing: checklistTypes.filter(t => !docsByType[t]).length,
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-4">
        <span className="text-green-600 font-medium">{checklistStats.done} accepted</span>
        {' · '}
        <span className="text-blue-500 font-medium">{checklistStats.pending} pending</span>
        {' · '}
        <span className="text-orange-500 font-medium">{checklistStats.revision} for revision</span>
        {' · '}
        <span className="text-gray-400 font-medium">{checklistStats.missing} not yet uploaded</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {checklistTypes.map(type => {
          const entries = docsByType[type] || [];
          const accepted = entries.some(d => d.status === 'accepted');
          const revision = entries.some(d => d.status === 'revision');
          const pending = entries.some(d => d.status === 'pending');
          
          let Icon = Clock, iconClass = 'text-gray-300', labelClass = 'text-gray-400', label = 'Not uploaded';
          if (accepted) { Icon = CheckCircle; iconClass = 'text-green-500'; labelClass = 'text-green-600'; label = 'Accepted'; }
          else if (revision) { Icon = AlertCircle; iconClass = 'text-orange-500'; labelClass = 'text-orange-600'; label = 'Needs revision'; }
          else if (pending) { Icon = Clock; iconClass = 'text-blue-400'; labelClass = 'text-blue-500'; label = 'Pending review'; }

          return (
            <div
              key={type}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                accepted ? 'bg-green-50 border-green-100' :
                revision ? 'bg-orange-50 border-orange-100' :
                pending ? 'bg-blue-50 border-blue-100' :
                           'bg-gray-50 border-gray-100'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-700 truncate">{type}</p>
                <p className={`text-xs ${labelClass} font-medium`}>{label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}