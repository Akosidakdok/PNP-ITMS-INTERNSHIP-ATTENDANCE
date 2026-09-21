import { useState, useEffect } from 'react';
import { History, Shield, Calendar, User, Clock, AlertCircle } from 'lucide-react';
import Modal from '../common/Modal.jsx';
import api from '../../utils/api.js';
import toast from 'react-hot-toast';

export default function DTRHistoryModal({
  isOpen,
  onClose,
  internId = null,
  internName = null,
}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const endpoint = internId
      ? `/admin/dtr/${internId}/history`
      : '/admin/dtr-history';

    api.get(endpoint)
      .then(res => {
        setHistory(res.data.history || []);
      })
      .catch(err => {
        toast.error(err.response?.data?.error || 'Failed to load DTR modification history.');
      })
      .finally(() => setLoading(false));
  }, [isOpen, internId]);

  const formatTimestamp = (ts) => {
    if (!ts) return 'N/A';
    try {
      return new Date(ts).toLocaleString('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-blue-600" />
          <span>DTR Modification Audit History</span>
          {internName && (
            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full ml-2">
              {internName}
            </span>
          )}
        </div>
      }
      size="xl"
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex items-start gap-2">
          <Shield className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Authorized Superadmin Audit Trail</p>
            <p>Every manual correction and parameter change is recorded permanently for accountability and compliance.</p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p>Loading modification records...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <History className="w-12 h-12 mx-auto text-gray-300 mb-2" />
            <p className="font-semibold text-gray-600">No modification records found</p>
            <p className="text-xs text-gray-400 mt-1">No manual DTR adjustments have been recorded for this criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-3 py-2.5 text-left">Date / Account</th>
                  <th className="px-3 py-2.5 text-left">Field</th>
                  <th className="px-3 py-2.5 text-left">Original Value</th>
                  <th className="px-3 py-2.5 text-left">Modified Value</th>
                  <th className="px-3 py-2.5 text-left">Modified By</th>
                  <th className="px-3 py-2.5 text-left">Modified At</th>
                  <th className="px-3 py-2.5 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {history.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <p className="font-bold text-gray-800">{entry.attendance_date || 'N/A'}</p>
                      <p className="text-[11px] text-gray-500">{entry.account_name}</p>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 font-medium rounded bg-slate-100 text-slate-700">
                        {entry.field_name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-red-600 font-medium">
                      <span className="line-through">{entry.original_value || 'None'}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-green-700 font-bold">
                      {entry.new_value || 'None'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                      <p className="font-semibold">{entry.modified_by_name || 'Superadmin'}</p>
                      <span className="text-[10px] text-purple-700 uppercase font-bold">
                        {entry.modified_by_role || 'superadmin'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">
                      {formatTimestamp(entry.modified_at)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-xs break-words">
                      <span className="italic">"{entry.reason}"</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
