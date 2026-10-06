import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, Loader2, SwitchCamera, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function QRScanner({ onScan, onError, isActive = true }) {
  const [scanState, setScanState] = useState('idle'); // 'idle' | 'initializing' | 'scanning' | 'detected' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [cameras, setCameras] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const containerIdRef = useRef(`qr-reader-surface-${Math.random().toString(36).slice(2, 9)}`);
  const scannerRef = useRef(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const isMountedRef = useRef(true);
  const scanLockedRef = useRef(false);
  const activeCameraIdRef = useRef(null);

  // Diagnostic logger in development
  const logDebug = useCallback((...args) => {
    if (import.meta.env.DEV) {
      console.log('[QRScanner]', ...args);
    }
  }, []);

  // Safe scanner stopper that completely releases hardware tracks on mobile
  const stopScanner = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    try {
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        scannerRef.current = null;

        // If scanning is active, stop it
        if (scanner.isScanning) {
          try {
            await scanner.stop();
          } catch (stopErr) {
            logDebug('Non-fatal error stopping scanner:', stopErr?.message);
          }
        }

        try {
          await scanner.clear();
        } catch {}
      }

      // Explicitly turn off all media tracks to guarantee hardware release on iOS/Android
      const container = document.getElementById(containerIdRef.current);
      if (container) {
        const videos = container.querySelectorAll('video');
        videos.forEach(v => {
          if (v.srcObject && typeof v.srcObject.getTracks === 'function') {
            v.srcObject.getTracks().forEach(t => {
              try {
                t.stop();
                t.enabled = false;
              } catch {}
            });
            v.srcObject = null;
          }
        });
      }

      if (isMountedRef.current) {
        setScanState(prev => (prev === 'detected' ? 'detected' : 'idle'));
      }
    } finally {
      isStoppingRef.current = false;
    }
  }, [logDebug]);

  // Enumerate cameras safely using enumerateDevices without triggering secondary getUserMedia on iOS
  const discoverCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return [];
      }
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices
        .filter(d => d.kind === 'videoinput')
        .map((d, index) => ({
          id: d.deviceId,
          label: d.label || `Camera ${index + 1}`
        }));

      if (videoDevices.length > 0) {
        if (isMountedRef.current) {
          setCameras(videoDevices);
          setHasMultipleCameras(videoDevices.length > 1);
        }

        // Identify rear/environment camera index if labeled
        const rearIdx = videoDevices.findIndex(d => 
          /back|rear|environment|posterior|reverse/i.test(d.label || '')
        );
        if (rearIdx >= 0 && isMountedRef.current) {
          setCurrentCameraIndex(rearIdx);
        }
        return videoDevices;
      }
      return [];
    } catch (err) {
      logDebug('Camera enumeration notice:', err?.message);
      return [];
    }
  }, [logDebug]);

  // Main scanner starter: tailored for iOS Safari, Android Chrome & PWAs
  const startScanner = useCallback(async (forcedCameraConfig = null) => {
    if (!isActive || !isMountedRef.current) return;
    if (isStartingRef.current) return;

    isStartingRef.current = true;
    scanLockedRef.current = false;
    setScanState('initializing');
    setErrorMessage('');

    try {
      // Step 1: Check browser media support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('UNSUPPORTED_BROWSER');
      }

      // Check secure context (HTTPS / localhost required for camera access)
      if (window.isSecureContext === false) {
        throw new Error('INSECURE_CONTEXT');
      }

      // Clean up any stale scanner instance first
      await stopScanner();

      // Ensure container element is in DOM
      const targetElement = document.getElementById(containerIdRef.current);
      if (!targetElement) {
        throw new Error('CONTAINER_NOT_FOUND');
      }

      // Observe video element insertion to guarantee iOS Safari inline playback attributes
      const videoObserver = new MutationObserver(() => {
        const vid = targetElement.querySelector('video');
        if (vid) {
          vid.setAttribute('playsinline', 'true');
          vid.setAttribute('webkit-playsinline', 'true');
          vid.muted = true;
          vid.setAttribute('muted', 'true');
        }
      });
      videoObserver.observe(targetElement, { childList: true, subtree: true });

      // Step 2: Determine camera configuration
      // html5-qrcode strictly requires cameraIdOrConfig to have exactly 1 key: either 'facingMode' or 'deviceId'
      let cameraConfig;
      if (forcedCameraConfig) {
        cameraConfig = forcedCameraConfig;
      } else {
        cameraConfig = { facingMode: 'environment' };
      }

      const html5Qr = new Html5Qrcode(containerIdRef.current, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: false,
        },
        verbose: false,
      });
      scannerRef.current = html5Qr;

      logDebug('Starting scanner with config:', cameraConfig);

      const onScanSuccess = async (decodedText) => {
        // Success callback: prevent duplicates immediately
        if (scanLockedRef.current) return;
        scanLockedRef.current = true;

        logDebug('QR detected successfully:', decodedText?.slice(0, 24));
        if (isMountedRef.current) {
          setScanState('detected');
        }

        videoObserver.disconnect();

        try {
          if (onScan) {
            await onScan(decodedText);
          }
          await stopScanner();
        } catch (scanErr) {
          logDebug('onScan validation failed, resuming scanner:', scanErr);
          scanLockedRef.current = false;
          if (isMountedRef.current) {
            setScanState('scanning');
          }
        }
      };

      const onScanFailure = () => {
        // Normal frame search tick — ignore
      };

      // Step 3: Start scanning full-frame
      try {
        await html5Qr.start(
          cameraConfig,
          {
            fps: 15,
            disableFlip: true,
          },
          onScanSuccess,
          onScanFailure
        );
      } catch (firstErr) {
        logDebug('Starting with environment camera failed, trying user camera fallback:', firstErr);
        await html5Qr.start(
          { facingMode: 'user' },
          {
            fps: 15,
            disableFlip: true,
          },
          onScanSuccess,
          onScanFailure
        );
      }

      videoObserver.disconnect();

      // Ensure video element plays on iOS Safari
      const vid = targetElement.querySelector('video');
      if (vid) {
        vid.setAttribute('playsinline', 'true');
        vid.setAttribute('webkit-playsinline', 'true');
        vid.muted = true;
        vid.play().catch(() => {});
      }

      if (isMountedRef.current) {
        setScanState('scanning');
      }

      // Asynchronously discover available cameras for switching (without blocking start)
      if (cameras.length === 0) {
        discoverCameras();
      }
    } catch (err) {
      logDebug('Camera start error:', err);
      const rawErr = typeof err === 'string' ? err : (err?.message || err?.name || String(err || ''));
      const errName = err?.name || '';
      const errMsg = (err?.message || rawErr).toLowerCase();

      // If OverconstrainedError occurs (e.g. device has no environment camera), fallback to user camera
      if (
        (errName === 'OverconstrainedError' || errMsg.includes('overconstrained')) &&
        (!forcedCameraConfig || forcedCameraConfig.facingMode !== 'user')
      ) {
        logDebug('Environment camera overconstrained, trying user camera fallback...');
        isStartingRef.current = false;
        if (isMountedRef.current && isActive) {
          try {
            await startScanner({ facingMode: 'user' });
            return;
          } catch (fallbackErr) {
            logDebug('User camera fallback failed:', fallbackErr);
          }
        }
      }

      let userMsg = 'Could not access camera. Ensure your device has an active camera.';

      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errMsg.includes('notallowederror') ||
        errMsg.includes('permission') ||
        errMsg.includes('denied') ||
        errMsg.includes('not allowed') ||
        errMsg.includes('user denied')
      ) {
        userMsg = 'Camera permission was not granted.';
      } else if (
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        errMsg.includes('notfounderror') ||
        errMsg.includes('no_camera_found') ||
        errMsg.includes('no cameras')
      ) {
        userMsg = 'No camera device found on this device.';
      } else if (
        errName === 'NotReadableError' ||
        errName === 'TrackStartError' ||
        errMsg.includes('notreadableerror') ||
        errMsg.includes('trackstarterror') ||
        errMsg.includes('already in use')
      ) {
        userMsg = 'Camera is currently in use by another app or tab. Please close other camera apps and try again.';
      } else if (errMsg.includes('insecure') || errMsg.includes('https')) {
        userMsg = 'Camera access requires a secure HTTPS connection or localhost.';
      } else if (errMsg.includes('unsupported')) {
        userMsg = 'Your browser does not support camera access. Please use modern Chrome or Safari.';
      } else if (rawErr) {
        userMsg = `Camera error: ${rawErr}`;
      }

      if (isMountedRef.current) {
        setScanState('error');
        setErrorMessage(userMsg);
        if (onError) onError(userMsg);
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [isActive, cameras, currentCameraIndex, discoverCameras, logDebug, onError, onScan, stopScanner]);

  // Direct user-gesture retry handler: triggers explicit getUserMedia on click to wake up iOS permission dialog
  const handleRetry = useCallback(async () => {
    setScanState('initializing');
    setErrorMessage('');
    try {
      if (navigator?.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => {
          try {
            t.stop();
            t.enabled = false;
          } catch {}
        });
        // Short buffer to let iOS hardware release track before html5-qrcode binds
        await new Promise(r => setTimeout(r, 250));
      }
    } catch (testErr) {
      logDebug('Direct permission check notice:', testErr?.name || testErr?.message);
    }
    startScanner();
  }, [logDebug, startScanner]);

  // Switch between front / rear or multi-rear cameras
  const handleSwitchCamera = useCallback(async () => {
    if (cameras.length <= 1 || isStartingRef.current || isStoppingRef.current) return;
    const nextIdx = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIdx);
    const nextCamera = cameras[nextIdx];
    logDebug('Switching camera to:', nextCamera.label || nextCamera.id);
    await startScanner({ deviceId: { exact: nextCamera.id } });
  }, [cameras, currentCameraIndex, logDebug, startScanner]);

  // Auto-start when isActive becomes true; stop when false
  useEffect(() => {
    isMountedRef.current = true;

    if (isActive) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      isMountedRef.current = false;
      stopScanner();
    };
  }, [isActive, startScanner, stopScanner]);

  // Handle PWA page visibility changes (phone sleep, backgrounding, tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        logDebug('App hidden/backgrounded — releasing camera');
        stopScanner();
      } else if (document.visibilityState === 'visible' && isActive) {
        logDebug('App foregrounded/active — restarting camera');
        setTimeout(() => {
          if (isMountedRef.current && isActive) {
            startScanner();
          }
        }, 300);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, logDebug, startScanner, stopScanner]);

  return (
    <div className="qr-scanner animate-fade-in">
      {/* Camera Viewport Container */}
      <div className="qr-scanner-container relative rounded-2xl overflow-hidden bg-black shadow-inner border border-gray-800">
        <div id={containerIdRef.current} className="qr-reader-surface w-full min-h-[280px]" />

        {/* State 1: Initializing */}
        {scanState === 'initializing' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-950/90 text-white p-6 text-center space-y-3">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            <div>
              <p className="font-semibold text-sm">Initializing camera...</p>
              <p className="text-xs text-gray-400 mt-0.5">Requesting camera stream and preparing scanner</p>
            </div>
          </div>
        )}

        {/* State 2: Stopped / Idle */}
        {scanState === 'idle' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-950/95 text-white p-6 text-center space-y-3">
            <Camera className="w-14 h-14 text-blue-400/80 mb-1" />
            <div>
              <p className="font-semibold text-base">Camera Ready</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                Tap Start to activate your camera and scan the office QR code
              </p>
            </div>
            <button
              type="button"
              onClick={() => startScanner()}
              className="btn btn-primary px-6 py-2.5 text-sm font-semibold rounded-xl mt-2 flex items-center gap-2 shadow-lg"
            >
              <Camera className="w-4 h-4" /> Start Camera
            </button>
          </div>
        )}

        {/* State 3: QR Detected */}
        {scanState === 'detected' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-emerald-950/90 text-white p-6 text-center space-y-3 animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-300">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-base text-emerald-200">QR Code Detected</p>
              <p className="text-xs text-emerald-300/80 mt-0.5">Proceeding to Face ID verification...</p>
            </div>
          </div>
        )}

        {/* Active Scanning Overlay (guide frame & animated scanline) */}
        {scanState === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-4 z-10">
            {/* Top pill badge */}
            <div className="bg-black/70 backdrop-blur-md text-white text-[11px] font-medium px-3 py-1 rounded-full border border-white/10 flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Scanning for QR Code
            </div>

            {/* Crosshairs & Target Area */}
            <div className="relative w-64 h-64 border-2 border-blue-400/60 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.3)] flex items-center justify-center">
              {/* Corner markers */}
              <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-blue-400 rounded-tl-lg -mt-1 -ml-1" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-blue-400 rounded-tr-lg -mt-1 -mr-1" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-blue-400 rounded-bl-lg -mb-1 -ml-1" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-blue-400 rounded-br-lg -mb-1 -mr-1" />

              {/* Scanning laser line */}
              <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_8px_#38bdf8] animate-pulse" />
            </div>

            {/* Bottom guide text */}
            <div className="bg-black/60 backdrop-blur-sm text-gray-200 text-[11px] px-3 py-1 rounded-full">
              Position the entire QR code inside the box
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 space-y-2 animate-fade-in shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 text-red-600 flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <p className="font-semibold text-red-900">{errorMessage}</p>
              <p className="text-[11px] text-red-700/90 leading-relaxed">
                If camera permission was not granted or blocked, check the settings below:
              </p>
            </div>
          </div>
          <div className="bg-white/90 p-2.5 rounded-xl border border-red-100 text-[11px] text-red-950 space-y-1.5">
            <p className="font-semibold text-red-900">How to allow camera on iPhone:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 pl-0.5">
              <li>
                <span className="font-medium text-gray-900">Safari Browser:</span> Tap <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-[10px]">aA</span> in the URL bar &gt; <strong>Website Settings</strong> &gt; set <strong>Camera</strong> to <strong>Allow</strong>.
              </li>
              <li>
                <span className="font-medium text-gray-900">Home Screen App (PWA):</span> Open iPhone <strong>Settings</strong> &gt; <strong>Safari</strong> &gt; <strong>Camera</strong> &gt; choose <strong>Allow</strong>.
              </li>
              <li>
                Ensure iPhone <strong>Settings &gt; Privacy &amp; Security &gt; Camera</strong> has Safari enabled.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Controls & Camera Switcher */}
      <div className="qr-scanner-controls flex items-center justify-center gap-2 pt-1">
        {scanState === 'scanning' ? (
          <>
            {hasMultipleCameras && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                className="btn btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 rounded-xl border border-gray-300 hover:bg-gray-100 transition-colors"
                title="Switch Camera (Front/Rear)"
              >
                <SwitchCamera className="w-4 h-4 text-gray-700" />
                Switch Camera
              </button>
            )}

            <button
              type="button"
              id="qr-stop-btn"
              onClick={stopScanner}
              className="btn btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 rounded-xl border border-gray-300 hover:bg-gray-100 transition-colors"
            >
              <CameraOff className="w-4 h-4 text-red-600" />
              Stop Camera
            </button>
          </>
        ) : scanState === 'error' ? (
          <button
            type="button"
            onClick={handleRetry}
            className="btn btn-primary text-xs flex items-center gap-1.5 py-2 px-4 rounded-xl shadow-md"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Camera
          </button>
        ) : (
          <button
            type="button"
            id="qr-start-btn"
            onClick={() => startScanner()}
            disabled={scanState === 'initializing'}
            className="btn btn-primary text-xs flex items-center gap-1.5 py-2 px-4 rounded-xl shadow-md disabled:opacity-50"
          >
            {scanState === 'initializing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting Camera...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                Start Camera
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
