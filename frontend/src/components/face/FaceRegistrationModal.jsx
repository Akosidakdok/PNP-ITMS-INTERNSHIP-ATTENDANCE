import { useState } from 'react';
import { ShieldCheck, X, Camera, RefreshCw, CheckCircle2 } from 'lucide-react';
import FaceCamera from './FaceCamera.jsx';
import { extractFaceEmbedding } from '../../utils/mediapipeService.js';
import backendApi from '../../utils/backendApi.js';
import toast from 'react-hot-toast';

export default function FaceRegistrationModal({ isOpen, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleCapture = async ({ dataUrl, canvas }) => {
    setLoading(true);
    try {
      toast.loading('Generating facial embedding vector...', { id: 'face-reg' });
      
      // Extract embedding using MediaPipe Tasks Vision
      const embedding = await extractFaceEmbedding(canvas);

      toast.loading('Saving face registration to Supabase...', { id: 'face-reg' });
      
      const res = await backendApi.post('/interns/register-face', {
        face_embedding: embedding,
        photo: dataUrl
      });

      toast.success(res.data.message || 'Face registered successfully!', { id: 'face-reg' });
      setSuccess(true);
      if (onSuccess) onSuccess(res.data.user);
    } catch (err) {
      console.error('Registration error:', err);
      const msg = err?.response?.data?.error || err.message || 'Failed to register face';
      toast.error(msg, { id: 'face-reg' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 space-y-0">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Face Verification Registration
              </h2>
              <p className="text-xs text-blue-200">Register your face to enable biometric attendance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {success ? (
            <div className="text-center py-6 space-y-4 animate-scale-in">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Face Registered!
                </h3>
                <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
                  Your facial embedding has been securely generated and saved. You can now use face verification during attendance scanning.
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
                  <li>Look directly into the camera inside the circle</li>
                </ul>
              </div>

              <FaceCamera
                title="Enroll Face Profile"
                onCapture={handleCapture}
                disabled={loading}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
