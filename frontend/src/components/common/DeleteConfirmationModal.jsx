import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal.jsx';

export default function DeleteConfirmationModal({ isOpen, ...props }) {
  // Unmount between openings so a previous DELETE can never confirm a new item.
  if (!isOpen) return null;
  return <Confirmation key={props.itemName} {...props} />;
}

function Confirmation({ title, itemName, warning, onClose, onConfirm, busy = false, confirmId }) {
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const inputRef = useRef(null);
  const callbacks = useRef({ onClose, busy: false });
  const id = useId();
  const isBusy = busy || submitting;
  callbacks.current = { onClose, busy: isBusy };

  useEffect(() => {
    const previousFocus = document.activeElement;
    inputRef.current?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!callbacks.current.busy) callbacks.current.onClose();
      }
      if (event.key === 'Tab') {
        const panel = inputRef.current?.closest('.modal-panel');
        const controls = [...(panel?.querySelectorAll('button:not(:disabled), input:not(:disabled)') || [])];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const close = () => { if (!isBusy) onClose(); };
  const submit = async () => {
    if (confirmation !== 'DELETE' || isBusy || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={close} title={title} size="sm" role="alertdialog"
      describedBy={`${id}-warning`} zIndex={10000}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={close} disabled={isBusy}>Cancel</button>
        <button type="button" id={confirmId} className="btn btn-primary" onClick={submit}
          disabled={isBusy || confirmation !== 'DELETE'}>
          {isBusy ? 'Deleting...' : 'Delete Permanently'}
        </button>
      </>}>
      <div className="space-y-4 text-sm" aria-busy={isBusy}>
        <div id={`${id}-warning`} className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" aria-hidden="true" />
          <p>{warning || 'This permanently removes the selected item and cannot be undone.'}</p>
        </div>
        <p className="font-semibold text-gray-800 break-words">{itemName}</p>
        <div className="form-group">
          <label htmlFor={`${id}-confirmation`} className="form-label">Type DELETE to confirm</label>
          <input ref={inputRef} id={`${id}-confirmation`} className="form-input font-semibold"
            value={confirmation} onChange={event => setConfirmation(event.target.value)}
            placeholder="DELETE" autoComplete="off" spellCheck={false} disabled={isBusy} />
        </div>
      </div>
    </Modal>
  );
}
