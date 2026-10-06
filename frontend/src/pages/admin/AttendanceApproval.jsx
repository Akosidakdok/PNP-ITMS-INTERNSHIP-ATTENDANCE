import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CheckCircle,
  XCircle,
  Camera,
  Trash2,
  Settings2,
  RotateCcw,
  ChevronRight,
  AlertTriangle,
  Edit3,
  Eye,
  ShieldCheck,
  Download,
  Calendar,
  Upload,
  Image as ImageIcon,
  ZoomIn,
  RefreshCw,
  X,
  SwitchCamera,
} from 'lucide-react';
import api from '../../utils/api.js';

import DataTable from '../../components/common/DataTable.jsx';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';
import DTREditModal from '../../components/dtr/DTREditModal.jsx';
import BulkDTROverrideModal from '../../components/dtr/BulkDTROverrideModal.jsx';
import { divisionLabel } from '../../utils/display.js';

function WatermarkedSelfie({ photoUrl, recordDate, recordTime, isSuperadmin }) {
  const [mode, setMode] = useState('official'); // 'official' | 'audit'
  const [renderedImage, setRenderedImage] = useState({ photoUrl: '', stamp: '', url: '' });
  const [renderError, setRenderError] = useState('');

  const activeMode = isSuperadmin ? mode : 'official';

  const officialStamp = useMemo(() => {
    if (!recordDate || !recordTime) return '';
    let timeFormatted = recordTime;
    if (!/AM|PM/i.test(recordTime)) {
      const [hStr, mStr, sStr] = recordTime.split(':');
      let h = parseInt(hStr, 10);
      const m = mStr || '00';
      const s = sStr || '00';
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      timeFormatted = `${String(h).padStart(2, '0')}:${m}:${s} ${ampm}`;
    } else if (!/:\d{2}:\d{2}/.test(recordTime)) {
      timeFormatted = recordTime.replace(/^(\d{2}:\d{2})\s*(AM|PM)$/i, '$1:00 $2');
    }
    return `${recordDate} ${timeFormatted}`;
  }, [recordDate, recordTime]);

  const officialImageReady = renderedImage.photoUrl === photoUrl
    && renderedImage.stamp === officialStamp
    && Boolean(renderedImage.url);
  const displayUrl = activeMode === 'audit'
    ? photoUrl
    : (officialImageReady ? renderedImage.url : '');
  const isPreparingOfficialImage = activeMode === 'official'
    && Boolean(photoUrl)
    && !officialImageReady
    && !renderError;

  useEffect(() => {
    if (!photoUrl) {
      setRenderError('');
      return undefined;
    }
    if (activeMode === 'audit') {
      setRenderError('');
      return undefined;
    }

    let cancelled = false;
    setRenderError('');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 640;
        canvas.height = img.naturalHeight || img.height || 480;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context is unavailable.');

        // Normalize the mirrored selfie before applying the official watermark.
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        ctx.restore();

        if (officialStamp) {
          // Use an opaque footer across the full image width. The original
          // camera timestamp can have different digits and width, so a text-
          // sized translucent patch may leave parts of it visible underneath.
          const footerHeight = Math.min(44, canvas.height);
          ctx.fillStyle = '#000';
          ctx.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);

          ctx.font = 'bold 18px sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(officialStamp, canvas.width - 12, canvas.height - footerHeight / 2);
        }

        const renderedUrl = canvas.toDataURL('image/jpeg', 0.9);
        if (!cancelled) {
          setRenderedImage({ photoUrl, stamp: officialStamp, url: renderedUrl });
        }
      } catch (error) {
        console.error('Could not render attendance watermark:', error);
        if (!cancelled) {
          setRenderError('Could not prepare the official image.');
        }
      }
    };
    img.onerror = () => {
      if (cancelled) return;
      setRenderError('Could not load the image for rendering.');
    };
    img.src = photoUrl;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [photoUrl, activeMode, officialStamp]);

  const handleDownload = () => {
    if (!displayUrl) return;
    const link = document.createElement('a');
    link.href = displayUrl;
    const safeDate = (recordDate || 'attendance').replace(/[^\w-]/g, '-');
    link.download = `selfie_${safeDate}_${activeMode}.jpg`;
    link.click();
  };

  return (
    <div className="space-y-2.5 w-full flex flex-col items-center">
      <div className="flex items-center justify-between w-full px-1 text-xs">
        {isSuperadmin ? (
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
            <button
              type="button"
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeMode === 'official'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setMode('official')}
            >
              Official Watermark
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeMode === 'audit'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setMode('audit')}
            >
              Original Camera Watermark
            </button>
          </div>
        ) : (
          <span className="text-xs font-semibold text-slate-700">Official Attendance Watermark</span>
        )}

        <button
          type="button"
          onClick={handleDownload}
          disabled={!displayUrl}
          className="text-slate-600 hover:text-blue-600 font-medium flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded shadow-xs"
        >
          <Download className="w-3.5 h-3.5" /> {isPreparingOfficialImage ? 'Preparing...' : 'Save Image'}
        </button>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-black flex justify-center w-full">
        {displayUrl ? (
          <img
            src={displayUrl}
            alt="Intern Selfie"
            className="max-h-[360px] w-auto object-contain rounded-lg"
          />
        ) : (
          <p className="px-4 py-8 text-center text-sm text-white/80">
            {renderError || (isPreparingOfficialImage ? 'Preparing official image...' : 'Image unavailable')}
          </p>
        )}
      </div>
    </div>
  );
}

