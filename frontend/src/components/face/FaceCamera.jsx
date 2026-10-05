import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RefreshCw, AlertCircle, CheckCircle2, ShieldAlert, SwitchCamera } from 'lucide-react';
import { analyzeFaceQuality, initializeFaceModels } from '../../utils/mediapipeService.js';
import {
  captureVideoFrames,
  initializeFaceIdentity,
} from '../../utils/faceIdentityService.js';

export default function FaceCamera({
  onCapture,
  disabled = false,
  disabledMessage = '',
  title = 'Face Scanner',
  actionLabel = 'Capture & Save Face ID',
  className = ''
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const analysisBusyRef = useRef(false);
  const isMountedRef = useRef(true);

  const [videoReady, setVideoReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [faceReady, setFaceReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [statusMessage, setStatusMessage] = useState('Initializing camera...');
  const [statusType, setStatusType] = useState('info'); // 'info', 'warning', 'success', 'error'
  const [isProcessing, setIsProcessing] = useState(false);
  const [facingMode, setFacingMode] = useState('user'); // 'user' | 'environment'
  const [availableCamerasCount, setAvailableCamerasCount] = useState(1);

  const stopCamera = useCallback(() => {
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

  const startCamera = useCallback(async (desiredFacingMode = facingMode) => {
    if (!isMountedRef.current) return;
    try {
      setCameraError('');
      setVideoReady(false);
      setFaceReady(false);
      setStatusMessage('Loading Face ID engine and requesting camera access...');
      setStatusType('info');

      // Check available cameras count
      if (navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
          if (isMountedRef.current) {
            setAvailableCamerasCount(videoDevices.length);
          }
        } catch {}
      }

      const modelPromise = Promise.all([
        initializeFaceModels(),
        initializeFaceIdentity(),
      ]);

      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: desiredFacingMode,
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        const vid = videoRef.current;
        vid.srcObject = stream;
        vid.setAttribute('playsinline', 'true');
        vid.setAttribute('webkit-playsinline', 'true');
        vid.muted = true;

        const onReady = () => {
          if (!isMountedRef.current) return;
          const playPromise = vid.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                if (isMountedRef.current) setVideoReady(true);
              })
              .catch(() => {
                if (isMountedRef.current) setVideoReady(true);
              });
          } else {
            setVideoReady(true);
          }
        };

        vid.onloadedmetadata = onReady;
        vid.oncanplay = onReady;
      }

      await modelPromise;
      if (isMountedRef.current) {
        setModelReady(true);
        setStatusMessage('Position your face inside the oval');
        setStatusType('info');
      }
    } catch (err) {
      console.error('Face camera initialization error:', err);
      if (!isMountedRef.current) return;
      let errMsg = err?.message || 'Failed to initialize Face ID.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = 'Camera permission denied. Please allow camera access in your browser or device settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errMsg = 'No camera device found on your device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errMsg = 'Camera is already in use by another app. Please close other camera tabs and try again.';
      }
      stopCamera();
      setCameraError(errMsg);
      setStatusMessage(errMsg);
      setStatusType('error');
    }
  }, [facingMode, stopCamera]);

  // Initial camera mount
  useEffect(() => {
    isMountedRef.current = true;
    startCamera(facingMode);

    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [facingMode, startCamera, stopCamera]);

  // Handle visibility changes in PWA
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopCamera();
      } else if (document.visibilityState === 'visible' && isMountedRef.current) {
        setTimeout(() => {
          if (isMountedRef.current) startCamera(facingMode);
        }, 300);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [facingMode, startCamera, stopCamera]);

  // Continuous face inspection loop
  useEffect(() => {
    if (disabled && !isProcessing) {
      setFaceReady(false);
      setStatusMessage(disabledMessage || 'Complete the required information before capturing.');
      setStatusType('warning');
      return undefined;
    }
    if (!videoReady || !modelReady || isProcessing || cameraError) return undefined;

    let active = true;
    const inspectFrame = async () => {
      if (!active || analysisBusyRef.current || !videoRef.current) return;
      const video = videoRef.current;
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return;

      analysisBusyRef.current = true;
      try {
        const quality = await analyzeFaceQuality(video);
        if (!active) return;
        setFaceReady(quality.valid);
        setStatusMessage(
          quality.valid
            ? 'Face ready—hold still and capture'
            : quality.error || 'Position your face inside the oval'
        );
        setStatusType(quality.valid ? 'success' : 'warning');
      } catch (error) {
        if (!active) return;
        setFaceReady(false);
        setStatusMessage(error?.message || 'Could not analyze the camera frame.');
        setStatusType('error');
      } finally {
        analysisBusyRef.current = false;
      }
    };

    inspectFrame();
    const interval = window.setInterval(inspectFrame, 500);
    return () => {
      active = false;
      window.clearInterval(interval);
      analysisBusyRef.current = false;
    };
  }, [videoReady, modelReady, isProcessing, cameraError, disabled, disabledMessage]);

  const toggleCameraFacing = useCallback(() => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
  }, [facingMode]);

  const handleCapture = async () => {
    if (!videoRef.current || !videoReady || !modelReady || !faceReady || isProcessing || disabled) return;
    setIsProcessing(true);
    setFaceReady(false);
    setStatusMessage('Capturing face samples...');
    setStatusType('info');

    try {
      const video = videoRef.current;
      const canvases = await captureVideoFrames(video);

      // Verify at least 3 captured frames have adequate quality
      let validCount = 0;
      let lastQuality = null;
      for (const sampleCanvas of canvases) {
        const q = await analyzeFaceQuality(sampleCanvas);
        if (q.valid) {
          validCount += 1;
        }
        lastQuality = q;
      }

      if (validCount < 2) {
        setStatusMessage(lastQuality?.error || 'Face check failed. Keep centered and hold still.');
        setStatusType('warning');
        return;
      }

      setStatusMessage('Extracting biometric profile...');
      setStatusType('success');

      const cleanCanvas = canvases[canvases.length - 1];
      const canvas = document.createElement('canvas');
      canvas.width = cleanCanvas.width;
      canvas.height = cleanCanvas.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(cleanCanvas, 0, 0);

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
        await onCapture({
          dataUrl,
          canvas: cleanCanvas,
          canvases,
          quality: lastQuality,
        });
      }
      setStatusMessage('Face ID saved successfully.');
      setStatusType('success');
    } catch (err) {
      console.error('Error during capture:', err);
      setStatusMessage(err.message || 'Error capturing face.');
      setStatusType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`card p-4 space-y-4 ${className}`.trim()}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-600" />
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {availableCamerasCount > 1 && (
            <button
              type="button"
              onClick={toggleCameraFacing}
              className="text-xs text-gray-600 hover:text-blue-600 flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg border border-gray-200 transition-colors"
              title="Switch Front/Rear Camera"
            >
              <SwitchCamera className="w-3.5 h-3.5" />
              {facingMode === 'user' ? 'Rear' : 'Front'}
            </button>
          )}
          {videoReady && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Camera Active
            </span>
          )}
        </div>
      </div>

      {/* Camera Container with Face Oval Mask */}
      <div className="face-capture-viewport relative rounded-2xl overflow-hidden bg-black aspect-video border border-gray-200 shadow-inner flex items-center justify-center">
        {cameraError ? (
          <div className="p-6 text-center text-red-400 space-y-2">
            <ShieldAlert className="w-10 h-10 mx-auto text-red-500" />
            <p className="text-sm font-medium">{cameraError}</p>
            <button
              type="button"
              onClick={() => startCamera(facingMode)}
              className="btn btn-secondary text-xs px-3 py-1.5 rounded-lg mt-2"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Retry Camera
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />

            {/* Face Oval Overlay Guide */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`face-capture-guide rounded-[50%] border-2 transition-all duration-300 ${
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
              Secure Face ID
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
        type="button"
        onClick={handleCapture}
        disabled={!videoReady || !modelReady || !faceReady || isProcessing || disabled || !!cameraError}
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
            {actionLabel}
          </>
        )}
      </button>
    </div>
  );
}
