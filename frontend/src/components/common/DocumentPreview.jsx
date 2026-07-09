import { useState } from 'react';
import Modal from './Modal.jsx';
import { Download, ZoomIn, ZoomOut, Maximize2, FileText, File } from 'lucide-react';

export default function DocumentPreview({ isOpen, onClose, document: doc }) {
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  if (!doc) return null;

  const fileUrl = `/uploads/${doc.file_path.split(/[\\/]uploads[\\/]/)[1] || doc.file_name}`;
  const type = (doc.file_type || '').toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png'].includes(type);
  const isPdf = type === 'pdf';
  const isOffice = ['doc', 'docx'].includes(type);

  const downloadUrl = fileUrl;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { setZoom(1); setFullscreen(false); onClose(); }}
      title={`Preview: ${doc.original_name}`}
      size={fullscreen ? 'full' : 'xl'}
      footer={
        <div className="flex items-center gap-2">
          {isImage && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} data-tooltip="Zoom out">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setZoom(z => Math.min(3, z + 0.25))} data-tooltip="Zoom in">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setZoom(1)}>Fit</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setFullscreen(v => !v)}>
                <Maximize2 className="w-4 h-4" />
              </button>
            </>
          )}
          <a href={downloadUrl} download={doc.original_name} className="btn btn-primary btn-sm" target="_blank" rel="noreferrer">
            <Download className="w-4 h-4" /> Download
          </a>
        </div>
      }
    >
      <div className="min-h-64 flex items-center justify-center bg-gray-50 rounded-xl overflow-auto">
        {isImage && (
          <div className="overflow-auto w-full h-full flex items-center justify-center p-4" style={{ minHeight: 300 }}>
            <img
              src={fileUrl}
              alt={doc.original_name}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 0.2s', maxWidth: '100%' }}
              className="rounded-lg shadow"
            />
          </div>
        )}

        {isPdf && (
          <div className="w-full" style={{ height: '70vh' }}>
            <iframe
              src={`${fileUrl}#toolbar=1&navpanes=1`}
              className="w-full h-full rounded-xl border-0"
              title={doc.original_name}
            />
          </div>
        )}

        {isOffice && (
          <div className="text-center py-12 px-6">
            <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-10 h-10 text-blue-500" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-1">{doc.original_name}</h3>
            <p className="text-gray-500 text-sm mb-1">Microsoft Word Document</p>
            <p className="text-gray-400 text-xs mb-6">
              {(doc.file_size / 1024 / 1024).toFixed(2)} MB
            </p>
            <p className="text-gray-500 text-sm mb-4">
              In-browser preview is not available for .doc/.docx files.
            </p>
            <a href={downloadUrl} download={doc.original_name} className="btn btn-primary">
              <Download className="w-4 h-4" /> Download to View
            </a>
          </div>
        )}

        {!isImage && !isPdf && !isOffice && (
          <div className="text-center py-12">
            <File className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Preview not available for this file type.</p>
            <a href={downloadUrl} download={doc.original_name} className="btn btn-primary mt-4">
              <Download className="w-4 h-4" /> Download
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}
