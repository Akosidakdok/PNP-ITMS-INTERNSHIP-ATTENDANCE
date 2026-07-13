import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, RefreshCw } from 'lucide-react';
import backendApi from '../../utils/backendApi.js';
import toast from 'react-hot-toast';

export default function QRDisplay() {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  const fetchAndRender = async () => {
    setLoading(true);
    try {
      const res = await backendApi.get('/attendance/qr-code');
      setQrData(res.data.qr);
    } catch {
      toast.error('Failed to load QR code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAndRender();
  }, []);

  useEffect(() => {
    if (!loading && qrData && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrData.qr_code, {
        width: 280,
        margin: 2,
        color: { dark: '#002060', light: '#ffffff' },
      }).catch(err => {
        console.error('QR code render error:', err);
      });
    }
  }, [loading, qrData]);

  const handleRegenerate = async () => {
    if (!confirm('Regenerate QR code? All interns must scan the new code.')) return;
    try {
      await backendApi.post('/attendance/qr-code/regenerate');
      toast.success('QR code regenerated');
      fetchAndRender();
    } catch {
      toast.error('Failed to regenerate QR code');
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'PNP-ITMS-Office-QR.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="card p-6 text-center">
      <h3 className="font-bold text-gray-800 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Office QR Code
      </h3>
      <p className="text-xs text-gray-500 mb-4">Place this at the PNP-ITMS office entrance</p>

      <div className="inline-block p-4 bg-white border-2 border-blue-100 rounded-2xl shadow-inner mb-4">
        {loading ? (
          <div className="w-72 h-72 skeleton rounded-xl" />
        ) : (
          <canvas ref={canvasRef} className="rounded-xl" />
        )}
      </div>

      {qrData && (
        <p className="text-xs text-gray-400 mb-4 font-mono break-all px-4">{qrData.qr_code}</p>
      )}

      <div className="flex justify-center gap-3">
        <button id="download-qr-btn" className="btn btn-secondary btn-sm" onClick={handleDownload} disabled={loading}>
          <Download className="w-4 h-4" /> Download
        </button>
        <button id="regenerate-qr-btn" className="btn btn-danger btn-sm" onClick={handleRegenerate} disabled={loading}>
          <RefreshCw className="w-4 h-4" /> Regenerate
        </button>
      </div>
    </div>
  );
}
