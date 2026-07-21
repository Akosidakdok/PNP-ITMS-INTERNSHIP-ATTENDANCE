import { useState, useEffect, useRef, useCallback } from 'react';
import { QrCode, CheckCircle, AlertCircle, Clock, Shield, Camera, RotateCcw, UserCheck, Sparkles } from 'lucide-react';
import QRScanner from '../../components/qr/QRScanner.jsx';
import backendApi from '../../utils/backendApi.js';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { extractFaceEmbedding, analyzeFaceQuality } from '../../utils/mediapipeService.js';
import FaceRegistrationModal from '../../components/face/FaceRegistrationModal.jsx';

const COOLDOWN_SECONDS = 10;

const safeFormatDate = (dateVal, fmtStr) => {
  try {
    const d = dateVal ? new Date(dateVal) : new Date();
    if (isNaN(d.getTime())) return format(new Date(), fmtStr);
    return format(d, fmtStr);
  } catch {
    return format(new Date(), fmtStr);
  }
};

export default function ScanAttendance() {
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [nextScanHint, setNextScanHint] = useState('Loading next scan...');

  // Face capture state
  const [tempQrCode, setTempQrCode] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [faceStatus, setFaceStatus] = useState({ type: 'info', message: 'Initializing camera...' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLockRef = useRef(false);
  const validFramesRef = useRef(0);
  const captureLockRef = useRef(false);
  const intervalRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  // ─── Load next scan hint ──────────────────────────────────────────────────
  useEffect(() => {
    backendApi.get('/attendance/next-scan')
      .then(res => setNextScanHint(res.data.next_scan_label || 'Ready to scan'))
      .catch(() => setNextScanHint('Unable to load next scan'));
  }, []);

  // ─── Cooldown ticker ──────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // ─── Camera open / close ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isCameraOpen) {
      stopStream();
      return;
    }

    validFramesRef.current = 0;
    captureLockRef.current = false;
    setVideoReady(false);
    setFaceStatus({ type: 'info', message: 'Initializing camera...' });

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640 } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Use 'canplay' instead of 'loadedmetadata' so we know frames are renderable
          videoRef.current.oncanplay = () => {
            videoRef.current.play().catch(() => {});
            // Extra 500ms buffer to ensure first real frames have pixel data
            setTimeout(() => setVideoReady(true), 500);
            setFaceStatus({ type: 'info', message: 'Position your face inside the circle' });
          };
        }
      })
      .catch(() => {
        toast.error('Camera access denied. Please allow camera permissions.');
        setIsCameraOpen(false);
        setTempQrCode(null);
        setScannerActive(true);
      });

    return () => stopStream();
  }, [isCameraOpen]);

  // ─── Auto face-detection polling loop ────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isCameraOpen || !videoReady || isProcessing) return;

    validFramesRef.current = 0;

    intervalRef.current = setInterval(async () => {
      if (captureLockRef.current || !videoRef.current) return;

      const vid = videoRef.current;
      // Skip frame if video not fully ready (prevents MediaPipe zero-size error)
      if (!vid.videoWidth || !vid.videoHeight || vid.readyState < 2) return;

      try {
        const quality = await analyzeFaceQuality(videoRef.current);

        if (quality.valid) {
          validFramesRef.current += 1;
          setFaceStatus({
            type: 'success',
            message: `Face detected! Hold still... (${Math.min(validFramesRef.current, 3)}/3)`
          });

          if (validFramesRef.current >= 3) {
            captureLockRef.current = true;
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            runCaptureAndSubmit();
          }
        } else {
          validFramesRef.current = 0;
          setFaceStatus({
            type: 'warning',
            message: quality.error || 'Position your face inside the circle'
          });
        }
      } catch {
        // silently ignore transient detection frames
      }
    }, 300);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isCameraOpen, videoReady, isProcessing]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // ─── Core capture + submit ────────────────────────────────────────────────
  const runCaptureAndSubmit = useCallback(async () => {
    if (!videoRef.current || !tempQrCode) {
      captureLockRef.current = false;
      return;
    }

    setIsProcessing(true);
    setFaceStatus({ type: 'success', message: 'Capturing & verifying...' });

    try {
      const video = videoRef.current;
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);

      // Stop camera feed now
      stopStream();

      // Extract face embedding
      const embedding = await extractFaceEmbedding(canvas);

      // Timestamp overlay
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
      });
      const parts = formatter.formatToParts(new Date());
      const getP = type => parts.find(p => p.type === type)?.value || '';
      const stamp = `${getP('year')}-${getP('month')}-${getP('day')} ${getP('hour')}:${getP('minute')}:${getP('second')} ${getP('dayPeriod')}`;

      ctx.font = 'bold 18px sans-serif';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(stamp, 12, canvas.height - 18);

      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.7);

      // Submit attendance
      const res = await backendApi.post('/attendance/scan', {
        qr_code: tempQrCode,
        photo: photoDataUrl,
        face_embedding: embedding
      });

      setScanResult(res.data);
      setIsCameraOpen(false);
      setTempQrCode(null);
      setScannerActive(false);
      setNextScanHint(res.data.next_scan_label || 'Ready to scan');
      setCooldown(COOLDOWN_SECONDS);
      toast.success(res.data.message || 'Attendance recorded!');
    } catch (err) {
      console.error('Capture/submit error:', err);
      const msg = err?.response?.data?.error || err?.message || 'Face verification failed. Please try again.';
      const code = err?.response?.data?.code || '';
      setError(msg);
      setErrorCode(code);

      // ── 2-second rejection flash (like phone face unlock) ──
      setFaceStatus({ type: 'rejected', message: 'Face not recognized' });
      setVideoReady(false);
      captureLockRef.current = true;

      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

      if (code === 'FACE_NOT_REGISTERED') {
        // Registration issue — show error, don't auto-retry
        toast.error(msg);
        captureLockRef.current = false;
        setFaceStatus({ type: 'rejected', message: 'Face not registered' });
      } else {
        // Wrong face — 2 second cooldown then retry automatically
        toast.error('Face not recognized. Retrying in 2 seconds...');
        retryTimeoutRef.current = setTimeout(() => {
          setError('');
          setErrorCode('');
          validFramesRef.current = 0;
          captureLockRef.current = false;
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640 } })
            .then(stream => {
              streamRef.current = stream;
              if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.oncanplay = () => {
                  videoRef.current.play().catch(() => {});
                  setTimeout(() => {
                    setVideoReady(true);
                    setFaceStatus({ type: 'info', message: 'Position your face inside the circle' });
                  }, 300);
                };
              }
            }).catch(() => {});
        }, 2000);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [tempQrCode]);

  // ─── QR scan handler ──────────────────────────────────────────────────────
  const handleScan = async (qrCode) => {
    if (scanLockRef.current || scanning || cooldown > 0 || scanResult) return;
    scanLockRef.current = true;
    setScanning(true);
    setError('');
    setErrorCode('');

    try {
      const res = await backendApi.post('/attendance/validate-qr', { qr_code: qrCode });
      toast.success(res.data.message || 'QR valid! Now scanning your face...');
      setTempQrCode(qrCode);
      setScannerActive(false);
      setIsCameraOpen(true);
    } catch (err) {
      const msg = err?.response?.data?.error || 'QR validation failed. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setScanning(false);
      scanLockRef.current = false;
    }
  };

  // ─── Reset / scan again ───────────────────────────────────────────────────
  const handleReset = () => {
    if (cooldown > 0) return;
    setScanResult(null);
    setError('');
    setErrorCode('');
    setTempQrCode(null);
    setIsCameraOpen(false);
    setScannerActive(true);
    setNextScanHint('Loading...');
    backendApi.get('/attendance/next-scan')
      .then(res => setNextScanHint(res.data.next_scan_label || 'Ready to scan'))
      .catch(() => setNextScanHint('Unable to load next scan'));
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in px-4 sm:px-0">
      <div className="text-center">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
          QR Attendance Scanner
        </h1>
        <p className="text-gray-500 text-sm">Scan the office QR code to record your attendance</p>
      </div>

      {/* Instructions */}
      <div className="card p-4 bg-blue-50 border border-blue-100">
        <div className="flex gap-3">
          <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-semibold mb-1">How it works:</p>
            <ol className="list-decimal ml-4 space-y-1 text-blue-600">
              <li>Point camera at the office QR code</li>
              <li>Face camera opens automatically</li>
              <li>Look at the camera — face recognized automatically</li>
              <li>Attendance is recorded instantly</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {scanResult ? (
        /* ── Success Screen ── */
        <div className="card p-8 text-center animate-scale-in">
          <div
            className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: scanResult.scan_type === 'time_in' ? 'linear-gradient(135deg,#15803d,#22c55e)' : 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
          >
            <CheckCircle className="w-10 h-10 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {scanResult.scan_type === 'time_in' ? '✅ Time In Recorded!' : '🎉 Time Out Recorded!'}
          </h2>
          <p className="text-gray-500 mb-6">{scanResult.message}</p>

          <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Intern:</span>
              <span className="font-semibold text-gray-800">{scanResult.intern_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Verification:</span>
              <span className="badge badge-time-in flex items-center gap-1">
                <UserCheck className="w-3 h-3" />
                Verified ({Math.round((scanResult.similarity || 0.95) * 100)}%)
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Scan:</span>
              <span className={`badge ${scanResult.scan_type === 'time_in' ? 'badge-time-in' : 'badge-time-out'}`}>
                {scanResult.scan_label || (scanResult.scan_type === 'time_in' ? 'Time In' : 'Time Out')}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Date:</span>
              <span className="font-medium">{safeFormatDate(scanResult.scan_time, 'MMMM dd, yyyy')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Time:</span>
              <span className="font-medium">{safeFormatDate(scanResult.scan_time, 'hh:mm:ss a')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status:</span>
              <span className="badge badge-pending">Pending Approval</span>
            </div>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Your attendance has been recorded with biometric face verification.
          </p>

          <button
            id="scan-again-btn"
            className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleReset}
            disabled={cooldown > 0}
          >
            {cooldown > 0 ? `Scan Again (${cooldown}s)` : 'Scan Again'}
          </button>
        </div>
      ) : isCameraOpen ? (
        /* ── Face Camera Screen ── */
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Camera className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-gray-800">Face Verification</h2>
          </div>

          {/* Error banner */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2 text-sm text-red-700">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="font-semibold">{error}</span>
              </div>
              {errorCode === 'FACE_NOT_REGISTERED' && (
                <button
                  onClick={() => setShowRegModal(true)}
                  className="btn btn-sm btn-primary w-full flex items-center justify-center gap-2 mt-2"
                >
                  <UserCheck className="w-4 h-4" />
                  Register Your Face Now
                </button>
              )}
            </div>
          )}

          {/* Video feed */}
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-gray-200 shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />

            {/* Dynamic oval */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`w-44 h-56 rounded-[50%] border-[3px] transition-all duration-300 ${
                faceStatus.type === 'success'
                  ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.6)] animate-pulse'
                  : faceStatus.type === 'rejected'
                  ? 'border-red-500 bg-red-500/15 shadow-[0_0_30px_rgba(239,68,68,0.6)] animate-pulse'
                  : faceStatus.type === 'warning'
                  ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_15px_rgba(251,191,36,0.4)]'
                  : 'border-blue-400 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
              }`} />
            </div>

            {/* Badge */}
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm text-white text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-400" />
              {isProcessing ? 'Processing...' : 'Auto Recognition'}
            </div>
          </div>

          {/* Status bar */}
          <div className={`p-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-center transition-all ${
            faceStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            faceStatus.type === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200' :
            faceStatus.type === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {isProcessing ? (
              <Clock className="w-4 h-4 animate-spin flex-shrink-0" />
            ) : faceStatus.type === 'success' ? (
              <UserCheck className="w-4 h-4 animate-bounce flex-shrink-0" />
            ) : faceStatus.type === 'rejected' ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <Camera className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{isProcessing ? 'Verifying your identity...' : faceStatus.message}</span>
          </div>

          <p className="text-[11px] text-gray-400 text-center">
            Look directly at the camera — attendance is recorded automatically when your face is recognized.
          </p>

          {/* Cancel button */}
          <button
            className="btn btn-secondary w-full flex items-center justify-center gap-2 text-sm"
            onClick={() => {
              setIsCameraOpen(false);
              setTempQrCode(null);
              setScannerActive(true);
              setError('');
              setErrorCode('');
            }}
            disabled={isProcessing}
          >
            <RotateCcw className="w-4 h-4" />
            Cancel & Rescan QR
          </button>
        </div>
      ) : (
        /* ── QR Scanner Screen ── */
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-gray-800">Camera Scanner</h2>
          </div>
          <div className="max-w-sm mx-auto">
            {scanning && (
              <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-2 text-sm text-yellow-700">
                <Clock className="w-4 h-4 animate-spin" />
                Processing QR scan...
              </div>
            )}
            <div className="mb-3 text-sm text-gray-600">
              <span className="font-semibold">Next scan:</span> {nextScanHint}
            </div>
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            <QRScanner onScan={handleScan} isActive={scannerActive} />
          </div>
        </div>
      )}

      {/* Face Registration Modal */}
      <FaceRegistrationModal
        isOpen={showRegModal}
        onClose={() => setShowRegModal(false)}
        onSuccess={() => {
          setShowRegModal(false);
          setError('');
          setErrorCode('');
          toast.success('Face registered! Please look at the camera to verify.');
        }}
      />
    </div>
  );
}
