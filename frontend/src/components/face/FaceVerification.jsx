import { useState } from 'react';
import FaceCamera from './FaceCamera.jsx';
import VerificationResult from './VerificationResult.jsx';
import { extractSecureFacePackage } from '../../utils/faceIdentityService.js';
import toast from 'react-hot-toast';

export default function FaceVerification({ onVerified, title = "Face Verification" }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { verified, message, similarity }

  const handleCapture = async ({ dataUrl, canvases }) => {
    setLoading(true);
    setResult(null);

    try {
      const embedding = await extractSecureFacePackage(canvases);

      if (onVerified) {
        // Pass photo base64 & embedding vector to parent
        const res = await onVerified({ photo: dataUrl, face_embedding: embedding });
        if (res) {
          setResult(res);
        }
      }
    } catch (err) {
      console.error('Face verification error:', err);
      const errMsg = err?.response?.data?.error || err?.message || 'Face verification failed.';
      toast.error(errMsg);
      setResult({
        verified: false,
        message: errMsg,
        similarity: err?.response?.data?.similarity ?? 0
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading || result) {
    return (
      <VerificationResult
        loading={loading}
        verified={result?.verified}
        message={result?.message}
        similarity={result?.similarity}
        onRetry={() => setResult(null)}
      />
    );
  }

  return (
    <FaceCamera
      title={title}
      onCapture={handleCapture}
    />
  );
}
