import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { analyzeFaceQuality } from '../../utils/mediapipeService.js';

export default function FaceCamera({ onCapture, disabled = false, title = "Face Scanner" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [statusMessage, setStatusMessage] = useState('Initializing camera...');
  const [statusType, setStatusType] = useState('info'); // 'info', 'warning', 'success', 'error'
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        setCameraError('');
        setStatusMessage('Requesting camera access...');
        setStatusType('info');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });

        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (active) {
              setVideoReady(true);
              setStatusMessage('Position your face inside the circle');
              setStatusType('info');
            }
          };
        }
      } catch (err) {
        console.error('Camera access error:', err);
        if (!active) return;
        let errMsg = 'Failed to access camera.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errMsg = 'Camera permission denied. Please enable camera access in your browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errMsg = 'No camera device found on your device.';
        }
        setCameraError(errMsg);
        setStatusMessage(errMsg);
        setStatusType('error');
      }
    }

    startCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !videoReady || isProcessing || disabled) return;
    setIsProcessing(true);
    setStatusMessage('Detecting face quality...');
    setStatusType('info');

    try {
      const video = videoRef.current;
      const rawW = video.videoWidth || 640;
      const rawH = video.videoHeight || 480;

      const canvas = document.createElement('canvas');
      canvas.width = rawW;
      canvas.height = rawH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      // Un-mirror canvas so face embedding is geometrically standard
      ctx.drawImage(video, 0, 0, rawW, rawH);

      // Perform face quality check with MediaPipe
      const quality = await analyzeFaceQuality(canvas);
      if (!quality.valid) {
        setStatusMessage(quality.error || 'Face check failed');
        setStatusType('warning');
        setIsProcessing(false);
        return;
      }

      setStatusMessage('Face detected! Processing...');
      setStatusType('success');

      // Date/time stamp strictly in Asia/Manila (Philippines)
      const options = {
        timeZone: 'Asia/Manila',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
      };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(new Date());
      const getP = (type) => parts.find(p => p.type === type)?.value || '';
      const stampText = `${getP('year')}-${getP('month')}-${getP('day')} ${getP('hour')}:${getP('minute')}:${getP('second')} ${getP('dayPeriod')}`;

      ctx.font = 'bold 18px Outfit, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 4;
      ctx.lineWidth = 3;
      ctx.strokeText(stampText, 15, canvas.height - 20);
      ctx.fillText(stampText, 15, canvas.height - 20);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

      if (onCapture) {
        await onCapture({ dataUrl, canvas, quality });
      }
    } catch (err) {
      console.error('Error during capture:', err);
      setStatusMessage(err.message || 'Error capturing face.');
      setStatusType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-600" />
          {title}
        </h3>
        {videoReady && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Camera Active
          </span>
        )}
      </div>

      {/* Camera Container with Face Oval Mask */}
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-gray-200 shadow-inner flex items-center justify-center">
        {cameraError ? (
          <div className="p-6 text-center text-red-400 space-y-2">
            <ShieldAlert className="w-10 h-10 mx-auto text-red-500" />
            <p className="text-sm font-medium">{cameraError}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />

            {/* Face Oval Overlay Guide */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`w-48 h-60 sm:w-56 sm:h-72 rounded-[50%] border-2 transition-all duration-300 ${
                statusType === 'success' ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.4)]' :
                statusType === 'warning' ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_20px_rgba(251,191,36,0.3)]' :
                statusType === 'error' ? 'border-red-500 bg-red-500/10' :
                'border-blue-400/80 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
              }`}>
                {/* Target crosshairs */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-white/40"></div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-white/40"></div>
              </div>
            </div>

            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm text-white text-[10px] px-2.5 py-1 rounded-full font-bold tracking-wide uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              MediaPipe Vision
            </div>
          </>
        )}
      </div>

      {/* Dynamic Status Feedback */}
      <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium transition-all ${
        statusType === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
        statusType === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
        statusType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
        'bg-blue-50 text-blue-700 border border-blue-200'
      }`}>
        {statusType === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
        {statusType === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />}
        {statusType === 'error' && <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />}
        {statusType === 'info' && <RefreshCw className={`w-4 h-4 text-blue-600 flex-shrink-0 ${isProcessing ? 'animate-spin' : ''}`} />}
        <span className="flex-1">{statusMessage}</span>
      </div>

      {/* Action Button */}
      <button
        onClick={handleCapture}
        disabled={!videoReady || isProcessing || disabled || !!cameraError}
        className="btn btn-primary w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
      >
        {isProcessing ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Analyzing Face...
          </>
        ) : (
          <>
            <Camera className="w-4 h-4" />
            Capture Face & Verify
          </>
        )}
      </button>
    </div>
  );
}
