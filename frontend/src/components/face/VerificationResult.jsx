import { CheckCircle2, XCircle, ShieldAlert, Loader2, UserCheck, RefreshCw } from 'lucide-react';

export default function VerificationResult({
  loading = false,
  verified = false,
  message = '',
  similarity = null,
  onRetry,
  onCancel
}) {
  if (loading) {
    return (
      <div className="card p-6 text-center space-y-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100 shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Verifying Identity...
          </h3>
          <p className="text-xs text-gray-500 mt-1">Comparing face embedding vector with stored account profile...</p>
        </div>
      </div>
    );
  }

  const similarityPercent = similarity != null ? Math.round(similarity * 100) : null;

  return (
    <div className="card p-6 text-center space-y-4 animate-scale-in">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-md ${
        verified
          ? 'bg-emerald-500 text-white'
          : 'bg-red-500 text-white'
      }`}>
        {verified ? <UserCheck className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
      </div>

      <div>
        <h3 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {verified ? 'Face Matched' : 'Verification Failed'}
        </h3>
        <p className={`text-sm mt-1 font-medium ${verified ? 'text-emerald-700' : 'text-red-600'}`}>
          {message || (verified ? 'Identity verified successfully!' : 'Face verification failed.')}
        </p>
      </div>

      {similarityPercent !== null && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-xs text-gray-600 font-semibold">
          <span>Similarity Match:</span>
          <span className={verified ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
            {similarityPercent}%
          </span>
        </div>
      )}

      {!verified && (
        <div className="pt-2 flex gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="btn btn-secondary flex-1 text-xs"
            >
              Cancel
            </button>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
