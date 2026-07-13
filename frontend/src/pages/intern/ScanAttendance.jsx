import { useState, useEffect, useRef } from 'react';
import { QrCode, CheckCircle, AlertCircle, Clock, Shield } from 'lucide-react';
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

  const handleScan = async (qrCode) => {
    if (scanLockRef.current || scanning || cooldown > 0 || scanResult) return;
    scanLockRef.current = true;
    setScanning(true);
    setError('');

    try {
      await new Promise(resolve => setTimeout(resolve, SCAN_BUFFER_MS));
      const res = await backendApi.post('/attendance/scan', { qr_code: qrCode });
      setScanResult(res.data);
      setScannerActive(false);
      setNextScanHint(res.data.next_scan_label || 'Ready to scan');
      toast.success(res.data.message);
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Scan failed. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setScanning(false);
      scanLockRef.current = false;
    }
  };

  const handleReset = () => {
    if (cooldown > 0) return;
    setScanResult(null);
    setError('');
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
