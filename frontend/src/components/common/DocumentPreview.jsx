import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileText, ExternalLink, AlertTriangle } from 'lucide-react';

/**
 * DocumentPreview component.
 *
 * Two modes:
 * 1. Standalone modal (default): Renders a full-screen overlay modal via a portal.
 *    Usage: <DocumentPreview isOpen={!!doc} onClose={...} document={doc} />
 *
 * 2. Embedded (isEmbedded=true): Renders the preview content inline, no modal wrapper.
 *    Use this when the component is already inside another Modal.
 *    Usage: <DocumentPreview document={doc} isEmbedded />
 */
export default function DocumentPreview({ isOpen, onClose, document: doc, isEmbedded = false }) {
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Reset viewer state whenever the document changes
  useEffect(() => {
    setLoadError(false);
    setLoading(true);
  }, [doc?.id]);

  // Prevent background scroll when the standalone modal is open
  useEffect(() => {
    if (isEmbedded) return;
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, isEmbedded]);

  // Early exits — keep these AFTER all hooks
  const shouldRender = isEmbedded ? !!doc : (isOpen && !!doc);
  if (!shouldRender) return null;

  const fileUrl = doc.public_url;
  const fileType = doc.file_type?.toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType);
  const isPdf = fileType === 'pdf';
  // Hash params hide chrome in the browser's native PDF viewer
  const viewerUrl = isPdf ? `${fileUrl}#toolbar=0&navpanes=0` : fileUrl;

  // ── Shared UI pieces ───────────────────────────────────────────────────────

  const headerBar = (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <p className="text-sm font-medium text-gray-700 truncate">{doc.original_name}</p>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm"
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="hidden sm:inline ml-1">Open</span>
        </a>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={doc.original_name}
          className="btn btn-secondary btn-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline ml-1">Download</span>
        </a>
        {!isEmbedded && onClose && (
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={onClose}
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );

  const viewerBody = (
    <div className="relative flex-1 bg-gray-200 overflow-hidden">
      {isImage ? (
        <>
          {loading && !loadError && <LoadingSpinner />}
          {loadError ? (
            <PreviewError fileName={doc.original_name} fileUrl={fileUrl} />
          ) : (
            <img
              src={fileUrl}
              alt={doc.original_name}
              className="w-full h-full object-contain"
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setLoadError(true); }}
            />
          )}
        </>
      ) : isPdf ? (
        <>
          {loading && !loadError && <LoadingSpinner />}
          {loadError ? (
            <PreviewError fileName={doc.original_name} fileUrl={fileUrl} />
          ) : (
            <iframe
              key={doc.id}
              src={viewerUrl}
              className="w-full h-full border-0"
              title={doc.original_name}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setLoadError(true); }}
            />
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <FileText className="w-16 h-16 text-gray-300 mb-4" />
          <p className="text-lg font-semibold text-gray-700 mb-1">Preview not available</p>
          <p className="text-sm text-gray-500 mb-4">
            .{doc.file_type?.toUpperCase()} files cannot be previewed in the browser.
          </p>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={doc.original_name}
            className="btn btn-primary"
          >
            <Download className="w-4 h-4 mr-1" /> Download File
          </a>
        </div>
      )}
    </div>
  );

  // ── Embedded mode ──────────────────────────────────────────────────────────
  if (isEmbedded) {
    return (
      <div
        className="flex flex-col rounded-xl overflow-hidden border border-gray-200 bg-white"
        style={{ height: '60vh', minHeight: '320px' }}
      >
        {headerBar}
        {viewerBody}
      </div>
    );
  }

  // ── Standalone full-screen portal modal ────────────────────────────────────
  const modal = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'rgba(0,18,64,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="card w-full animate-scale-in flex flex-col overflow-hidden"
        style={{ maxWidth: '72rem', height: 'calc(100vh - 3rem)', maxHeight: '900px' }}
      >
        {headerBar}
        {viewerBody}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
      <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function PreviewError({ fileName, fileUrl }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <AlertTriangle className="w-12 h-12 text-orange-400 mb-3" />
      <p className="text-base font-semibold text-gray-700 mb-1">Failed to load preview</p>
      <p className="text-sm text-gray-500 mb-4">{fileName}</p>
      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
        <ExternalLink className="w-4 h-4 mr-1" /> Open in New Tab
      </a>
    </div>
  );
}