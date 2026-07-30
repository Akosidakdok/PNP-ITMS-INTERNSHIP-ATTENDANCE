import { useEffect, useState } from 'react';
import { ShieldCheck, X, CheckCircle2 } from 'lucide-react';
import FaceCamera from './FaceCamera.jsx';
import { extractSecureFacePackage } from '../../utils/faceIdentityService.js';
import backendApi from '../../utils/backendApi.js';
import toast from 'react-hot-toast';

export default function FaceRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
  intern,
  approvedRequest = null,
  selfRenewal = false,
}) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [renewalReason, setRenewalReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLoading(false);
      setSuccess(false);
      setRenewalReason(approvedRequest?.reason || '');
    }
  }, [isOpen, intern?.id, approvedRequest?.id]);

  if (!isOpen) return null;

  const reasonCharactersNeeded = Math.max(0, 10 - renewalReason.trim().length);
  const reasonIncomplete = !selfRenewal
    && intern?.face_registered
    && reasonCharactersNeeded > 0;

  const handleCapture = async ({ dataUrl, canvases }) => {
    if (reasonIncomplete) {
      toast.error(`Add ${reasonCharactersNeeded} more character${reasonCharactersNeeded === 1 ? '' : 's'} to the renewal reason`);
      return;
    }

    setLoading(true);
    try {
      toast.loading('Verifying identity, liveness, and 3 face samples...', { id: 'face-reg' });
      
      const embedding = await extractSecureFacePackage(canvases);

      toast.loading('Saving face registration to Supabase...', { id: 'face-reg' });
      
      if (!intern?.id) {
        throw new Error('Select an intern before starting biometric enrollment');
      }

      const endpoint = selfRenewal
        ? '/interns/me/renew-face'
        : `/interns/${intern.id}/register-face`;
      const res = await backendApi.post(endpoint, {
        face_embedding: embedding,
        photo: dataUrl,
        renewal_reason: renewalReason.trim() || undefined,
        request_id: approvedRequest?.id || undefined,
      });

      toast.success(res.data.message || 'Face registered successfully!', { id: 'face-reg' });
      setSuccess(true);
      if (onSuccess) onSuccess(res.data.user);
    } catch (err) {
      console.error('Registration error:', err);
      const msg = err?.response?.data?.error || err.message || 'Failed to register face';
      toast.error(msg, { id: 'face-reg' });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        className="card rounded-3xl shadow-2xl max-w-lg w-full max-h-[calc(100vh-2rem)] overflow-hidden border border-gray-100 flex flex-col my-auto"
      >
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {selfRenewal
                  ? 'Update Approved Face ID'
                  : intern?.face_registered
                    ? 'Renew Face Enrollment'
                    : 'Authorized Face Enrollment'}
              </h2>
              <p className="text-xs text-blue-200">
                {selfRenewal
                  ? 'Your approved one-time biometric update'
                  : `Registering biometric profile for ${intern?.full_name || 'selected intern'}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            aria-label="Close face enrollment"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto min-h-0">
          {success ? (
            <div className="text-center py-6 space-y-4 animate-scale-in">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {selfRenewal || intern?.face_registered ? 'Face ID Updated!' : 'Face Registered!'}
                </h3>
                <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
                  The biometric profile is now active for attendance verification and the event was added to enrollment history.
                </p>
              </div>
              <button
                onClick={onClose}
                className="btn btn-primary px-8"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">Tips for clear face registration:</p>
                <ul className="list-disc ml-4 space-y-0.5 text-amber-700">
                  <li>Ensure good room lighting on your face</li>
                  <li>Remove sunglasses or face coverings</li>
                  <li>Confirm the selected intern is physically present</li>
                  <li>Have the intern look directly into the camera</li>
                </ul>
              </div>

              {(selfRenewal || intern?.face_registered) && (
                <div className="form-group">
                  <label className="form-label">
                    Renewal reason
                  </label>
                  <textarea
                    className="form-input min-h-20 resize-y"
                    maxLength={500}
                    readOnly={selfRenewal}
                    value={selfRenewal ? approvedRequest?.reason || '' : renewalReason}
                    onChange={event => setRenewalReason(event.target.value)}
                    placeholder="Explain why this Face ID needs to be replaced"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    {selfRenewal
                      ? 'This is the reason approved by staff and will be saved in enrollment history.'
                      : `${renewalReason.trim().length}/500 characters · minimum 10`}
                  </p>
                  {reasonIncomplete && renewalReason.trim().length > 0 && (
                    <p className="text-xs font-semibold text-red-600 mt-1">
                      Add {reasonCharactersNeeded} more character{reasonCharactersNeeded === 1 ? '' : 's'} to enable Face ID capture.
                    </p>
                  )}
                </div>
              )}

              <FaceCamera
                title={selfRenewal || intern?.face_registered ? 'Capture Updated Face ID' : 'Enroll Face Profile'}
                onCapture={handleCapture}
                disabled={loading || reasonIncomplete}
                disabledMessage={reasonIncomplete
                  ? `Renewal reason needs ${reasonCharactersNeeded} more character${reasonCharactersNeeded === 1 ? '' : 's'}.`
                  : ''}
                actionLabel={reasonIncomplete
                  ? `Complete Renewal Reason (${reasonCharactersNeeded} more)`
                  : selfRenewal || intern?.face_registered
                    ? 'Capture & Update Face ID'
                    : 'Capture & Enroll Face ID'}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