const formatPhtDate = value => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
}).format(new Date(value));

const formatPhtTime = (value, includeSeconds = false) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  minute: '2-digit',
  ...(includeSeconds ? { second: '2-digit' } : {}),
  hour12: true,
}).format(new Date(value));

const getPhtDateStr = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(value));
};

const getPht24HourTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
};

const formatPhtDateTime = (value) => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    const datePart = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(d);
    const timePart = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
    return `${datePart} • ${timePart}`;
  } catch {
    return '—';
  }
};

const formatFileSize = (bytes) => {
  if (!bytes || bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
};

const ACTION_DETAILS = {
  approve: {
    title: 'Approve Attendance',
    button: 'Approve',
    processing: 'Approving...',
    success: 'Attendance approved',
    buttonClass: 'btn-success',
  },
  reject: {
    title: 'Reject Attendance',
    button: 'Reject',
    processing: 'Rejecting...',
    success: 'Attendance rejected',
    buttonClass: 'btn-danger',
  },
  remove: {
    title: 'Remove Rejected Scan',
    button: 'Remove & Allow Rescan',
    processing: 'Removing...',
    success: 'Rejected scan removed. The intern can scan again.',
    buttonClass: 'btn-danger',
  },
  delete: {
    title: 'Delete Attendance Entry',
    button: 'Delete Entry Permanently',
    processing: 'Deleting...',
    success: 'Attendance entry permanently deleted.',
    buttonClass: 'btn-danger',
  },
};

export default function AttendanceApproval() {
  const { user } = useAuth();
  const role = user?.role?.toLowerCase();
  const isSuperadmin = role === 'superadmin' || role === 'super_admin';
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: 'pending', date: '' });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [dtrEditOpen, setDtrEditOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // Attachment state for the currently managed attendance record
  const [currentAttachment, setCurrentAttachment] = useState(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);

  // File upload state for attendance image
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPreview, setPendingPreview] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);
  const [savingImage, setSavingImage] = useState(false);

  // Remove confirmation modal
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);

  // Full image preview modal
  const [imageModal, setImageModal] = useState({
    isOpen: false,
    url: '',
    title: '',
    subtitle: '',
    fileName: '',
  });

  // Camera state for live photo capture
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState('environment'); // 'environment' | 'user'
  const [cameraStream, setCameraStream] = useState(null);
  const [capturedFromCamera, setCapturedFromCamera] = useState(false);
  const videoRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/logs', { params: { ...filters, page, limit: 15 } });
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch (error) {
      setLogs([]);
      setTotal(0);
      toast.error(
        error?.response?.data?.error
          || (error?.request ? 'Unable to reach the attendance service' : 'Failed to load attendance')
      );
    }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [filters.status, filters.date]);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => {
        try {
          track.stop();
          track.enabled = false;
        } catch {}
      });
      setCameraStream(null);
    }
    setIsCameraActive(false);
    setCameraLoading(false);
  }, [cameraStream]);

  useEffect(() => {
    if (isCameraActive && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraActive, cameraStream]);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => {
          try { t.stop(); } catch {}
        });
      }
    };
  }, [cameraStream]);

  const handleCancelPendingFile = () => {
    if (pendingPreview) {
      URL.revokeObjectURL(pendingPreview);
    }
    setPendingFile(null);
    setPendingPreview('');
    setIsReplacing(false);
    setCapturedFromCamera(false);
  };

  const startCamera = async (facing = 'environment', replace = false) => {
    handleCancelPendingFile();
    setIsReplacing(replace);
    setIsCameraActive(true);
    setCameraLoading(true);
    setCameraFacingMode(facing);

    if (cameraStream) {
      cameraStream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      setCameraStream(null);
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error('Camera access error:', err);
      toast.error('Could not access camera. Please allow camera permissions.');
      setIsCameraActive(false);
    } finally {
      setCameraLoading(false);
    }
  };

  const toggleCameraFacing = () => {
    const nextFacing = cameraFacingMode === 'user' ? 'environment' : 'user';
    startCamera(nextFacing, isReplacing);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (cameraFacingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Failed to capture photo');
        return;
      }
      const filename = `attendance-camera-${Date.now()}.jpg`;
      const file = new File([blob], filename, { type: 'image/jpeg' });
      setPendingFile(file);
      setPendingPreview(URL.createObjectURL(blob));
      setCapturedFromCamera(true);
      stopCamera();
    }, 'image/jpeg', 0.92);
  };

  const handleAction = async (action) => {
    const actionDetails = ACTION_DETAILS[action];
    if (!selected || !actionDetails) return;
    setSaving(true);
    try {
      if (action === 'remove') {
        await api.delete(`/attendance/${selected.id}/rescan`);
      } else if (action === 'delete') {
        await api.delete(`/attendance/${selected.id}`);
      } else {
        await api.patch(`/attendance/${selected.id}/${action}`, { remarks });
      }
      toast.success(actionDetails.success);
      setModal(null);
      setSelected(null);
      fetchLogs();
    } catch (error) {
      toast.error(error?.response?.data?.error || `Failed to ${action} attendance`);
    }
    finally { setSaving(false); }
  };

  const openDetails = async (row) => {
    stopCamera();
    setSelected(row);
    setRemarks(row.remarks || '');
    setModal('menu');
    handleCancelPendingFile();

    // Set immediate attachment from hydrated row data
    setCurrentAttachment(row.attachment || null);

    // Refresh attachment in background
    try {
      setAttachmentLoading(true);
      const res = await api.get(`/attendance/${row.id}/image`);
      if (res.data?.has_image && res.data.attachment) {
        setCurrentAttachment(res.data.attachment);
        setLogs(prev => prev.map(l => l.id === row.id ? { ...l, attachment: res.data.attachment, has_attachment: true } : l));
      } else {
        setCurrentAttachment(null);
        setLogs(prev => prev.map(l => l.id === row.id ? { ...l, attachment: null, has_attachment: false } : l));
      }
    } catch {
      // Keep existing row.attachment
    } finally {
      setAttachmentLoading(false);
    }
  };

  const openFullImageModal = (record, attachment) => {
    const imageUrl = attachment?.image_url;
    if (!imageUrl) return;

    const dateStr = record?.scan_time ? formatPhtDate(record.scan_time) : '';
    const typeStr = record?.scan_type === 'time_in' ? 'Time In' : 'Time Out';
    const subtitle = record?.full_name ? `${record.full_name} • ${dateStr} • ${typeStr}` : `${dateStr} • ${typeStr}`;

    setImageModal({
      isOpen: true,
      url: imageUrl,
      title: 'Attendance Image',
      subtitle,
      fileName: attachment?.file_name || 'attendance-proof.jpg',
    });
  };


  const handleFileSelect = (e, replace = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['jpg', 'jpeg', 'png', 'webp'];

    if (!validTypes.includes(file.type.toLowerCase()) && !validExts.includes(ext)) {
      toast.error('Unsupported file format. Please upload JPG, PNG, or WEBP.');
      e.target.value = '';
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      toast.error('Image is too large. Maximum file size is 5 MB.');
      e.target.value = '';
      return;
    }

    setPendingFile(file);
    setIsReplacing(replace);
    setPendingPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleSaveImage = async () => {
    if (!selected || !pendingFile) return;

    setSavingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', pendingFile);

      let res;
      if (isReplacing) {
        res = await api.put(`/attendance/${selected.id}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        toast.success('Attendance image updated successfully.');
      } else {
        res = await api.post(`/attendance/${selected.id}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        toast.success('Attendance image uploaded successfully.');
      }

      const saved = res.data?.attachment || null;
      setCurrentAttachment(saved);
      setLogs(prev => prev.map(l => l.id === selected.id ? { ...l, attachment: saved, has_attachment: Boolean(saved) } : l));
      setSelected(prev => prev ? { ...prev, attachment: saved, has_attachment: Boolean(saved) } : prev);

      handleCancelPendingFile();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to save attendance image');
    } finally {
      setSavingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!selected) return;

    setRemovingImage(true);
    try {
      await api.delete(`/attendance/${selected.id}/image`);
      toast.success('Attendance image removed.');
      setCurrentAttachment(null);
      setLogs(prev => prev.map(l => l.id === selected.id ? { ...l, attachment: null, has_attachment: false } : l));
      setSelected(prev => prev ? { ...prev, attachment: null, has_attachment: false } : prev);
      setRemoveConfirmOpen(false);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to remove attendance image');
    } finally {
      setRemovingImage(false);
    }
  };

  const closeModal = () => {
    if (saving || savingImage) return;
    stopCamera();
    setModal(null);
    setSelected(null);
    setRemarks('');
    handleCancelPendingFile();
    setCurrentAttachment(null);
  };

  const selectAction = (action) => {
    if (!ACTION_DETAILS[action]) return;
    setModal(action);
  };

  const columns = [
    {
      key: 'full_name', label: 'Intern',
      render: (v, row) => (
        <div className="cursor-pointer group">
          <p className="font-medium text-sm text-gray-800 group-hover:text-blue-600 transition-colors">{v}</p>
          <p className="text-xs text-gray-400">{divisionLabel(row.division_name)}</p>
        </div>
      )
    },
    {
      key: 'scan_type', label: 'Type',
      render: v => <span className={`badge ${v === 'time_in' ? 'badge-time-in' : 'badge-time-out'}`}>{v === 'time_in' ? 'Time In' : 'Time Out'}</span>
    },
    {
      key: 'scan_time', label: 'Date & Time',
      render: v => (
        <div className="cursor-pointer group">
          <p className="text-sm font-medium text-gray-800 group-hover:text-blue-600 transition-colors">{formatPhtDate(v)}</p>
          <p className="text-xs text-gray-400">{formatPhtTime(v, true)}</p>
        </div>
      )
    },
    {
      key: 'approval_status', label: 'Status',
      render: v => <span className={`badge badge-${v}`}>{v}</span>
    },
    { key: 'remarks', label: 'Remarks', render: v => <span className="text-xs text-gray-500">{v || '—'}</span> },
    {
      key: 'photo', label: 'Selfie Preview',
      render: (v, row) => {
        if (!v) return <span className="text-xs text-gray-400">—</span>;
        return (
          <button 
            type="button"
            className="btn btn-ghost btn-sm text-blue-600 font-semibold flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewRecord(row);
            }}
          >
            <Camera className="w-3.5 h-3.5" strokeWidth={2} /> Preview
          </button>
        );
      }
    },
    {
      key: 'attachment',
      label: 'Attendance Image',
      render: (_, row) => {
        const hasImg = Boolean(row.attachment || row.has_attachment);
        if (hasImg) {
          return (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                openFullImageModal(row, row.attachment);
              }}
              title="View uploaded attendance image"
            >
              <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>Image Attached</span>
            </button>
          );
        }
        if (isSuperadmin) {
          return (
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-indigo-600 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                openDetails(row);
              }}
              title="Upload attendance image"
            >
              <span className="text-indigo-600 font-bold leading-none">+</span>
              <span>Add Image</span>
            </button>
          );
        }
        return <span className="text-xs text-gray-400">—</span>;
      }
    },
    {
      key: 'id', label: 'Actions',
      render: (_, row) => (
        <button
          id={`attendance-actions-btn-${row.id}`}
          className="btn btn-secondary btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            openDetails(row);
          }}
        >
          <Settings2 className="w-3.5 h-3.5" /> Manage
        </button>
      )
    },
  ];


  return (
    <div className="space-y-6 animate-fade-in attendance-approval-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Attendance Approval</h1>
          <p className="text-gray-500 text-sm">Review attendance and reopen a rejected scan slot when correction is needed</p>
        </div>
        <button
          type="button"
          id="attendance-bulk-override-btn"
          className="btn btn-secondary flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 self-start sm:self-auto"
          onClick={() => setBulkModalOpen(true)}
        >
          <Calendar className="w-4 h-4 text-blue-600" /> Bulk DTR Override
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end attendance-approval-filters">
        <div className="form-group w-full sm:w-auto">
          <label className="form-label">Status</label>
          <select className="form-input form-select text-sm w-full sm:w-auto" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="form-group w-full sm:w-auto">
          <label className="form-label">Date</label>
          <input type="date" className="form-input text-sm w-full sm:w-auto" value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))} />
        </div>
        <button className="btn btn-secondary btn-sm w-full sm:w-auto" onClick={() => setFilters({ status: 'pending', date: '' })}>Reset</button>
      </div>

      <div className="table-responsive attendance-approval-results">
        <DataTable
          columns={columns}
          data={logs}
          loading={loading}
          total={total}
          page={page}
          limit={15}
          onPageChange={setPage}
          onRowClick={openDetails}
          emptyMessage="No attendance records found"
        />
      </div>

      {/* Attendance action menu and confirmations */}
      <Modal
        isOpen={!!modal}
        onClose={closeModal}
        title={modal === 'menu' ? 'Attendance Details' : ACTION_DETAILS[modal]?.title || 'Review Attendance'}
        size={modal === 'menu' ? 'md' : 'sm'}
        footer={
          modal !== 'menu' ? (
            <>
              <button className="btn btn-secondary" onClick={() => setModal('menu')} disabled={saving}>Back</button>
              <button
                id={`confirm-${modal}-btn`}
                className={`btn ${ACTION_DETAILS[modal]?.buttonClass || 'btn-primary'}`}
                onClick={() => handleAction(modal)}
                disabled={saving}
              >
                {saving ? ACTION_DETAILS[modal]?.processing || 'Processing...' : ACTION_DETAILS[modal]?.button || 'Confirm'}
              </button>
            </>
          ) : (
            <div className="flex items-center justify-end w-full">
              <button type="button" className="btn btn-secondary btn-sm" onClick={closeModal} disabled={savingImage}>
                Close
              </button>
            </div>
          )
        }
      >
        {selected && (
          <div className="space-y-3.5">
            {/* Record Information Card */}
            <div className="attendance-action-summary">
              <div className="attendance-action-summary__header">
                <div>
                  <span className="attendance-action-summary__label">Intern</span>
                  <p className="attendance-action-summary__name">{selected.full_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{divisionLabel(selected.division_name)}</p>
                </div>
                <span className={`badge badge-${selected.approval_status}`}>{selected.approval_status}</span>
              </div>
              <div className="attendance-action-summary__meta">
                <div>
                  <span>Attendance Type</span>
                  <strong>{selected.scan_type === 'time_in' ? 'Time In' : 'Time Out'}</strong>
                </div>
                <div>
                  <span>Date &amp; time</span>
                  <strong>{selected.scan_time ? `${formatPhtDate(selected.scan_time)} · ${formatPhtTime(selected.scan_time)}` : '—'}</strong>
                </div>
              </div>
              {selected.remarks && (
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                  <span className="text-slate-400 block font-medium">Remarks:</span>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5">{selected.remarks}</p>
                </div>
              )}
            </div>

            {modal === 'menu' ? (
              <>
                {/* Face Verification Selfie Section */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 flex items-center justify-between gap-2 shadow-xs">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-blue-600" />
                      Face Verification Selfie
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Biometric selfie captured during scan
                    </p>
                  </div>
                  {selected.photo ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-blue-600 font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/30 text-xs flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800"
                      onClick={() => setPreviewRecord(selected)}
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No selfie</span>
                  )}
                </div>

                {/* Attendance Image Section */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-indigo-600" />
                        Attendance Image
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {currentAttachment
                          ? 'Uploaded manually by Super Admin'
                          : (isSuperadmin
                            ? 'Upload an image or take a live photo related to this attendance record.'
                            : 'No additional attendance image was provided.')}
                      </p>
                    </div>

                    {!currentAttachment && !pendingFile && !isCameraActive && isSuperadmin && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm text-xs inline-flex items-center gap-1.5 text-blue-700 hover:bg-blue-50 border-blue-200 dark:border-blue-800 dark:text-blue-300 shadow-xs"
                          onClick={() => startCamera('environment', false)}
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Open Camera
                        </button>
                        <label className="btn btn-primary btn-sm text-xs cursor-pointer inline-flex items-center gap-1.5 shadow-xs">
                          <Upload className="w-3.5 h-3.5" />
                          Choose Image
                          <input
                            type="file"
                            className="hidden"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => handleFileSelect(e, false)}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Live Camera Viewfinder */}
                  {isCameraActive && (
                    <div className="border border-blue-300 dark:border-blue-700 bg-slate-950 rounded-xl p-3 space-y-3 animate-fade-in text-white shadow-md">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold flex items-center gap-2 text-blue-400">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                          {isReplacing ? 'Capture Replacement Photo' : 'Live Camera Viewfinder'}
                        </span>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
                          onClick={stopCamera}
                          title="Close camera"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Video element */}
                      <div className="relative rounded-lg overflow-hidden bg-black flex justify-center items-center aspect-video max-h-56">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className={`w-full h-full object-cover ${cameraFacingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                        />
                        {cameraLoading && (
                          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-2 text-xs text-white">
                            <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                            <span>Starting camera...</span>
                          </div>
                        )}
                        {/* Overlay dashed frame */}
                        <div className="absolute inset-4 pointer-events-none border border-white/30 rounded-lg border-dashed"></div>
                      </div>

                      {/* Viewfinder Controls */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700"
                          onClick={stopCamera}
                        >
                          Cancel
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700 flex items-center gap-1.5"
                            onClick={toggleCameraFacing}
                            title="Flip Camera"
                          >
                            <SwitchCamera className="w-3.5 h-3.5" />
                            Flip
                          </button>

                          <button
                            type="button"
                            className="btn btn-primary btn-sm text-xs flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium px-3.5"
                            onClick={capturePhoto}
                            disabled={cameraLoading}
                          >
                            <Camera className="w-3.5 h-3.5" />
                            Capture Photo
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Upload selection / captured preview */}
                  {pendingFile && (
                    <div className="border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/40 rounded-xl p-3 space-y-2.5 animate-fade-in">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                          {capturedFromCamera ? (
                            <Camera className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          )}
                          {capturedFromCamera
                            ? (isReplacing ? 'Captured Replacement Photo' : 'Captured Photo Preview')
                            : (isReplacing ? 'Replace Attendance Image' : 'New Image Preview')}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                          {formatFileSize(pendingFile.size)}
                        </span>
                      </div>

                      {isReplacing && (
                        <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                          <span>The current attendance image will be replaced upon saving.</span>
                        </div>
                      )}

                      <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-black flex justify-center max-h-48">
                        <img
                          src={pendingPreview}
                          alt="Attachment preview"
                          className="max-h-48 w-auto object-contain rounded"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                        <p className="text-xs text-slate-700 dark:text-slate-300 truncate max-w-xs font-medium">
                          {capturedFromCamera ? '📷 ' : '📄 '} {pendingFile.name}
                        </p>
                        <div className="flex items-center gap-2">
                          {capturedFromCamera && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
                              onClick={() => startCamera(cameraFacingMode, isReplacing)}
                              disabled={savingImage}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Retake
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm text-xs"
                            onClick={handleCancelPendingFile}
                            disabled={savingImage}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
                            onClick={handleSaveImage}
                            disabled={savingImage}
                          >
                            {savingImage ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5" />
                                Save Image
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Existing Attachment View */}
                  {!pendingFile && !isCameraActive && currentAttachment && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50/70 dark:bg-slate-900/40 space-y-3">
                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <div
                          className="relative w-full sm:w-28 h-28 rounded-lg overflow-hidden bg-black border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer group flex items-center justify-center"
                          onClick={() => openFullImageModal(selected, currentAttachment)}
                          title="Click to view full image"
                        >
                          <img
                            src={currentAttachment.image_url}
                            alt="Attendance Proof"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1">
                            <ZoomIn className="w-4 h-4" />
                            <span>Preview</span>
                          </div>
                        </div>

                        <div className="flex-1 space-y-1.5 text-xs w-full">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate max-w-[200px]" title={currentAttachment.file_name}>
                              {currentAttachment.file_name}
                            </p>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {formatFileSize(currentAttachment.file_size)}
                            </span>
                          </div>

                          <div className="text-slate-600 dark:text-slate-400 space-y-0.5">
                            <p>
                              <span className="text-slate-400">Uploaded by: </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-200">
                                {currentAttachment.uploaded_by_name || 'Super Admin'}
                              </span>
                            </p>
                            <p>
                              <span className="text-slate-400">Uploaded: </span>
                              <span className="text-slate-700 dark:text-slate-200 font-medium">
                                {formatPhtDateTime(currentAttachment.uploaded_at)}
                              </span>
                            </p>
                          </div>

                          <div className="pt-2 flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5"
                              onClick={() => openFullImageModal(selected, currentAttachment)}
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                              View Full Image
                            </button>

                            {isSuperadmin && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5 text-blue-700 hover:bg-blue-50 border-blue-200 dark:border-blue-800 dark:text-blue-300"
                                  onClick={() => startCamera('environment', true)}
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  Capture New Photo
                                </button>

                                <label className="btn btn-secondary btn-sm text-xs cursor-pointer inline-flex items-center gap-1.5 text-indigo-700 hover:bg-indigo-50 border-indigo-200 dark:border-indigo-800 dark:text-indigo-300">
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  Replace from File
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={(e) => handleFileSelect(e, true)}
                                  />
                                </label>

                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm text-xs text-rose-600 hover:bg-rose-50 border-rose-200 dark:border-rose-800 dark:text-rose-400 flex items-center gap-1.5"
                                  onClick={() => setRemoveConfirmOpen(true)}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                                  Remove Image
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {!pendingFile && !isCameraActive && !currentAttachment && (
                    <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/30">
                      {isSuperadmin ? (
                        <div className="space-y-3">
                          <p>No attendance image has been attached.</p>
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm text-xs inline-flex items-center gap-1.5 shadow-xs"
                              onClick={() => startCamera('environment', false)}
                            >
                              <Camera className="w-3.5 h-3.5" />
                              Open Camera
                            </button>
                            <label className="btn btn-secondary btn-sm text-xs cursor-pointer inline-flex items-center gap-1.5 text-blue-700 hover:bg-blue-50 border-blue-200 dark:border-blue-800 dark:text-blue-300">
                              <Upload className="w-3.5 h-3.5" />
                              + Upload Image
                              <input
                                type="file"
                                className="hidden"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(e) => handleFileSelect(e, false)}
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <p className="italic text-slate-400">No additional attendance image was provided.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Verification Actions List */}
                <div className="attendance-action-list pt-2">
                  <p className="attendance-action-list__label">Attendance Verification Actions</p>
                  {selected.approval_status !== 'approved' && (
                    <button
                      id={`approve-btn-${selected.id}`}
                      className="attendance-action-row"
                      onClick={() => selectAction('approve')}
                    >
                      <span className="attendance-action-row__icon attendance-action-row__icon--approve">
                        <CheckCircle />
                      </span>
                      <span className="attendance-action-row__content">
                        <strong>Approve attendance</strong>
                        <small>Mark this scan as verified.</small>
                      </span>
                      <ChevronRight className="attendance-action-row__arrow" />
                    </button>
                  )}

                  {selected.approval_status !== 'rejected' && (
                    <button
                      id={`reject-btn-${selected.id}`}
                      className="attendance-action-row"
                      onClick={() => selectAction('reject')}
                    >
                      <span className="attendance-action-row__icon attendance-action-row__icon--reject">
                        <XCircle />
                      </span>
                      <span className="attendance-action-row__content">
                        <strong>Reject attendance</strong>
                        <small>Reject this scan with optional remarks.</small>
                      </span>
                      <ChevronRight className="attendance-action-row__arrow" />
                    </button>
                  )}

                  {selected.approval_status === 'rejected' && (
                    <button
                      id={`remove-rescan-btn-${selected.id}`}
                      className="attendance-action-row"
                      onClick={() => selectAction('remove')}
                    >
                      <span className="attendance-action-row__icon attendance-action-row__icon--rescan">
                        <RotateCcw />
                      </span>
                      <span className="attendance-action-row__content">
                        <strong>Remove &amp; allow rescan</strong>
                        <small>Reopen today&apos;s latest scan slot.</small>
                      </span>
                      <ChevronRight className="attendance-action-row__arrow" />
                    </button>
                  )}

                  <div className="attendance-action-list__divider"><span>Danger zone</span></div>
                  <button
                    id={`delete-attendance-btn-${selected.id}`}
                    className="attendance-action-row attendance-action-row--danger"
                    onClick={() => selectAction('delete')}
                  >
                    <span className="attendance-action-row__icon attendance-action-row__icon--delete">
                      <Trash2 />
                    </span>
                    <span className="attendance-action-row__content">
                      <strong>Delete entry permanently</strong>
                      <small>Remove the record and its selfie.</small>
                    </span>
                    <ChevronRight className="attendance-action-row__arrow" />
                  </button>
                </div>
              </>
            ) : modal === 'remove' ? (
              <div className="attendance-action-warning attendance-action-warning--rescan">
                <AlertTriangle />
                <div><strong>Reopen this scan slot?</strong><p>This removes the rejected entry and selfie. It is allowed only for today&apos;s latest scan.</p></div>
              </div>
            ) : modal === 'delete' ? (
              <div className="attendance-action-warning attendance-action-warning--delete">
                <AlertTriangle />
                <div><strong>Delete this entry permanently?</strong><p>The attendance record and its selfie will be removed. This cannot be undone.</p></div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Remarks (optional)</label>
                <textarea className="form-input" rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Add a note..." />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Full Image Preview Modal */}
      <Modal
        isOpen={imageModal.isOpen}
        onClose={() => setImageModal(m => ({ ...m, isOpen: false }))}
        title={imageModal.title || 'Attendance Image'}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              onClick={() => {
                const a = document.createElement('a');
                a.href = imageModal.url;
                a.download = imageModal.fileName || 'attendance-proof.jpg';
                a.target = '_blank';
                a.click();
              }}
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setImageModal(m => ({ ...m, isOpen: false }))}
            >
              Close
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {imageModal.subtitle && (
            <div className="px-1 text-xs text-slate-600 dark:text-slate-300 font-medium border-b border-slate-100 dark:border-slate-800 pb-2">
              {imageModal.subtitle}
            </div>
          )}
          <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm bg-black flex justify-center items-center w-full min-h-[300px]">
            <img
              src={imageModal.url}
              alt="Attendance Full Proof"
              className="max-h-[80vh] max-w-full w-auto h-auto object-contain rounded-lg"
            />
          </div>
        </div>
      </Modal>

      {/* Remove Attendance Image Confirmation Modal */}
      <Modal
        isOpen={removeConfirmOpen}
        onClose={() => !removingImage && setRemoveConfirmOpen(false)}
        title="Remove Attendance Image?"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setRemoveConfirmOpen(false)}
              disabled={removingImage}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm flex items-center gap-1.5"
              onClick={handleRemoveImage}
              disabled={removingImage}
            >
              {removingImage ? 'Removing...' : 'Remove'}
            </button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300 p-1">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">Remove Attendance Image?</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">This image will no longer be visible to admins.</p>
            </div>
          </div>
        </div>
      </Modal>


      {/* Selfie Verification Preview Modal */}
      <Modal
        isOpen={!!previewRecord}
        onClose={() => setPreviewRecord(null)}
        title="Selfie Verification Preview"
        size="md"
        footer={
          <div className="flex items-center justify-between w-full gap-2 flex-wrap">
            {isSuperadmin ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="selfie-edit-official-time-btn"
                  className="btn btn-sm btn-primary flex items-center gap-1.5"
                  onClick={() => setDtrEditOpen(true)}
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Official Time
                </button>
              </div>
            ) : <div />}
            <button className="btn btn-secondary btn-sm" onClick={() => setPreviewRecord(null)}>Close</button>
          </div>
        }
      >
        <div className="space-y-3 p-1">
          {previewRecord?.photo ? (
            <WatermarkedSelfie
              photoUrl={previewRecord.photo}
              recordDate={getPhtDateStr(previewRecord.scan_time)}
              recordTime={formatPhtTime(previewRecord.scan_time, false)}
              isSuperadmin={isSuperadmin}
            />
          ) : (
            <p className="text-gray-500 text-center py-6">No photo available</p>
          )}

          {previewRecord && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{previewRecord.full_name}</p>
                  <p className="text-gray-500">{divisionLabel(previewRecord.division_name)}</p>
                </div>
                <span className={`badge ${previewRecord.scan_type === 'time_in' ? 'badge-time-in' : 'badge-time-out'}`}>
                  {previewRecord.scan_type === 'time_in' ? 'Time In' : 'Time Out'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white p-2 rounded border border-slate-100">
                  <span className="text-gray-500 block font-medium">Official Date</span>
                  <span className="font-semibold text-gray-800 text-sm">{formatPhtDate(previewRecord.scan_time)}</span>
                </div>
                <div className="bg-white p-2 rounded border border-slate-100">
                  <span className="text-gray-500 block font-medium">Official Recorded Time</span>
                  <span className="font-semibold text-blue-700 text-sm">{formatPhtTime(previewRecord.scan_time, false)}</span>
                </div>
              </div>

              {isSuperadmin && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-900 flex items-start gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Camera Biometric Scan (Audit): </span>
                    <span className="font-mono font-medium">{previewRecord.actual_scan_time ? formatPhtTime(previewRecord.actual_scan_time, true) : formatPhtTime(previewRecord.scan_time, true)}</span>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      The camera watermark timestamp is permanently retained for biometric audit integrity. Superadmins can modify the official DTR Date and Time above at any time without rescanning.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Superadmin DTR Edit Modal */}
      {previewRecord && (
        <DTREditModal
          isOpen={dtrEditOpen}
          onClose={() => setDtrEditOpen(false)}
          intern={{ id: previewRecord.intern_id, full_name: previewRecord.full_name }}
          date={getPhtDateStr(previewRecord.scan_time)}
          record={{
            date: getPhtDateStr(previewRecord.scan_time),
            attendance_date: getPhtDateStr(previewRecord.scan_time),
            time_in: previewRecord.scan_type === 'time_in' ? getPht24HourTime(previewRecord.scan_time) : '',
            time_out: previewRecord.scan_type === 'time_out' ? getPht24HourTime(previewRecord.scan_time) : '',
            approval_status: previewRecord.approval_status || 'approved',
          }}
          onSaveSuccess={() => {
            fetchLogs();
            setPreviewRecord(null);
          }}
        />
      )}

      {/* Bulk Override Modal */}
      <BulkDTROverrideModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={fetchLogs}
      />
    </div>
  );
}
