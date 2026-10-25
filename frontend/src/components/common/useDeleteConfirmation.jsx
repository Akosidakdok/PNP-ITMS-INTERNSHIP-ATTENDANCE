import { useState } from 'react';
import DeleteConfirmationModal from './DeleteConfirmationModal.jsx';

// For delete actions that previously used the browser's synchronous confirm().
export default function useDeleteConfirmation() {
  const [request, setRequest] = useState(null);
  const confirmDelete = options => setRequest(options);
  const deleteConfirmation = request && (
    <DeleteConfirmationModal isOpen {...request} onClose={() => setRequest(null)}
      onConfirm={async () => {
        const result = await request.onConfirm();
        if (result !== false) setRequest(null);
      }} />
  );
  return { confirmDelete, deleteConfirmation };
}
