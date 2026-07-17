import { useState, useEffect, useRef } from 'react';
import { QrCode, CheckCircle, AlertCircle, Clock, Shield, Camera, RotateCcw } from 'lucide-react';
import QRScanner from '../../components/qr/QRScanner.jsx';
import backendApi from '../../utils/backendApi.js';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const SCAN_BUFFER_MS = 7000;
const COOLDOWN_SECONDS = 10;

export default function ScanAttendance() {
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [nextScanHint, setNextScanHint] = useState('Loading next scan...');
  const scanLockRef = useRef(false);

  const [tempQrCode, setTempQrCode] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    async function loadNextScanHint() {
      try {
        const res = await backendApi.get('/attendance/next-scan');
        setNextScanHint(res.data.next_scan_label || 'Ready to scan');
      } catch (err) {
        setNextScanHint('Unable to load next scan');
      }
    }

    loadNextScanHint();
  }, []);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  useEffect(() => {
    if (isCapturingPhoto && !photo) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          toast.error('Failed to access front camera for selfie. Please check permissions.');
          setIsCapturingPhoto(false);
          setScannerActive(true);
          setTempQrCode(null);
        });
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isCapturingPhoto, photo]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleScan = async (qrCode) => {
    if (scanLockRef.current || scanning || cooldown > 0 || scanResult) return;
    scanLockRef.current = true;
    setScanning(true);
    setError('');

    try {
      const validateRes = await backendApi.post('/attendance/validate-qr', { qr_code: qrCode });
      toast.success(validateRes.data.message || 'QR Scan Valid! Please take a selfie to verify.');
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setTempQrCode(qrCode);
      setScannerActive(false);
      setIsCapturingPhoto(true);
    } catch (err) {
      const msg = err?.response?.data?.error || 'QR validation failed. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setScanning(false);
      scanLockRef.current = false;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Date and time overlay strictly in Asia/Manila (Philippines) timezone
    const options = {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const second = parts.find(p => p.type === 'second').value;
    const dayPeriod = parts.find(p => p.type === 'dayPeriod').value;
    const stampText = `${year}-${month}-${day} ${hour}:${minute}:${second} ${dayPeriod}`;

    ctx.font = 'bold 20px Outfit, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    ctx.lineWidth = 4;
    ctx.strokeText(stampText, 20, canvas.height - 25);
    ctx.fillText(stampText, 20, canvas.height - 25);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPhoto(dataUrl);
    stopCamera();
  };

  const submitScan = async () => {
    if (!photo || !tempQrCode || scanning) return;
    setScanning(true);
    setError('');

    try {
      const res = await backendApi.post('/attendance/scan', { qr_code: tempQrCode, photo });
      setScanResult(res.data);
      setIsCapturingPhoto(false);
      setPhoto(null);
      setTempQrCode(null);
      setScannerActive(false);
      setNextScanHint(res.data.next_scan_label || 'Ready to scan');
      toast.success(res.data.message);
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Scan failed. Please try again.';
      setError(msg);
      toast.error(msg);
      // Let them retry capturing or scanning
      setIsCapturingPhoto(true);
      setPhoto(null);
    } finally {
      setScanning(false);
    }
  };

  const handleReset = () => {
    if (cooldown > 0) return;
    setScanResult(null);
    setError('');
    setPhoto(null);
    setTempQrCode(null);
    setIsCapturingPhoto(false);
    setScannerActive(true);
    setNextScanHint('Loading next scan...');

    backendApi.get('/attendance/next-scan')
      .then(res => setNextScanHint(res.data.next_scan_label || 'Ready to scan'))
      .catch(() => setNextScanHint('Unable to load next scan'));
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
          QR Attendance Scanner
        </h1>
        <p className="text-gray-500 text-sm">Scan the office QR code to record your attendance</p>
      </div>

      {/* Instructions */}
      <div className="card p-4 bg-blue-50 border border-blue-100">
        <div className="flex gap-3">
          <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-semibold mb-1">How to scan:</p>
            <ol className="list-decimal ml-4 space-y-1 text-blue-600">
              <li>Click "Start Camera" below</li>
              <li>Point your camera at the office QR code</li>
              <li>Hold steady — the system will scan automatically</li>
              <li>Wait for the success message</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Scanner or Result */}
      {!scanResult ? (
        tempQrCode ? (
          /* Selfie Mode Card */
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Camera className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-gray-800">
                {!photo ? 'Selfie Verification' : 'Verify Captured Photo'}
              </h2>
            </div>
            
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            
            {!photo ? (
              /* Camera Active State */
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-gray-200 shadow-inner flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider">
                    Live Front Camera
                  </div>
                </div>
                <p className="text-xs text-gray-400 text-center">Please take a clear photo of yourself inside the office to complete your scan.</p>
                <button
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                  onClick={capturePhoto}
                >
                  <Camera className="w-4 h-4" /> Capture Photo
                </button>
              </div>
            ) : (
              /* Photo Captured Preview State */
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-md">
                  <img
                    src={photo}
                    alt="Captured Selfie"
                    className="w-full h-auto object-cover"
                  />
                  <div className="absolute top-3 left-3 bg-blue-600 text-white text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider">
                    Stamped Preview
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-secondary flex-1 flex items-center justify-center gap-1"
                    onClick={() => setPhoto(null)}
                    disabled={scanning}
                  >
                    <RotateCcw className="w-4 h-4" /> Retake
                  </button>
                  <button
                    className="btn btn-primary flex-1 flex items-center justify-center gap-1"
                    onClick={submitScan}
                    disabled={scanning}
                  >
                    {scanning ? 'Submitting...' : 'Submit Attendance'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* QR Code Scanner Card */
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <QrCode className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-gray-800">Camera Scanner</h2>
            </div>
            {scanning && (
              <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-2 text-sm text-yellow-700">
                <Clock className="w-4 h-4 animate-spin" />
                Processing scan...
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
        )
      ) : (
        /* Success Screen */
        <div className="card p-8 text-center animate-scale-in">
          <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: scanResult.scan_type === 'time_in' ? 'linear-gradient(135deg, #15803d, #22c55e)' : 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
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
              <span className="text-gray-500">Scan:</span>
              <span className={`badge ${scanResult.scan_type === 'time_in' ? 'badge-time-in' : 'badge-time-out'}`}>
                {scanResult.scan_label || (scanResult.scan_type === 'time_in' ? 'Time In' : 'Time Out')}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Date:</span>
              <span className="font-medium">{format(new Date(scanResult.scan_time), 'MMMM dd, yyyy')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Time:</span>
              <span className="font-medium">{format(new Date(scanResult.scan_time), 'hh:mm:ss a')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status:</span>
              <span className="badge badge-pending">Pending Approval</span>
            </div>
          </div>

          <p className="text-xs text-gray-400 mb-4">Your attendance has been recorded and sent to the administrator for approval.</p>

          <button 
            id="scan-again-btn" 
            className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={handleReset}
            disabled={cooldown > 0}
          >
            {cooldown > 0 ? `Scan Again (${cooldown}s)` : 'Scan Again'}
          </button>
        </div>
      )}
    </div>
  );
}
