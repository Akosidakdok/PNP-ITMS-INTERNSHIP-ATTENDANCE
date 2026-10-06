import { useState, useEffect, useRef, useCallback } from 'react';
import {
  QrCode,
  CheckCircle,
  AlertCircle,
  Clock,
  Shield,
  Camera,
  CameraOff,
  RotateCcw,
  UserCheck,
  Sparkles,
  Loader2,
  RefreshCw,
  SunMedium,
  Check,
} from 'lucide-react';
import QRScanner from '../../components/qr/QRScanner.jsx';
import backendApi from '../../utils/backendApi.js';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';
import { format } from 'date-fns';
import {
  captureVideoFrames,
  extractSecureFacePackage,
  initializeFaceIdentity,
  compareLiveFaceToRegistered,
} from '../../utils/faceIdentityService.js';

const COOLDOWN_SECONDS = 10;
const MAX_FACE_REGISTRATION_RETRIES = 5;
const RETRY_BUFFER_SECONDS = 2;
const MAX_VERIFICATION_ATTEMPTS = 5;

export const STAGES = {
  CAMERA_OFF: 'CAMERA_OFF',
  QR_SCANNING: 'QR_SCANNING',
  QR_VERIFYING: 'QR_VERIFYING',
  QR_INVALID: 'QR_INVALID',
  ACCOUNT_VERIFIED: 'ACCOUNT_VERIFIED',
  FACE_SCANNING: 'FACE_SCANNING',
  FACE_VERIFYING: 'FACE_VERIFYING',
  ATTENDANCE_RECORDING: 'ATTENDANCE_RECORDING',
  VERIFICATION_SUCCESS: 'VERIFICATION_SUCCESS',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
};

// Format date safely
const safeFormatDate = (dateVal, fmtStr) => {
  try {
    const d = dateVal ? new Date(dateVal) : new Date();
    if (isNaN(d.getTime())) return format(new Date(), fmtStr);
    return format(d, fmtStr);
  } catch {
    return format(new Date(), fmtStr);
  }
};

