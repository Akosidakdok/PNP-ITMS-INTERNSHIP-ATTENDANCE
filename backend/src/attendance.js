import crypto from 'crypto';
import { supabase } from './supabaseClient.js';
import { getPhtDayBoundsUtc } from './utils/attendanceTime.js';

const QR_EXPIRY_MINUTES = 60;

async function createQrCode() {
  const qrCode = `PNP-ITMS-${crypto.randomBytes(10).toString('hex')}`;
  const expiresAt = new Date(Date.now() + QR_EXPIRY_MINUTES * 60 * 1000).toISOString();

  await supabase.from('qr_codes').update({ is_active: false }).eq('is_active', true);

  const { data, error } = await supabase.from('qr_codes').insert([{ qr_code: qrCode, expires_at: expiresAt }]).select().single();
  if (error) throw error;
  return data;
}

export async function getActiveQrCode() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('is_active', true)
    .gt('expires_at', now)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 is returned when single() finds no rows
    throw error;
  }

  if (data) {
    return data;
  }

  return createQrCode();
}

export async function regenerateQrCode() {
  return createQrCode();
}

export async function getTodayScanStatus(internId) {
  if (!internId) {
    return { next_scan_label: 'Unknown intern', scan_count: 0 };
  }

  const { startIso, endExclusiveIso } = getPhtDayBoundsUtc();

  const { data: todayLogs, error: logsError } = await supabase
    .from('attendance_logs')
    .select('scan_type, scan_time, remarks')
    .eq('intern_id', internId)
    .gte('scan_time', startIso)
    .lt('scan_time', endExclusiveIso)
    .order('scan_time', { ascending: true });

  if (logsError) {
    throw new Error('Failed to retrieve today\'s attendance status');
  }

  const attendanceLogs = (todayLogs || []).filter(
    log => typeof log.remarks !== 'string' || !log.remarks.startsWith('OVERRIDE:')
  );
  const scanCount = attendanceLogs.length;
  const nextScanLabel = scanCount >= 2
    ? 'All scans completed for today'
    : ['Time In', 'Time Out'][scanCount];

  return { next_scan_label: nextScanLabel, scan_count: scanCount };
}

import { validateFacePhoto, verifyUserFace } from './services/faceVerificationService.js';

export async function scanAttendance({ qr_code, user, photo, face_embedding } = {}) {
  if (!qr_code) {
    throw new Error('QR code is required');
  }
  const validatedPhoto = validateFacePhoto(photo);

  const now = new Date().toISOString();
  const { data: qrData, error: qrError } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('qr_code', qr_code)
    .eq('is_active', true)
    .gt('expires_at', now)
    .single();

  if (qrError || !qrData) {
    throw new Error('Invalid or expired QR code');
  }

  let internId = null;
  let internName = 'Unknown Intern';
  if (user?.id) {
    internId = user.id;
    internName = user.full_name || user.username || internName;
  }

  // Perform Face Verification if internId is present
  let verificationScore = null;
  let verificationStatus = 'Unverified';

  if (internId) {
    const faceCheck = await verifyUserFace(internId, face_embedding);
    if (!faceCheck.verified) {
      const err = new Error(faceCheck.message || 'Face verification failed. Please try again.');
      err.code = faceCheck.code || 'FACE_VERIFICATION_FAILED';
      err.statusCode = faceCheck.statusCode || 400;
      err.retryAfterSeconds = faceCheck.retry_after_seconds;
      err.similarity = faceCheck.similarity;
      err.verified = false;
      throw err;
    }

    verificationScore = faceCheck.similarity;
    verificationStatus = 'Verified';
  }

  let scanType = 'time_in';
  let scanLabel = 'Time In';
  let scanOrder = 1;

  if (internId) {
    const recentThreshold = new Date(Date.now() - 10000).toISOString();
    const { data: recentScan, error: recentScanError } = await supabase
      .from('attendance_logs')
      .select('id, remarks')
      .eq('intern_id', internId)
      .gte('scan_time', recentThreshold)
      .order('scan_time', { ascending: false })
      .limit(1)
      .single();

    if (
      !recentScanError
      && recentScan
      && (typeof recentScan.remarks !== 'string' || !recentScan.remarks.startsWith('OVERRIDE:'))
    ) {
      throw new Error('A recent scan was already recorded. Please wait a few seconds before scanning again.');
    }

    const { startIso, endExclusiveIso } = getPhtDayBoundsUtc();

    const { data: todayLogs, error: logsError } = await supabase
      .from('attendance_logs')
      .select('scan_type, scan_time, remarks')
      .eq('intern_id', internId)
      .gte('scan_time', startIso)
      .lt('scan_time', endExclusiveIso)
      .order('scan_time', { ascending: true });

    if (logsError) {
      throw new Error('Failed to retrieve today\'s attendance logs');
    }

    const attendanceLogs = (todayLogs || []).filter(
      log => typeof log.remarks !== 'string' || !log.remarks.startsWith('OVERRIDE:')
    );
    const scanCount = attendanceLogs.length;
    if (scanCount >= 2) {
      throw new Error('You have already completed 2 attendance scans (Time In - Time Out) today. Please try again tomorrow.');
    }

    scanOrder = scanCount + 1;
    scanType = scanOrder % 2 === 1 ? 'time_in' : 'time_out';
    scanLabel = ['Time In', 'Time Out'][scanCount];
  }

  const scanTime = new Date().toISOString();
  const { data: record, error: insertError } = await supabase.from('attendance_logs').insert([
    {
      intern_id: internId,
      intern_name: internName,
      scan_type: scanType,
      scan_time: scanTime,
      qr_code_id: qrData.id,
      verification_score: verificationScore,
      verification_status: verificationStatus,
    },
  ]).select().single();

  if (insertError || !record) {
    console.error('Database insert error:', insertError);
    throw new Error(`Failed to record attendance: ${insertError?.message || 'Unknown database error'}`);
  }

  const { error: photoError } = await supabase.from('attendance_photos').insert([
    {
      attendance_log_id: record.id,
      photo: validatedPhoto,
    }
  ]);
  if (photoError) {
    console.error('Photo database insert error:', photoError);
  }

  const nextScanLabel = scanOrder >= 2
    ? 'All scans completed for today'
    : ['Time In', 'Time Out'][scanOrder];

  return {
    verified: true,
    similarity: verificationScore,
    message: `Face verified successfully. ${scanLabel} recorded!`,
    scan_type: scanType,
    scan_label: scanLabel,
    scan_order: scanOrder,
    next_scan_label: nextScanLabel,
    intern_name: internName,
    scan_time: scanTime,
    photo_saved: !photoError,
  };
}
