import Modal from './Modal.jsx';
import { X, Download, FileText } from 'lucide-react';

export default function DocumentPreview({ isOpen, onClose, document }) {
  if (!isOpen || !document) return null;

  // Use the public_url from Supabase Storage.
  // This URL points directly to the file on Supabase's CDN.
  let fileUrl = document.public_url;

  const isImage = ['jpg', 'jpeg', 'png', 'gif'].includes(document.file_type?.toLowerCase());
  const isPdf = document.file_type?.toLowerCase() === 'pdf';

  // For PDFs, append parameters to the URL to hide the default browser UI for a cleaner, embedded look.
  if (isPdf) { fileUrl += '#toolbar=0&navpanes=0'; }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" title="">
      {/* Custom Header / Controls */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <p className="text-sm font-medium text-gray-700 truncate">{document.original_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" download={document.original_name} className="btn btn-secondary btn-sm">
            <Download className="w-3.5 h-3.5" /> Download
          </a>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Document Content */}
      <div className="relative bg-gray-200 h-[90vh] overflow-hidden">
        {isImage ? (
          <img src={fileUrl} alt={document.original_name} className="w-full h-full object-contain" />
        ) : isPdf ? (
          <iframe src={fileUrl} className="w-full h-full border-0" title={document.original_name} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <p className="text-lg font-semibold text-gray-700">Preview not available for this file type.</p>
            <p className="text-sm text-gray-500 mb-4">({document.original_name})</p>
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" download={document.original_name} className="btn btn-primary">
              Download File
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}