// Convert 24-hour or 12-hour time string into readable 12-hour AM/PM format
const formatScheduleTime = (timeStr) => {
  if (!timeStr) return null;
  const parts = String(timeStr).split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return null;
  const m = parts[1] ? parts[1].slice(0, 2) : '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

// ─── 3-Step Verification Progress Indicator ──────────────────────────────────
function StepProgressIndicator({ stage }) {
  // Step 1: QR Verification
  const getStep1Status = () => {
    if (stage === STAGES.QR_INVALID) return 'error';
    if ([
      STAGES.ACCOUNT_VERIFIED,
      STAGES.FACE_SCANNING,
      STAGES.FACE_VERIFYING,
      STAGES.ATTENDANCE_RECORDING,
      STAGES.VERIFICATION_SUCCESS,
      STAGES.VERIFICATION_FAILED,
    ].includes(stage)) {
      return 'completed';
    }
    return 'active'; // CAMERA_OFF, QR_SCANNING, QR_VERIFYING
  };

  // Step 2: Face Verification
  const getStep2Status = () => {
    if (stage === STAGES.VERIFICATION_FAILED) return 'error';
    if ([
      STAGES.ACCOUNT_VERIFIED,
      STAGES.FACE_SCANNING,
      STAGES.FACE_VERIFYING,
    ].includes(stage)) {
      return 'active';
    }
    if ([STAGES.ATTENDANCE_RECORDING, STAGES.VERIFICATION_SUCCESS].includes(stage)) {
      return 'completed';
    }
    return 'upcoming';
  };

  // Step 3: Attendance
  const getStep3Status = () => {
    if (stage === STAGES.VERIFICATION_SUCCESS) return 'completed';
    if (stage === STAGES.ATTENDANCE_RECORDING) return 'active';
    return 'upcoming';
  };

  const steps = [
    { num: 1, label: 'QR Verification', status: getStep1Status() },
    { num: 2, label: 'Face Verification', status: getStep2Status() },
    { num: 3, label: 'Attendance', status: getStep3Status() },
  ];

  return (
    <nav
      aria-label="Attendance verification progress"
      className="attendance-step-indicator w-full max-w-[480px] mx-auto px-2 py-1"
    >
      <div className="flex items-center justify-between relative">
        {/* Subtle connector track behind items */}
        <div className="attendance-step-track absolute left-8 right-8 top-4 -translate-y-1/2 h-0.5 z-0" />

        {steps.map((step) => {
          const isCompleted = step.status === 'completed';
          const isActive = step.status === 'active';
          const isError = step.status === 'error';

          const circleClass = isCompleted
            ? 'attendance-step-circle--completed'
            : isError
            ? 'attendance-step-circle--error'
            : isActive
            ? 'attendance-step-circle--active'
            : 'attendance-step-circle--inactive';

          const labelClass = isCompleted
            ? 'attendance-step-label--completed'
            : isError
            ? 'attendance-step-label--error'
            : isActive
            ? 'attendance-step-label--active'
            : 'attendance-step-label--inactive';

          return (
            <div key={step.num} className="flex flex-col items-center relative z-10">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 shadow-xs ${circleClass}`}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4 stroke-[3]" />
                ) : isError ? (
                  <AlertCircle className="w-4 h-4 text-white" />
                ) : isActive ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                ) : (
                  <span className="attendance-step-dot--inactive w-2 h-2 rounded-full" />
                )}
              </div>
              <span
                className={`mt-1.5 text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-colors ${labelClass}`}
              >
                {step.num}. {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Inline Error Card (NO Browser Alert Popups) ─────────────────────────────
function InlineErrorCard({
  errorCode,
  errorMsg,
  userName,
  onRetry,
  onCancel,
  registrationRetryState,
  onRetryRegistration,
}) {
  const isMismatch = errorCode === 'FACE_MISMATCH' || errorCode === 'FACE_IDENTITY_CONFLICT' || errorCode === 'MAX_VERIFICATION_ATTEMPTS_EXCEEDED';
  const isNoFace = errorCode === 'FACE_NOT_REGISTERED';
  const isLighting = errorCode === 'LIGHTING_LOW';
  const isCameraPermission = errorCode === 'CAMERA_ACCESS_DENIED' || errorCode === 'NotAllowedError';
  const isInvalidAccountQr = errorCode === 'INVALID_ACCOUNT_QR';

  let title = 'Verification Notice';
  let message = errorMsg || 'Please try again.';
  let icon = <AlertCircle className="w-8 h-8 text-rose-500" />;

  if (isMismatch) {
    title = "Face Doesn't Match";
    message = 'The detected face does not match the face registered to this account.';
  } else if (isNoFace) {
    title = 'Face Registration Required';
    message = 'No registered face was found for this account. Please contact the administrator or complete face registration first.';
    icon = <UserCheck className="w-8 h-8 text-amber-500" />;
  } else if (isLighting) {
    title = 'Lighting is too low';
    message = 'Move to a brighter area and make sure your face is clearly visible.';
    icon = <SunMedium className="w-8 h-8 text-amber-500" />;
  } else if (isCameraPermission) {
    title = 'Camera Access Required';
    message = 'P-IDTMS needs camera access to scan your QR code and verify your face.';
    icon = <CameraOff className="w-8 h-8 text-rose-500" />;
  } else if (isInvalidAccountQr) {
    title = 'Invalid Attendance QR';
    message = 'This QR code is not associated with an active P-IDTMS account.';
  } else {
    title = 'QR Could Not Be Verified';
    message = 'Move the QR closer to the camera and make sure it is clearly visible.';
  }

  return (
    <div className="attendance-error-card w-full max-w-[480px] mx-auto rounded-2xl p-5 shadow-sm text-center space-y-4 animate-scale-in">
      <div className="attendance-error-icon-box w-14 h-14 rounded-full flex items-center justify-center mx-auto">
        {icon}
      </div>

      <div className="space-y-1">
        <h3 className="attendance-error-title text-base font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {title}
        </h3>
        <p className="attendance-error-desc text-xs leading-relaxed max-w-sm mx-auto">
          {message}
        </p>

        {isMismatch && userName && (
          <div className="pt-2">
            <span className="attendance-error-account-badge inline-block text-xs font-semibold px-3 py-1 rounded-full">
              Account: {userName}
            </span>
          </div>
        )}
      </div>

      {isCameraPermission && (
        <div className="attendance-error-instructions p-3 rounded-xl text-left text-[11px] space-y-1.5">
          <p className="font-semibold">How to allow camera on your device:</p>
          <ul className="list-disc list-inside space-y-0.5 pl-1 opacity-90">
            <li><strong>iOS Safari:</strong> Tap the <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-[10px]">aA</code> icon &gt; Website Settings &gt; Camera: <strong>Allow</strong>.</li>
            <li><strong>Android Chrome:</strong> Tap Lock/Tune icon in URL bar &gt; Permissions &gt; Camera: <strong>Allow</strong>.</li>
          </ul>
        </div>
      )}

      {isNoFace && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onRetryRegistration}
            disabled={registrationRetryState?.isRetrying}
            className="attendance-start-btn w-full h-11 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm"
          >
            <RotateCcw className={`w-4 h-4 ${registrationRetryState?.isRetrying ? 'animate-spin' : ''}`} />
            {registrationRetryState?.isRetrying
              ? `Checking Face ID (${registrationRetryState.currentAttempt}/${registrationRetryState.maxAttempts})...`
              : 'Retry Face ID Check (5 Attempts)'}
          </button>
        </div>
      )}

      <div className="pt-1 flex flex-col gap-2">
        {!isNoFace && (
          <button
            type="button"
            onClick={onRetry}
            className="attendance-start-btn w-full h-11 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {isInvalidAccountQr ? 'Scan Again' : 'Try Again'}
          </button>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="attendance-secondary-btn w-full py-2.5 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5"
          >
            <CameraOff className="w-3.5 h-3.5 text-gray-500" />
            Cancel Verification
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main ScanAttendance Component ──────────────────────────────────────────
export default function ScanAttendance() {
  const { user } = useAuth();

  // Verification stage machine
  const [stage, setStage] = useState(STAGES.CAMERA_OFF);
  const [isCameraStarted, setIsCameraStarted] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);

  // Scan & Result data
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [faceCooldown, setFaceCooldown] = useState(0);
  const [nextScanHint, setNextScanHint] = useState('Loading next scan...');

  // QR and Face state
  const [tempQrCode, setTempQrCode] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [faceStatus, setFaceStatus] = useState({ type: 'info', message: 'Initializing camera...' });
  const [isProcessing, setIsProcessing] = useState(false);

  // Registration Retry State (5 Retries with Buffer Time)
  const [registrationRetryState, setRegistrationRetryState] = useState({
    isRetrying: false,
    currentAttempt: 0,
    maxAttempts: MAX_FACE_REGISTRATION_RETRIES,
    bufferSecondsRemaining: 0,
  });
  const registrationRetryRef = useRef({
    isRetrying: false,
    attempts: 0,
    active: true,
  });
  const verificationAttemptsRef = useRef(0);

  // Registered face package for currently authenticated account ONLY
  const [userRegisteredFacePackage, setUserRegisteredFacePackage] = useState(null);
  const userRegisteredFacePackageRef = useRef(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLockRef = useRef(false);
  const validFramesRef = useRef(0);
  const captureLockRef = useRef(false);
  const intervalRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const detectionBusyRef = useRef(false);
  const initializeCameraRef = useRef(null);

  // Derive authenticated user identity for account verification display
  const userName =
    user?.full_name ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    'Authenticated Intern';
  const userDivision = user?.assigned_profile?.division_name || user?.division_name || 'PNP-ITMS';
  const userRole = user?.role === 'intern' ? `${userDivision} Intern` : (user?.role || 'Intern');

  // Compute Next Attendance label and target time
  const getNextScanInfo = () => {
    const hintLower = (nextScanHint || '').toLowerCase();
    const isOut = hintLower.includes('out');
    const label = isOut ? 'Time Out' : 'Time In';

    const profile = user?.assigned_profile;
    let scheduledTime = null;
    if (isOut && profile?.time_out) {
      scheduledTime = formatScheduleTime(profile.time_out);
    } else if (!isOut && profile?.time_in) {
      scheduledTime = formatScheduleTime(profile.time_in);
    }

    if (!scheduledTime) {
      scheduledTime = isOut ? '5:00 PM' : '8:00 AM';
    }

    return { label, time: scheduledTime };
  };
  const nextScanInfo = getNextScanInfo();

  // Keep ref synchronized with state
  useEffect(() => {
    userRegisteredFacePackageRef.current = userRegisteredFacePackage;
  }, [userRegisteredFacePackage]);

  // Preload Face ID models on component mount
  useEffect(() => {
    initializeFaceIdentity().catch(err => {
      console.warn('Face ID background preload notice:', err?.message || err);
    });
  }, []);

  // Fetch Current User's Registered Face Package with 5 Retries + Buffer
  const loadRegisteredFaceWithRetry = useCallback(async (
    maxAttempts = MAX_FACE_REGISTRATION_RETRIES,
    bufferSeconds = RETRY_BUFFER_SECONDS
  ) => {
    if (userRegisteredFacePackageRef.current) {
      return userRegisteredFacePackageRef.current;
    }
    if (!user?.id) return null;
    if (registrationRetryRef.current.isRetrying) return null;

    registrationRetryRef.current.isRetrying = true;
    registrationRetryRef.current.active = true;
    setError('');
    setErrorCode('');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!registrationRetryRef.current.active) break;
      registrationRetryRef.current.attempts = attempt;
      setRegistrationRetryState({
        isRetrying: true,
        currentAttempt: attempt,
        maxAttempts,
        bufferSecondsRemaining: 0,
      });

      setFaceStatus({
        type: 'info',
        message: attempt === 1
          ? 'Verifying Face ID registration...'
          : `Verifying Face ID registration (Attempt ${attempt} of ${maxAttempts})...`,
      });

      try {
        const res = await backendApi.get('/attendance/my-face-descriptor');
        if (res.data?.face_embedding) {
          setUserRegisteredFacePackage(res.data.face_embedding);
          userRegisteredFacePackageRef.current = res.data.face_embedding;
          setError('');
          setErrorCode('');
          setFaceStatus({
            type: 'info',
            message: 'Position your face inside the guide',
          });
          registrationRetryRef.current.isRetrying = false;
          registrationRetryRef.current.attempts = 0;
          setRegistrationRetryState({
            isRetrying: false,
            currentAttempt: attempt,
            maxAttempts,
            bufferSecondsRemaining: 0,
          });

          if (import.meta.env.DEV) {
            console.log('[ATTENDANCE VERIFY]', {
              action: 'LOAD_REGISTERED_FACE_SUCCESS',
              authenticatedUserId: user.id,
              attempt,
            });
          }
          return res.data.face_embedding;
        }
      } catch (err) {
        console.warn(`Face ID check attempt ${attempt}/${maxAttempts} failed:`, err?.response?.data || err?.message);

        if (attempt < maxAttempts && registrationRetryRef.current.active) {
          for (let s = bufferSeconds; s > 0; s--) {
            if (!registrationRetryRef.current.active) break;
            setRegistrationRetryState(prev => ({
              ...prev,
              currentAttempt: attempt,
              bufferSecondsRemaining: s,
            }));
            setFaceStatus({
              type: 'warning',
              message: `Retrying Face ID registration check (${attempt}/${maxAttempts}) in ${s}s...`,
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          const fetchMsg = err?.response?.data?.error || 'Face ID is not registered for your account. Please complete biometric enrollment first.';
          const code = err?.response?.data?.code || 'FACE_NOT_REGISTERED';
          setError(fetchMsg);
          setErrorCode(code);
          setFaceStatus({
            type: 'rejected',
            message: `Face ID not registered after ${maxAttempts} attempts.`,
          });
          toast.error(`Face ID check failed after ${maxAttempts} attempts.`);
          registrationRetryRef.current.isRetrying = false;
          setRegistrationRetryState({
            isRetrying: false,
            currentAttempt: maxAttempts,
            maxAttempts,
            bufferSecondsRemaining: 0,
          });
        }
      }
    }

    registrationRetryRef.current.isRetrying = false;
    return null;
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      loadRegisteredFaceWithRetry();
    } else {
      setUserRegisteredFacePackage(null);
      userRegisteredFacePackageRef.current = null;
    }
    return () => {
      registrationRetryRef.current.active = false;
    };
  }, [user?.id, loadRegisteredFaceWithRetry]);

  // Load next scan hint
  useEffect(() => {
    backendApi.get('/attendance/next-scan')
      .then(res => setNextScanHint(res.data.next_scan_label || 'Ready to scan'))
      .catch(() => setNextScanHint('Unable to load next scan'));
  }, []);

  // Cooldown tickers
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (faceCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setFaceCooldown(seconds => Math.max(0, seconds - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [faceCooldown]);

  useEffect(() => {
    if (
      faceCooldown === 0 &&
      ['FACE_COOLDOWN', 'FACE_TEMPORARILY_LOCKED'].includes(errorCode)
    ) {
      captureLockRef.current = false;
      setStage(STAGES.QR_SCANNING);
    }
  }, [faceCooldown, errorCode]);

  // Camera cleanup helper
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
          track.enabled = false;
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [stopStream]);

  useEffect(() => {
    stopStream();
    setStage(STAGES.CAMERA_OFF);
    setIsCameraStarted(false);
    setIsCameraOpen(false);
    setUserRegisteredFacePackage(null);
    userRegisteredFacePackageRef.current = null;
    setTempQrCode(null);
    setScanResult(null);
    setError('');
    setErrorCode('');
  }, [user?.id, stopStream]);

  // Face Camera initialization & stream binding
  useEffect(() => {
    if (!isCameraOpen) {
      stopStream();
      return;
    }

    validFramesRef.current = 0;
    captureLockRef.current = false;
    setVideoReady(false);
    setFaceStatus({ type: 'info', message: 'Opening front camera...' });

    let active = true;
    const initializeCamera = async () => {
      try {
        const modelInitPromise = initializeFaceIdentity();

        let stream = null;
        let attempts = 0;
        let lastErr = null;

        while (attempts < 3 && !stream && active) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: attempts === 0 ? 'user' : { ideal: 'user' },
                width: { ideal: 640 },
                height: { ideal: 480 },
              },
            });
          } catch (camErr) {
            lastErr = camErr;
            attempts += 1;
            if (camErr.name === 'OverconstrainedError' || camErr.message?.includes('constraint')) {
              try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                break;
              } catch (fallbackErr) {
                lastErr = fallbackErr;
              }
            }
            if (attempts >= 3 || (camErr.name !== 'NotReadableError' && camErr.name !== 'TrackStartError')) {
              throw lastErr || camErr;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        if (!active) {
          if (stream) {
            stream.getTracks().forEach(track => {
              try { track.stop(); track.enabled = false; } catch {}
            });
          }
          return;
        }

        if (!stream && lastErr) {
          throw lastErr;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          const vid = videoRef.current;
          vid.srcObject = stream;
          vid.setAttribute('playsinline', 'true');
          vid.setAttribute('webkit-playsinline', 'true');
          vid.muted = true;
          vid.playsInline = true;

          const markReady = () => {
            if (!active) return;
            setVideoReady(true);
            setFaceStatus({ type: 'info', message: 'Position your face inside the guide' });
          };

          const playPromise = vid.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => { if (active) markReady(); })
              .catch(() => { if (active) markReady(); });
          } else {
            markReady();
          }

          if (vid.readyState >= 2) {
            markReady();
          } else {
            vid.onloadedmetadata = () => {
              vid.play().catch(() => {});
              markReady();
            };
            vid.oncanplay = markReady;
          }
        }

        await modelInitPromise;
      } catch (cameraError) {
        console.error('Face camera initialization failed:', cameraError);
        let message = 'Face ID camera could not start.';
        let code = 'CAMERA_ERROR';
        if (cameraError?.name === 'NotAllowedError' || cameraError?.name === 'PermissionDeniedError') {
          message = 'Camera access denied. Please allow camera permissions in your browser or device settings.';
          code = 'CAMERA_ACCESS_DENIED';
        } else if (cameraError?.name === 'NotFoundError') {
          message = 'No front camera found on this device.';
          code = 'CAMERA_NOT_FOUND';
        } else if (cameraError?.name === 'NotReadableError' || cameraError?.name === 'TrackStartError') {
          message = 'Camera is currently in use by another app. Please close other camera tabs and try again.';
          code = 'CAMERA_BUSY';
        }

        setError(message);
        setErrorCode(code);
        setFaceStatus({ type: 'rejected', message });
        setIsCameraOpen(false);
        setTempQrCode(null);
        setStage(STAGES.VERIFICATION_FAILED);
        setIsCameraStarted(false);
      }
    };

    initializeCameraRef.current = initializeCamera;
    const timer = setTimeout(initializeCamera, 300);

    return () => {
      active = false;
      clearTimeout(timer);
      stopStream();
    };
  }, [isCameraOpen, stopStream]);

  // ─── Start Camera Action (Single User-Triggered Entrypoint) ────────────────
  const handleStartCamera = async () => {
    if (isStartingCamera || stage !== STAGES.CAMERA_OFF || cooldown > 0 || faceCooldown > 0) return;
    setIsStartingCamera(true);
    setError('');
    setErrorCode('');

    if (import.meta.env.DEV) {
      console.log('[ATTENDANCE VERIFY]', {
        stage: 'QR_SCANNING',
        cameraActive: true,
        authenticatedUserId: user?.id,
        action: 'START_CAMERA',
      });
    }

    setStage(STAGES.QR_SCANNING);
    setIsCameraStarted(true);
    setIsStartingCamera(false);
  };

  // ─── Core capture + submit ────────────────────────────────────────────────
  const runCaptureAndSubmit = useCallback(async () => {
    if (!videoRef.current || !tempQrCode) {
      captureLockRef.current = false;
      return;
    }

    setIsProcessing(true);
    setStage(STAGES.ATTENDANCE_RECORDING);
    setFaceStatus({ type: 'success', message: '✓ Face Verified — Recording attendance...' });

    if (import.meta.env.DEV) {
      console.log('[ATTENDANCE VERIFY]', {
        stage: 'ATTENDANCE_RECORDING',
        authenticatedUserId: user?.id,
        qrCode: tempQrCode?.slice(0, 8) + '...',
      });
    }

    try {
      const video = videoRef.current;
      setFaceStatus({ type: 'success', message: 'Capturing verification frame...' });
      const canvases = await captureVideoFrames(video);
      setFaceStatus({ type: 'success', message: 'Checking identity and liveness...' });
      const embedding = await extractSecureFacePackage(canvases);
      const canvas = canvases[canvases.length - 1];
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context is unavailable.');

      // Timestamp overlay
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      const parts = formatter.formatToParts(new Date());
      const getP = type => parts.find(p => p.type === type)?.value || '';

      const profile = user?.assigned_profile;
      const isTimeIn = !nextScanHint || nextScanHint.toLowerCase().includes('in') || nextScanHint.toLowerCase().includes('first');
      const isTimeOut = Boolean(nextScanHint && nextScanHint.toLowerCase().includes('out'));
      let targetTimeStr = null;

      if (isTimeIn && profile?.first_scan_enabled && profile?.time_in) {
        targetTimeStr = profile.time_in;
      } else if (isTimeOut && profile?.second_scan_enabled && profile?.time_out) {
        targetTimeStr = profile.time_out;
      }

      let stamp = '';
      if (targetTimeStr) {
        const [hStr, mStr, sStr] = targetTimeStr.split(':');
        let h = parseInt(hStr, 10);
        const m = mStr || '00';
        const s = sStr || '00';
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        const timePart = `${String(h).padStart(2, '0')}:${m}:${s} ${ampm}`;
        stamp = `${getP('year')}-${getP('month')}-${getP('day')} ${timePart}`;
      } else {
        stamp = `${getP('year')}-${getP('month')}-${getP('day')} ${getP('hour')}:${getP('minute')}:${getP('second')} ${getP('dayPeriod')}`;
      }

      ctx.font = 'bold 18px sans-serif';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(stamp, 12, canvas.height - 18);

      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.7);

      // Submit attendance to backend (backend authoritatively checks user.id & embedding)
      const res = await backendApi.post('/attendance/scan', {
        qr_code: tempQrCode,
        photo: photoDataUrl,
        face_embedding: embedding,
      });

      if (import.meta.env.DEV) {
        console.log('[ATTENDANCE VERIFY]', {
          stage: 'VERIFICATION_SUCCESS',
          authenticatedUserId: user?.id,
          attendanceResult: 'SUCCESS',
          similarity: res.data?.similarity,
        });
      }

      stopStream();
      setScanResult(res.data);
      setIsCameraOpen(false);
      setIsCameraStarted(false);
      setTempQrCode(null);
      setStage(STAGES.VERIFICATION_SUCCESS);
      setNextScanHint(res.data.next_scan_label || 'Ready to scan');
      setCooldown(COOLDOWN_SECONDS);
      toast.success(res.data.message || 'Verification Successful! Attendance recorded.');
    } catch (err) {
      console.error('Capture/submit error:', err);
      const msg = err?.response?.data?.error || err?.message || 'Face verification failed. Please try again.';
      const code = err?.response?.data?.code || 'FACE_MISMATCH';
      const retryAfter = Math.max(
        0,
        Math.ceil(Number(err?.response?.data?.retry_after_seconds || 0))
      );
      setError(msg);
      setErrorCode(code);
      setStage(STAGES.VERIFICATION_FAILED);

      if (import.meta.env.DEV) {
        console.log('[ATTENDANCE VERIFY]', {
          stage: 'VERIFICATION_FAILED',
          authenticatedUserId: user?.id,
          attendanceResult: 'DENIED',
          error: msg,
          code,
        });
      }

      setFaceStatus({ type: 'rejected', message: msg });
      captureLockRef.current = true;

      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

      if (code === 'FACE_COOLDOWN' || code === 'FACE_TEMPORARILY_LOCKED') {
        stopStream();
        setFaceCooldown(retryAfter);
        setIsCameraOpen(false);
        setIsCameraStarted(false);
        setTempQrCode(null);
        toast.error(msg);
      } else if (code === 'FACE_NOT_REGISTERED') {
        captureLockRef.current = false;
        loadRegisteredFaceWithRetry(MAX_FACE_REGISTRATION_RETRIES, RETRY_BUFFER_SECONDS);
      } else if (
        code === 'FACE_MISMATCH' ||
        code === 'FACE_IDENTITY_CONFLICT' ||
        code === 'INVALID_FACE_CAPTURE' ||
        !err?.response
      ) {
        verificationAttemptsRef.current += 1;
        const currentAttempt = verificationAttemptsRef.current;

        if (currentAttempt < MAX_VERIFICATION_ATTEMPTS) {
          toast.error(`${msg} Retrying (${currentAttempt}/${MAX_VERIFICATION_ATTEMPTS}) in 2 seconds...`);
          retryTimeoutRef.current = setTimeout(() => {
            setError('');
            setErrorCode('');
            validFramesRef.current = 0;
            captureLockRef.current = false;
            setStage(STAGES.FACE_SCANNING);
            if (streamRef.current && streamRef.current.active) {
              setVideoReady(true);
              setFaceStatus({ type: 'info', message: 'Position your face inside the guide' });
            } else if (initializeCameraRef.current) {
              initializeCameraRef.current();
            }
          }, 2000);
        } else {
          setError(`Face verification failed after ${MAX_VERIFICATION_ATTEMPTS} attempts. Please ensure good lighting and look directly at the camera.`);
          setErrorCode('MAX_VERIFICATION_ATTEMPTS_EXCEEDED');
          setFaceStatus({ type: 'rejected', message: `Verification failed after ${MAX_VERIFICATION_ATTEMPTS} attempts.` });
          toast.error(`Verification stopped after ${MAX_VERIFICATION_ATTEMPTS} attempts.`);
          captureLockRef.current = false;
        }
      } else {
        stopStream();
        toast.error(msg);
        setFaceStatus({ type: 'rejected', message: msg });
        captureLockRef.current = false;
      }
    } finally {
      setIsProcessing(false);
    }
  }, [tempQrCode, nextScanHint, user, stopStream, loadRegisteredFaceWithRetry]);

  // ─── Live Account-Specific Face Matching Loop ─────────────────────────────
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (stage !== STAGES.FACE_SCANNING || !isCameraOpen || !videoReady || isProcessing) return;

    validFramesRef.current = 0;

    intervalRef.current = setInterval(async () => {
      if (captureLockRef.current || detectionBusyRef.current || !videoRef.current) return;

      const vid = videoRef.current;
      if (!vid.videoWidth || !vid.videoHeight || vid.readyState < 2) return;

      try {
        detectionBusyRef.current = true;

        // Ensure user's registered face descriptor is loaded
        if (!userRegisteredFacePackageRef.current) {
          if (!registrationRetryRef.current.isRetrying && errorCode !== 'FACE_NOT_REGISTERED') {
            await loadRegisteredFaceWithRetry(MAX_FACE_REGISTRATION_RETRIES, RETRY_BUFFER_SECONDS);
          }
          return;
        }

        // Strictly compare live face against the currently logged-in user's registered face
        const check = await compareLiveFaceToRegistered(vid, userRegisteredFacePackageRef.current);

        if (check.isMatch) {
          validFramesRef.current = Math.min(3, validFramesRef.current + 1);
          setFaceStatus({
            type: 'success',
            message: `Face verified! Hold still... (${validFramesRef.current}/3)`,
          });

          if (validFramesRef.current >= 3) {
            captureLockRef.current = true;
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            runCaptureAndSubmit();
          }
        } else {
          validFramesRef.current = Math.max(0, validFramesRef.current - 1);
          const isHardReject = check.code === 'FACE_MISMATCH' || check.code === 'MULTIPLE_FACES_DETECTED';
          setFaceStatus({
            type: isHardReject ? 'rejected' : 'warning',
            message: check.error || 'Position your face inside the guide',
          });
        }
      } catch (detectionError) {
        validFramesRef.current = Math.max(0, validFramesRef.current - 1);
        setFaceStatus({
          type: 'warning',
          message: detectionError?.message || 'Face analysis failed. Hold still and try again.',
        });
      } finally {
        detectionBusyRef.current = false;
      }
    }, 450);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      detectionBusyRef.current = false;
    };
  }, [stage, isCameraOpen, videoReady, isProcessing, runCaptureAndSubmit, errorCode, loadRegisteredFaceWithRetry]);

  // ─── QR Scan Handler ──────────────────────────────────────────────────────
  const handleScan = async (qrCode) => {
    if (scanLockRef.current || stage !== STAGES.QR_SCANNING || cooldown > 0 || faceCooldown > 0 || scanResult) return;
    scanLockRef.current = true;
    setStage(STAGES.QR_VERIFYING);
    setError('');
    setErrorCode('');

    if (import.meta.env.DEV) {
      console.log('[ATTENDANCE VERIFY]', {
        stage: 'QR_VERIFYING',
        authenticatedUserId: user?.id,
        qrDetected: true,
      });
    }

    try {
      const res = await backendApi.post('/attendance/validate-qr', { qr_code: qrCode });

      if (import.meta.env.DEV) {
        console.log('[ATTENDANCE VERIFY]', {
          stage: 'QR_VERIFYING',
          authenticatedUserId: user?.id,
          qrVerification: 'VALID',
        });
      }

      setTempQrCode(qrCode);

      if (res.data?.face_embedding) {
        setUserRegisteredFacePackage(res.data.face_embedding);
        userRegisteredFacePackageRef.current = res.data.face_embedding;
      } else {
        loadRegisteredFaceWithRetry(MAX_FACE_REGISTRATION_RETRIES, RETRY_BUFFER_SECONDS);
      }

      // Step 2 Transition: Show Account Verified Card
      setStage(STAGES.ACCOUNT_VERIFIED);

      // Seamless auto-transition to Face Verification
      setTimeout(() => {
        setStage(STAGES.FACE_SCANNING);
        setIsCameraOpen(true);
      }, 900);
    } catch (err) {
      const msg = err?.response?.data?.error || 'QR Verification Failed: Please scan a valid attendance QR code.';
      const code = err?.response?.data?.code || 'QR_INVALID';

      if (import.meta.env.DEV) {
        console.log('[ATTENDANCE VERIFY]', {
          stage: 'QR_INVALID',
          authenticatedUserId: user?.id,
          qrVerification: 'INVALID',
          error: msg,
        });
      }

      setError(msg);
      setErrorCode(code);
      setStage(STAGES.QR_INVALID);
      scanLockRef.current = false;
    }
  };

  // ─── Retry QR Scanning ────────────────────────────────────────────────────
  const handleRetryQrScan = () => {
    setError('');
    setErrorCode('');
    scanLockRef.current = false;
    setStage(STAGES.QR_SCANNING);
  };

  // ─── Retry Face Verification ──────────────────────────────────────────────
  const handleRetryFace = () => {
    setError('');
    setErrorCode('');
    validFramesRef.current = 0;
    captureLockRef.current = false;
    setStage(STAGES.FACE_SCANNING);
    if (streamRef.current && streamRef.current.active) {
      setVideoReady(true);
      setFaceStatus({ type: 'info', message: 'Position your face inside the guide' });
    } else if (initializeCameraRef.current) {
      initializeCameraRef.current();
    }
  };

  // ─── Manual Retry Action for Face ID Registration Check ───────────────────
  const handleManualRetryFaceRegistration = () => {
    setError('');
    setErrorCode('');
    registrationRetryRef.current.active = true;
    registrationRetryRef.current.isRetrying = false;
    loadRegisteredFaceWithRetry(MAX_FACE_REGISTRATION_RETRIES, RETRY_BUFFER_SECONDS);
  };

  // ─── Reset to Camera Off Initial Screen ───────────────────────────────────
  const handleReset = () => {
    if (cooldown > 0 || faceCooldown > 0) return;
    stopStream();
    setScanResult(null);
    setError('');
    setErrorCode('');
    setTempQrCode(null);
    setIsCameraOpen(false);
    setIsCameraStarted(false);
    setStage(STAGES.CAMERA_OFF);
    verificationAttemptsRef.current = 0;
    registrationRetryRef.current.active = false;
    registrationRetryRef.current.isRetrying = false;
    setRegistrationRetryState({
      isRetrying: false,
      currentAttempt: 0,
      maxAttempts: MAX_FACE_REGISTRATION_RETRIES,
      bufferSecondsRemaining: 0,
    });
    setNextScanHint('Loading...');
    backendApi.get('/attendance/next-scan')
      .then(res => setNextScanHint(res.data.next_scan_label || 'Ready to scan'))
      .catch(() => setNextScanHint('Unable to load next scan'));
  };

  // ─── Cancel and turn off camera ───────────────────────────────────────────
  const handleCancel = () => {
    stopStream();
    setIsCameraOpen(false);
    setIsCameraStarted(false);
    setTempQrCode(null);
    setStage(STAGES.CAMERA_OFF);
    setError('');
    setErrorCode('');
    scanLockRef.current = false;
    verificationAttemptsRef.current = 0;
    registrationRetryRef.current.active = false;
    registrationRetryRef.current.isRetrying = false;
    setRegistrationRetryState({
      isRetrying: false,
      currentAttempt: 0,
      maxAttempts: MAX_FACE_REGISTRATION_RETRIES,
      bufferSecondsRemaining: 0,
    });
  };

  // ─── Cancel Face Scan and Rescan QR ───────────────────────────────────────
  const handleRescanQr = () => {
    stopStream();
    setIsCameraOpen(false);
    setTempQrCode(null);
    setError('');
    setErrorCode('');
    scanLockRef.current = false;
    verificationAttemptsRef.current = 0;
    registrationRetryRef.current.active = false;
    registrationRetryRef.current.isRetrying = false;
    setRegistrationRetryState({
      isRetrying: false,
      currentAttempt: 0,
      maxAttempts: MAX_FACE_REGISTRATION_RETRIES,
      bufferSecondsRemaining: 0,
    });
    setStage(STAGES.QR_SCANNING);
  };

  // ─── Render View ──────────────────────────────────────────────────────────
  return (
    <div className="attendance-verification-page w-full max-w-xl mx-auto px-4 py-3 sm:py-6 space-y-4 animate-fade-in">
      {/* 1. Page Header */}
      <div className="text-center space-y-1">
        <h1
          className="attendance-header-title text-2xl sm:text-3xl font-extrabold tracking-tight"
        >
          Attendance Verification
        </h1>
        <p className="attendance-header-subtitle text-xs sm:text-sm font-medium">
          Secure attendance authentication
        </p>
      </div>

      {/* 2. 3-Step Verification Progress Indicator */}
      <StepProgressIndicator stage={stage} />

      {/* 3. Main Attendance Card Container */}
      <div className="attendance-main-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4">
        {/* Error Card Overlay (if in error state) */}
        {(stage === STAGES.QR_INVALID || stage === STAGES.VERIFICATION_FAILED) && (
          <InlineErrorCard
            errorCode={errorCode}
            errorMsg={error}
            userName={userName}
            onRetry={stage === STAGES.QR_INVALID ? handleRetryQrScan : handleRetryFace}
            onCancel={handleCancel}
            registrationRetryState={registrationRetryState}
            onRetryRegistration={handleManualRetryFaceRegistration}
          />
        )}

        {/* State A: Initial Screen — Camera is completely OFF */}
        {stage === STAGES.CAMERA_OFF && (
          <div className="space-y-4">
            {/* Camera-off Placeholder Viewport */}
            <div className="attendance-camera-off-viewport w-full aspect-[4/3] max-w-[480px] mx-auto rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-3 relative overflow-hidden shadow-inner">
              <div className="attendance-camera-off-icon-box w-16 h-16 rounded-full flex items-center justify-center">
                <CameraOff className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="attendance-camera-off-title font-bold text-base">
                  Camera is currently off.
                </p>
                <p className="attendance-camera-off-desc text-xs max-w-xs leading-relaxed">
                  Start the camera when you're ready to verify your attendance.
                </p>
              </div>
            </div>

            {/* Next Attendance Card */}
            <div className="attendance-next-card w-full max-w-[480px] mx-auto rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="attendance-next-icon-box w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="attendance-next-label text-[10px] uppercase tracking-wider block">
                    Next Attendance
                  </span>
                  <span className="attendance-next-value text-sm">
                    {nextScanInfo.label}
                  </span>
                </div>
              </div>
              <span className="attendance-time-pill text-sm px-3 py-1 rounded-md shadow-xs">
                {nextScanInfo.time}
              </span>
            </div>

            {/* The ONLY Start Camera button */}
            <div className="max-w-[480px] mx-auto">
              <button
                id="start-camera-btn"
                type="button"
                onClick={handleStartCamera}
                disabled={isStartingCamera || cooldown > 0 || faceCooldown > 0}
                className="attendance-start-btn w-full h-12 text-sm sm:text-base font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm"
              >
                {isStartingCamera ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Starting Camera...
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    Start Camera
                  </>
                )}
              </button>
            </div>

            {/* Account security helper */}
            <div className="attendance-security-note max-w-[480px] mx-auto flex items-center gap-2 text-[11px] justify-center">
              <Shield className="attendance-security-icon w-3.5 h-3.5 flex-shrink-0" />
              <span><strong>Account Security:</strong> Face verification matches only this account.</span>
            </div>
          </div>
        )}

        {/* State B: Active QR Scanning */}
        {(stage === STAGES.QR_SCANNING || stage === STAGES.QR_VERIFYING) && (
          <div className="space-y-3">
            {/* Secondary Next Attendance indicator */}
            <div className="max-w-[480px] mx-auto flex items-center justify-between text-xs px-1">
              <span className="attendance-security-note font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                Next: <strong className="attendance-next-value">{nextScanInfo.label}</strong>
              </span>
              <span className="attendance-next-label font-semibold">{nextScanInfo.time}</span>
            </div>

            {/* QR Scanner Container */}
            <div className="max-w-[480px] mx-auto">
              <QRScanner onScan={handleScan} isActive={isCameraStarted && stage === STAGES.QR_SCANNING} />
            </div>

            {/* Guidance status */}
            <div className="max-w-[480px] mx-auto text-center space-y-1">
              {stage === STAGES.QR_VERIFYING ? (
                <div className="attendance-status-pill--info p-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span>✓ QR Code Detected — Verifying account...</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="attendance-status-pill--info inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    Scanning QR Code...
                  </div>
                  <p className="attendance-header-subtitle text-xs">
                    Place your attendance QR code inside the frame.
                  </p>
                </div>
              )}
            </div>

            {/* Cancel Camera button */}
            <div className="max-w-[480px] mx-auto pt-1">
              <button
                type="button"
                onClick={handleCancel}
                className="attendance-secondary-btn w-full py-2.5 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5"
              >
                <CameraOff className="w-4 h-4 text-gray-500" />
                Cancel & Turn Off Camera
              </button>
            </div>
          </div>
        )}

        {/* State C: Account Verified Card */}
        {stage === STAGES.ACCOUNT_VERIFIED && (
          <div className="attendance-account-card w-full aspect-[4/3] max-w-[480px] mx-auto rounded-2xl shadow-inner flex flex-col items-center justify-center p-6 text-center space-y-3 animate-fade-in">
            <div className="attendance-success-icon-box w-14 h-14 rounded-full flex items-center justify-center shadow-xs">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>

            <div className="space-y-1">
              <span className="attendance-badge-verified text-[11px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full inline-block mb-1">
                ✓ Account Verified
              </span>
              <h3 className="attendance-account-name text-lg sm:text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {userName}
              </h3>
              <p className="attendance-account-role text-xs font-semibold">
                {userRole}
              </p>
            </div>

            <div className="attendance-account-preparing flex items-center gap-2 text-xs font-medium pt-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <span>Preparing Face Verification...</span>
            </div>
          </div>
        )}

        {/* State D: Face Verification Interface */}
        {(stage === STAGES.FACE_SCANNING || stage === STAGES.FACE_VERIFYING || stage === STAGES.ATTENDANCE_RECORDING) && (
          <div className="space-y-3 max-w-[480px] mx-auto">
            {/* Front Camera Video Box with Biometric Face Guide */}
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black shadow-inner border border-gray-800 flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover transform -scale-x-100"
              />

              {/* Face Guide Overlay */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-3.5 z-10">
                {/* Top Badge */}
                <div className="bg-black/70 backdrop-blur-md text-white text-[11px] font-medium px-3 py-1 rounded-full border border-white/10 flex items-center gap-1.5 shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  {stage === STAGES.ATTENDANCE_RECORDING
                    ? '✓ Face Verified — Recording...'
                    : isProcessing
                    ? '● Verifying Face...'
                    : 'Verifying Face'}
                </div>

                {/* Biometric Face-Shaped Alignment Frame (Forehead, Temples, Cheeks, Jawline, Chin) */}
                <div
                  className={`relative w-48 sm:w-56 h-60 sm:h-68 max-h-[82%] flex items-center justify-center pointer-events-none transition-all duration-300 ${
                    stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success' || faceStatus.type === 'rejected'
                      ? 'animate-pulse'
                      : ''
                  }`}
                >
                  <svg
                    viewBox="0 0 240 300"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full"
                    style={{
                      filter:
                        stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success'
                          ? 'drop-shadow(0 0 16px rgba(16, 185, 129, 0.55))'
                          : faceStatus.type === 'rejected'
                          ? 'drop-shadow(0 0 16px rgba(244, 63, 94, 0.55))'
                          : 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.4))',
                    }}
                  >
                    {/* Anatomical biometric face contour */}
                    <path
                      d="M 120 20
                         C 165 20, 196 44, 198 78
                         C 200 100, 204 122, 202 140
                         C 199 170, 182 208, 166 230
                         C 152 250, 136 266, 120 268
                         C 104 266, 88 250, 74 230
                         C 58 208, 41 170, 38 140
                         C 36 122, 40 100, 42 78
                         C 44 44, 75 20, 120 20 Z"
                      fill={
                        stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success'
                          ? 'rgba(16, 185, 129, 0.08)'
                          : faceStatus.type === 'rejected'
                          ? 'rgba(244, 63, 94, 0.08)'
                          : 'rgba(59, 130, 246, 0.04)'
                      }
                      stroke={
                        stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success'
                          ? '#34d399'
                          : faceStatus.type === 'rejected'
                          ? '#fb7185'
                          : '#60a5fa'
                      }
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Side alignment markers (cheek level) */}
                    <line
                      x1="20"
                      y1="140"
                      x2="31"
                      y2="140"
                      stroke={
                        stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success'
                          ? '#34d399'
                          : faceStatus.type === 'rejected'
                          ? '#fb7185'
                          : '#60a5fa'
                      }
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <line
                      x1="209"
                      y1="140"
                      x2="220"
                      y2="140"
                      stroke={
                        stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success'
                          ? '#34d399'
                          : faceStatus.type === 'rejected'
                          ? '#fb7185'
                          : '#60a5fa'
                      }
                      strokeWidth="2"
                      strokeLinecap="round"
                    />

                    {/* Temple alignment markers */}
                    <line
                      x1="26"
                      y1="82"
                      x2="35"
                      y2="82"
                      stroke={
                        stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success'
                          ? '#34d399'
                          : faceStatus.type === 'rejected'
                          ? '#fb7185'
                          : '#60a5fa'
                      }
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      opacity="0.8"
                    />
                    <line
                      x1="205"
                      y1="82"
                      x2="214"
                      y2="82"
                      stroke={
                        stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success'
                          ? '#34d399'
                          : faceStatus.type === 'rejected'
                          ? '#fb7185'
                          : '#60a5fa'
                      }
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      opacity="0.8"
                    />

                    {/* Top & bottom center alignment markers */}
                    <line
                      x1="120"
                      y1="8"
                      x2="120"
                      y2="14"
                      stroke={
                        stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success'
                          ? '#34d399'
                          : faceStatus.type === 'rejected'
                          ? '#fb7185'
                          : '#60a5fa'
                      }
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      opacity="0.75"
                    />
                    <line
                      x1="120"
                      y1="274"
                      x2="120"
                      y2="280"
                      stroke={
                        stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success'
                          ? '#34d399'
                          : faceStatus.type === 'rejected'
                          ? '#fb7185'
                          : '#60a5fa'
                      }
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      opacity="0.75"
                    />
                  </svg>
                </div>

                {/* Bottom guide instruction */}
                <div className="bg-black/60 backdrop-blur-sm text-gray-200 text-[11px] px-3 py-1 rounded-full">
                  Look directly at the camera and keep your face inside the guide
                </div>
              </div>
            </div>

            {/* Account Specific Identity Context Card */}
            <div className="attendance-identity-card rounded-xl p-3 text-center space-y-0.5">
              <p className="attendance-identity-label text-[10px] uppercase tracking-wider font-semibold">
                Verifying the registered face of:
              </p>
              <p className="attendance-identity-name text-sm font-bold">
                {userName}
              </p>
              <span className="attendance-identity-role-badge text-xs font-medium px-2 py-0.5 rounded-full inline-block mt-0.5">
                {userRole}
              </span>
            </div>

            {/* Live Verification Status Bar */}
            <div
              className={`p-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-center transition-all ${
                stage === STAGES.ATTENDANCE_RECORDING || faceStatus.type === 'success'
                  ? 'attendance-status-pill--success'
                  : faceStatus.type === 'rejected'
                  ? 'attendance-status-pill--rejected'
                  : 'attendance-status-pill--info'
              }`}
            >
              {stage === STAGES.ATTENDANCE_RECORDING ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                  <span>✓ Face Verified — Recording attendance...</span>
                </>
              ) : isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span>● Verifying Face... Please hold still</span>
                </>
              ) : faceStatus.type === 'success' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500 stroke-[3]" />
                  <span>{faceStatus.message}</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 text-blue-500" />
                  <span>{faceStatus.message || 'Position your face inside the guide'}</span>
                </>
              )}
            </div>

            {/* Rescan QR Action Button */}
            <button
              type="button"
              onClick={handleRescanQr}
              disabled={isProcessing || stage === STAGES.ATTENDANCE_RECORDING}
              className="attendance-secondary-btn w-full py-2.5 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
              Cancel & Rescan QR
            </button>
          </div>
        )}

        {/* State E: Successful Attendance Screen */}
        {stage === STAGES.VERIFICATION_SUCCESS && scanResult && (
          <div className="text-center p-2 sm:p-4 space-y-4 max-w-[480px] mx-auto animate-scale-in">
            {/* Green Check Badge */}
            <div className="attendance-success-icon-box w-16 h-16 rounded-full mx-auto flex items-center justify-center shadow-sm">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>

            <div className="space-y-1">
              <h2
                className="attendance-success-title text-2xl font-bold tracking-tight"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                Attendance Recorded
              </h2>
              <p className="attendance-success-subtitle text-xs">
                {scanResult.message || 'Face verified successfully. Time In recorded!'}
              </p>
            </div>

            {/* Big Scan Badge (TIME IN / TIME OUT) */}
            <div>
              <span
                className={`text-xs font-extrabold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-xs ${
                  scanResult.scan_type === 'time_in'
                    ? 'attendance-badge-timein'
                    : 'attendance-badge-timeout'
                }`}
              >
                {scanResult.scan_label || (scanResult.scan_type === 'time_in' ? 'TIME IN' : 'TIME OUT')}
              </span>
            </div>

            {/* Structured Attendance Details Grid */}
            <div className="attendance-details-card rounded-2xl p-4 text-left divide-y text-xs">
              <div className="attendance-details-row py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="attendance-details-label font-medium flex-shrink-0">Time</span>
                <span className="attendance-details-value font-bold text-sm sm:text-right">
                  {safeFormatDate(scanResult.scan_time, 'hh:mm:ss a')}
                </span>
              </div>
              <div className="attendance-details-row py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="attendance-details-label font-medium flex-shrink-0">Intern</span>
                <span className="attendance-details-value font-semibold sm:text-right" style={{ overflowWrap: 'anywhere', wordBreak: 'normal' }}>
                  {scanResult.intern_name || userName}
                </span>
              </div>
              <div className="attendance-details-row py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="attendance-details-label font-medium flex-shrink-0">Date</span>
                <span className="attendance-details-value font-medium sm:text-right">
                  {safeFormatDate(scanResult.scan_time, 'MMMM dd, yyyy')}
                </span>
              </div>
              <div className="attendance-details-row py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="attendance-details-label font-medium flex-shrink-0">Verification</span>
                <span className="attendance-badge-verified inline-flex items-center gap-1 font-semibold px-2.5 py-0.5 rounded-full text-[11px] self-start sm:self-auto">
                  <Check className="w-3 h-3 stroke-[3]" />
                  Verified ({Math.round((scanResult.similarity || 0.95) * 100)}%)
                </span>
              </div>
              <div className="attendance-details-row py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="attendance-details-label font-medium flex-shrink-0">Status</span>
                <span className="attendance-badge-pending inline-flex items-center gap-1 font-semibold px-2.5 py-0.5 rounded-full text-[11px] self-start sm:self-auto">
                  <Clock className="w-3 h-3" />
                  Pending Approval
                </span>
              </div>
            </div>

            {/* Done / Cooldown Button */}
            <button
              type="button"
              onClick={handleReset}
              disabled={cooldown > 0}
              className="attendance-done-btn w-full h-12 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              {cooldown > 0 ? `Done (Cooldown ${cooldown}s)` : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
