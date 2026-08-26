import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, Loader2 } from 'lucide-react';

export default function QRScanner({ onScan, onError, isActive }) {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef(null);
  const containerId = 'qr-reader-container';

  const startScanner = async () => {
    setLoading(true);
    setError('');
    try {
      const html5Qr = new Html5Qrcode(containerId);
      scannerRef.current = html5Qr;

      await html5Qr.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const availableEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const edge = Math.floor(Math.min(280, availableEdge * 0.76));
            return { width: edge, height: edge };
          },
        },
        (decodedText) => {
          onScan(decodedText);
        },
        () => {} // ignore scan errors
      );
      setStarted(true);
    } catch (err) {
      const msg = err?.message?.includes('permission')
        ? 'Camera permission denied. Please allow camera access and try again.'
        : 'Could not start camera. Ensure your device has a camera.';
      setError(msg);
      if (onError) onError(msg);
    } finally {
      setLoading(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
      setStarted(false);
    }
  };

  // Stop when component unmounts or isActive changes
  useEffect(() => {
    if (!isActive) {
      stopScanner();
    }
    return () => {
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        scanner.stop().catch(() => {}).finally(() => {
          try { scanner.clear(); } catch {}
        });
      }
    };
  }, [isActive]);

  return (
    <div className="qr-scanner space-y-4">
      {/* Camera viewport */}
      <div className="qr-scanner-container rounded-2xl overflow-hidden">
        <div id={containerId} className="qr-reader-surface w-full" />
        {!started && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 rounded-2xl">
            <Camera className="w-16 h-16 text-blue-400 mb-4" />
            <p className="text-white font-medium mb-1">Camera Ready</p>
            <p className="text-gray-400 text-sm">Click Start to activate scanner</p>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/95 rounded-2xl">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <CameraOff className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="qr-scanner-controls">
        {!started ? (
          <button
            id="qr-start-btn"
            className="btn btn-primary btn-mobile-full"
            onClick={startScanner}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
            ) : (
              <><Camera className="w-4 h-4" /> Start Camera</>
            )}
          </button>
        ) : (
          <button
            id="qr-stop-btn"
            className="btn btn-danger btn-mobile-full"
            onClick={stopScanner}
          >
            <CameraOff className="w-4 h-4" /> Stop Camera
          </button>
        )}
      </div>
    </div>
  );
}
