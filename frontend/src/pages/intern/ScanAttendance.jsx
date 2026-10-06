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
  FACE_SCANNING: 'FACE_SCANNING',
  FACE_VERIFYING: 'FACE_VERIFYING',
  VERIFICATION_SUCCESS: 'VERIFICATION_SUCCESS',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
};

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

  // Keep ref synchronized with state
  useEffect(() => {
    userRegisteredFacePackageRef.current = userRegisteredFacePackage;
  }, [userRegisteredFacePackage]);

  // ─── Preload Face ID models on page mount ──────────────────────────────────
  useEffect(() => {
    initializeFaceIdentity().catch(err => {
      console.warn('Face ID background preload notice:', err?.message || err);
    });
  }, []);

  // ─── Fetch Current User's Registered Face Package with 5 Retries + Buffer ───
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
          : `Verifying Face ID registration (Attempt ${attempt} of ${maxAttempts})...`
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
            message: 'Position your face inside the circle'
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
          // Buffer time countdown before next retry
          for (let s = bufferSeconds; s > 0; s--) {
            if (!registrationRetryRef.current.active) break;
            setRegistrationRetryState(prev => ({
              ...prev,
              currentAttempt: attempt,
              bufferSecondsRemaining: s,
            }));
            setFaceStatus({
              type: 'warning',
              message: `Retrying Face ID registration check (${attempt}/${maxAttempts}) in ${s}s...`
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          // All 5 attempts exhausted!
          const fetchMsg = err?.response?.data?.error || 'Face ID is not registered for your account. Please complete biometric enrollment first.';
          const code = err?.response?.data?.code || 'FACE_NOT_REGISTERED';
          setError(fetchMsg);
          setErrorCode(code);
          setFaceStatus({
            type: 'rejected',
            message: `Face ID not registered after ${maxAttempts} attempts.`
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
    let isMounted = true;
    if (user?.id) {
      loadRegisteredFaceWithRetry();
    } else {
      setUserRegisteredFacePackage(null);
      userRegisteredFacePackageRef.current = null;
    }
    return () => {
      isMounted = false;
      registrationRetryRef.current.active = false;
    };
  }, [user?.id, loadRegisteredFaceWithRetry]);

  // ─── Load next scan hint ──────────────────────────────────────────────────
  useEffect(() => {
    backendApi.get('/attendance/next-scan')
      .then(res => setNextScanHint(res.data.next_scan_label || 'Ready to scan'))
      .catch(() => setNextScanHint('Unable to load next scan'));
  }, []);

  // ─── Cooldown tickers ─────────────────────────────────────────────────────
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
      faceCooldown === 0
      && ['FACE_COOLDOWN', 'FACE_TEMPORARILY_LOCKED'].includes(errorCode)
    ) {
      captureLockRef.current = false;
      setStage(STAGES.QR_SCANNING);
    }
  }, [faceCooldown, errorCode]);

  // ─── Camera cleanup helper ────────────────────────────────────────────────
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

  // ─── Component unmount & user change cleanup ──────────────────────────────
  useEffect(() => {
    return () => {
      stopStream();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [stopStream]);

  useEffect(() => {
    // When user account changes or logs out, purge all camera, state, and descriptors
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

  // ─── Face Camera initialization & stream binding ──────────────────────────
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
                height: { ideal: 480 }
              }
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
            setFaceStatus({ type: 'info', message: 'Position your face inside the circle' });
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
        let message = 'Face ID engine could not start.';
        if (cameraError?.name === 'NotAllowedError' || cameraError?.name === 'PermissionDeniedError') {
          message = 'Camera access denied. Please allow camera permissions in your browser or device settings.';
        } else if (cameraError?.name === 'NotFoundError') {
          message = 'No front camera found on this device.';
        } else if (cameraError?.name === 'NotReadableError' || cameraError?.name === 'TrackStartError') {
          message = 'Camera is currently in use by another app. Please close other camera tabs and try again.';
        } else if (cameraError?.message) {
          message = cameraError.message;
        }

        setFaceStatus({ type: 'rejected', message });
        toast.error(message);
        setIsCameraOpen(false);
        setTempQrCode(null);
        setStage(STAGES.CAMERA_OFF);
        setIsCameraStarted(false);
      }
    };

    initializeCameraRef.current = initializeCamera;
    const timer = setTimeout(initializeCamera, 350);

    return () => {
      active = false;
      clearTimeout(timer);
      stopStream();
    };
  }, [isCameraOpen, stopStream]);

  // ─── Start Camera Action (User-Triggered Only) ────────────────────────────
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
        action: 'START_CAMERA'
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
    setStage(STAGES.FACE_VERIFYING);
    setFaceStatus({ type: 'success', message: 'Verifying Face...' });

    if (import.meta.env.DEV) {
      console.log('[ATTENDANCE VERIFY]', {
        stage: 'FACE_VERIFYING',
        authenticatedUserId: user?.id,
        qrCode: tempQrCode?.slice(0, 8) + '...',
      });
    }

    try {
      const video = videoRef.current;
      setFaceStatus({ type: 'success', message: 'Capturing a short live sequence—blink once...' });
      const canvases = await captureVideoFrames(video);
      setFaceStatus({ type: 'success', message: 'Checking identity and liveness...' });
      const embedding = await extractSecureFacePackage(canvases);
      const canvas = canvases[canvases.length - 1];
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context is unavailable.');

      // Timestamp overlay
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
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
        face_embedding: embedding
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
          code
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
        code === 'FACE_MISMATCH'
        || code === 'FACE_IDENTITY_CONFLICT'
        || code === 'INVALID_FACE_CAPTURE'
        || !err?.response
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
              setFaceStatus({ type: 'info', message: 'Position your face inside the circle' });
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

        // Ensure user's registered face descriptor is loaded (retry 5 times with buffer)
        if (!userRegisteredFacePackageRef.current) {
          if (!registrationRetryRef.current.isRetrying && errorCode !== 'FACE_NOT_REGISTERED') {
            await loadRegisteredFaceWithRetry(MAX_FACE_REGISTRATION_RETRIES, RETRY_BUFFER_SECONDS);
          }
          return;
        }

        // Compare live face strictly against the current logged-in user's registered face
        const check = await compareLiveFaceToRegistered(vid, userRegisteredFacePackageRef.current);

        if (check.isMatch) {
          validFramesRef.current = Math.min(3, validFramesRef.current + 1);
          setFaceStatus({
            type: 'success',
            message: `Face verified! Hold still... (${validFramesRef.current}/3)`
          });

          if (validFramesRef.current >= 3) {
            captureLockRef.current = true;
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            runCaptureAndSubmit();
          }
        } else {
          // If mismatch or multiple faces or no face, decay frames and display accurate account rejection
          validFramesRef.current = Math.max(0, validFramesRef.current - 1);
          const isHardReject = check.code === 'FACE_MISMATCH' || check.code === 'MULTIPLE_FACES_DETECTED';
          setFaceStatus({
            type: isHardReject ? 'rejected' : 'warning',
            message: check.error || 'Position your face inside the circle'
          });
        }
      } catch (detectionError) {
        validFramesRef.current = Math.max(0, validFramesRef.current - 1);
        setFaceStatus({
          type: 'warning',
          message: detectionError?.message || 'Face analysis failed. Hold still and try again.'
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
  }, [stage, isCameraOpen, videoReady, isProcessing, runCaptureAndSubmit]);

  // ─── QR scan handler ──────────────────────────────────────────────────────
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
          qrVerification: 'VALID'
        });
      }

      toast.success(res.data.message || 'QR valid! Now scanning your face...');
      setTempQrCode(qrCode);

      // Save user's registered face embedding from response if returned
      if (res.data?.face_embedding) {
        setUserRegisteredFacePackage(res.data.face_embedding);
        userRegisteredFacePackageRef.current = res.data.face_embedding;
      } else {
        // Start background verification check with 5 retries and buffer time
        loadRegisteredFaceWithRetry(MAX_FACE_REGISTRATION_RETRIES, RETRY_BUFFER_SECONDS);
      }

      // Automatically transition from QR scanning to Face Verification
      setStage(STAGES.FACE_SCANNING);
      // Wait 350ms to allow mobile hardware to fully switch from rear to front camera
      setTimeout(() => {
        setIsCameraOpen(true);
      }, 350);
    } catch (err) {
      const msg = err?.response?.data?.error || 'QR Verification Failed: Please scan a valid attendance QR code.';
      const code = err?.response?.data?.code || 'QR_INVALID';

      if (import.meta.env.DEV) {
        console.log('[ATTENDANCE VERIFY]', {
          stage: 'QR_INVALID',
          authenticatedUserId: user?.id,
          qrVerification: 'INVALID',
          error: msg
        });
      }

      setError(msg);
      setErrorCode(code);
      setStage(STAGES.QR_INVALID);
      toast.error(msg);
      scanLockRef.current = false;
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

  // ─── Reset / Scan Again ───────────────────────────────────────────────────
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

  // ─── Cancel and return to initial state ───────────────────────────────────
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

  // ─── Cancel face scan and rescan QR ───────────────────────────────────────
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

  // Progress step mapping
  const getProgressStageNumber = () => {
    if (stage === STAGES.VERIFICATION_SUCCESS) return 3;
    if (
      stage === STAGES.FACE_SCANNING ||
      stage === STAGES.FACE_VERIFYING ||
      stage === STAGES.VERIFICATION_FAILED
    ) {
      return 2;
    }
    return 1;
  };
  const activeStepNumber = getProgressStageNumber();

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="intern-scan-page animate-fade-in">
      <div className="scan-page-heading text-center">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Attendance Verification
        </h1>
        <p className="text-gray-500 text-sm">Scan the office QR code and verify your face to record attendance</p>
      </div>

      <div className="scan-progress" aria-label={`Attendance scanning step ${activeStepNumber} of 3`}>
        {[
          { number: 1, label: 'Scan QR' },
          { number: 2, label: 'Verify face' },
          { number: 3, label: 'Recorded' },
        ].map((item, index) => (
          <div
            key={item.number}
            className={`scan-progress__item ${activeStepNumber >= item.number ? 'is-active' : ''} ${activeStepNumber === item.number ? 'is-current' : ''}`}
          >
            <span>{activeStepNumber > item.number ? <CheckCircle /> : item.number}</span>
            <small>{item.label}</small>
            {index < 2 && <i />}
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      {stage === STAGES.VERIFICATION_SUCCESS && scanResult ? (
        /* ── Success Screen ── */
        <div className="card scan-stage-card scan-result-card text-center animate-scale-in">
          <div
            className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: scanResult.scan_type === 'time_in' ? 'linear-gradient(135deg,#15803d,#22c55e)' : 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
          >
            <CheckCircle className="w-10 h-10 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {scanResult.scan_type === 'time_in' ? '✅ Time In Recorded!' : '🎉 Time Out Recorded!'}
          </h2>
          <p className="text-gray-500 mb-6">{scanResult.message || 'Attendance recorded successfully.'}</p>

          <div className="scan-result-details">
            <div>
              <span className="text-gray-500">Intern:</span>
              <span className="font-semibold text-gray-800">{scanResult.intern_name}</span>
            </div>
            <div>
              <span className="text-gray-500">Verification:</span>
              <span className="badge badge-time-in flex items-center gap-1">
                <UserCheck className="w-3 h-3" />
                Verified ({Math.round((scanResult.similarity || 0.95) * 100)}%)
              </span>
            </div>
            <div>
              <span className="text-gray-500">Scan:</span>
              <span className={`badge ${scanResult.scan_type === 'time_in' ? 'badge-time-in' : 'badge-time-out'}`}>
                {scanResult.scan_label || (scanResult.scan_type === 'time_in' ? 'Time In' : 'Time Out')}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Date:</span>
              <span className="font-medium">{safeFormatDate(scanResult.scan_time, 'MMMM dd, yyyy')}</span>
            </div>
            <div>
              <span className="text-gray-500">Time:</span>
              <span className="font-medium">{safeFormatDate(scanResult.scan_time, 'hh:mm:ss a')}</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <span className="badge badge-pending">Pending Approval</span>
            </div>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Your attendance has been recorded with account-specific biometric face verification.
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
      ) : stage === STAGES.CAMERA_OFF ? (
        /* ── Screen 1: Camera Off (Manual Start Camera Only) ── */
        <div className="card scan-stage-card text-center p-8 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center">
            <CameraOff className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Attendance Verification
            </h2>
            <p className="text-sm text-gray-500 mt-1">Camera is currently off.</p>
          </div>

          <div className="next-scan-indicator mx-auto max-w-xs">
            <Clock />
            <span><small>Next scan</small><strong>{nextScanHint}</strong></span>
          </div>

          {registrationRetryState.isRetrying && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1 text-sm text-blue-700 max-w-sm mx-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 flex-shrink-0" />
                  <span className="font-semibold text-xs">Checking Face ID registration...</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {registrationRetryState.currentAttempt}/{registrationRetryState.maxAttempts}
                </span>
              </div>
              {registrationRetryState.bufferSecondsRemaining > 0 && (
                <p className="text-xs text-blue-600">
                  Buffering next attempt in {registrationRetryState.bufferSecondsRemaining}s...
                </p>
              )}
            </div>
          )}

          {error && !registrationRetryState.isRetrying && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2 text-sm text-red-700 max-w-sm mx-auto text-left">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
              {errorCode === 'FACE_NOT_REGISTERED' && (
                <>
                  <div className="w-full flex items-center justify-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                    <UserCheck className="w-4 h-4 flex-shrink-0" />
                    <span>Contact administrator for biometric enrollment</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleManualRetryFaceRegistration}
                    className="btn btn-sm btn-outline w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg border-red-300 text-red-700 hover:bg-red-100"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry Face ID Check (5 Attempts)
                  </button>
                </>
              )}
            </div>
          )}

          <div className="pt-2">
            <button
              id="start-camera-btn"
              type="button"
              onClick={handleStartCamera}
              disabled={isStartingCamera || cooldown > 0 || faceCooldown > 0}
              className="btn btn-primary w-full max-w-sm mx-auto flex items-center justify-center gap-2 py-3 text-base font-semibold shadow-md hover:shadow-lg transition-all"
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

          <div className="scan-help-note max-w-sm mx-auto mt-4 text-left">
            <Shield />
            <p><strong>Account Security:</strong> Your face must match the registered face for this account.</p>
          </div>
        </div>
      ) : stage === STAGES.FACE_SCANNING || stage === STAGES.FACE_VERIFYING || stage === STAGES.VERIFICATION_FAILED ? (
        /* ── Screen 3: Face Verification Screen ── */
        <div className="card scan-stage-card scan-stage-card--face">
          <div className="scan-stage-heading">
            <Camera className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="font-bold text-gray-800">Face Verification</h2>
              <p>Now position your face inside the frame</p>
            </div>
          </div>

          {/* Active Retry Banner */}
          {registrationRetryState.isRetrying && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1.5 text-sm text-blue-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 flex-shrink-0" />
                  <span className="font-semibold">Checking Face ID enrollment...</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  Attempt {registrationRetryState.currentAttempt} of {registrationRetryState.maxAttempts}
                </span>
              </div>
              {registrationRetryState.bufferSecondsRemaining > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-blue-600 pl-6">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Buffer delay: retrying in {registrationRetryState.bufferSecondsRemaining}s...</span>
                </div>
              )}
            </div>
          )}

          {/* Error banner */}
          {error && !registrationRetryState.isRetrying && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2 text-sm text-red-700">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="font-semibold">{error}</span>
              </div>
              {errorCode === 'FACE_NOT_REGISTERED' && (
                <>
                  <div className="w-full flex items-center justify-center gap-2 mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                    <UserCheck className="w-4 h-4 flex-shrink-0" />
                    <span>Contact your administrator or supervisor for in-person biometric enrollment</span>
                  </div>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleManualRetryFaceRegistration}
                      className="btn btn-sm btn-outline flex-1 flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg border-red-300 text-red-700 hover:bg-red-100 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Retry Face ID Check (5 Attempts)
                    </button>
                    <button
                      type="button"
                      onClick={handleRescanQr}
                      className="btn btn-sm btn-secondary text-xs py-2 px-3 rounded-lg"
                    >
                      Rescan QR
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Video feed */}
          <div className="face-camera-viewport">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />

            {/* Dynamic oval */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`face-camera-guide transition-all duration-300 ${
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
              {isProcessing || stage === STAGES.FACE_VERIFYING ? 'Verifying Face...' : 'Face Recognition'}
            </div>
          </div>

          {/* Status bar */}
          <div className={`p-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-center transition-all ${
            faceStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            faceStatus.type === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200' :
            faceStatus.type === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {isProcessing || stage === STAGES.FACE_VERIFYING ? (
              <Clock className="w-4 h-4 animate-spin flex-shrink-0" />
            ) : faceStatus.type === 'success' ? (
              <UserCheck className="w-4 h-4 animate-bounce flex-shrink-0" />
            ) : faceStatus.type === 'rejected' ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <Camera className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{isProcessing || stage === STAGES.FACE_VERIFYING ? 'Verifying Face...' : faceStatus.message}</span>
          </div>

          <p className="scan-camera-hint">
            Look directly at the camera — attendance is recorded automatically when your face is recognized.
          </p>

          {/* Action buttons */}
          {errorCode === 'FACE_NOT_REGISTERED' ? (
            <div className="space-y-2">
              <button
                type="button"
                className="btn btn-primary w-full flex items-center justify-center gap-2 text-sm"
                onClick={handleManualRetryFaceRegistration}
                disabled={registrationRetryState.isRetrying}
              >
                <RotateCcw className={`w-4 h-4 ${registrationRetryState.isRetrying ? 'animate-spin' : ''}`} />
                {registrationRetryState.isRetrying
                  ? `Checking Face ID (${registrationRetryState.currentAttempt}/${registrationRetryState.maxAttempts})...`
                  : 'Retry Face ID Check (5 Attempts)'}
              </button>
              <button
                type="button"
                className="btn btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                onClick={handleRescanQr}
              >
                <RotateCcw className="w-4 h-4" />
                Cancel & Rescan QR
              </button>
            </div>
          ) : (
            <button
              className="btn btn-secondary w-full flex items-center justify-center gap-2 text-sm"
              onClick={handleRescanQr}
              disabled={isProcessing}
            >
              <RotateCcw className="w-4 h-4" />
              Cancel & Rescan QR
            </button>
          )}
        </div>
      ) : (
        /* ── Screen 2: QR Scanner Screen (Active only after Start Camera) ── */
        <div className="card scan-stage-card scan-stage-card--qr">
          <div className="scan-stage-heading">
            <QrCode className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="font-bold text-gray-800">Scan QR Code</h2>
              <p>Position the attendance QR code inside the frame</p>
            </div>
          </div>
          <div>
            {stage === STAGES.QR_VERIFYING && (
              <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-2 text-sm text-yellow-700">
                <Clock className="w-4 h-4 animate-spin" />
                Validating QR code...
              </div>
            )}
            <div className="next-scan-indicator">
              <Clock />
              <span><small>Next scan</small><strong>{nextScanHint}</strong></span>
            </div>
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  {error}
                  {faceCooldown > 0 ? ` (${faceCooldown}s remaining)` : ''}
                </span>
              </div>
            )}

            <QRScanner onScan={handleScan} isActive={isCameraStarted && stage === STAGES.QR_SCANNING} />

            <div className="mt-4">
              <button
                type="button"
                className="btn btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                onClick={handleCancel}
              >
                <CameraOff className="w-4 h-4 text-gray-600" />
                Cancel & Turn Off Camera
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
