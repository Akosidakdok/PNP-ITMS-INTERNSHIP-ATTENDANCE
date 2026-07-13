import crypto from 'crypto';
import { supabase } from './supabaseClient.js';

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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { data: todayLogs, error: logsError } = await supabase
    .from('attendance_logs')
    .select('scan_type, scan_time')
    .eq('intern_id', internId)
    .gte('scan_time', todayStart.toISOString())
    .lte('scan_time', todayEnd.toISOString())
    .order('scan_time', { ascending: true });

  if (logsError) {
    throw new Error('Failed to retrieve today\'s attendance status');
  }

  const scanCount = Array.isArray(todayLogs) ? todayLogs.length : 0;
  const nextScanLabel = scanCount >= 4
    ? 'All scans completed for today'
    : ['AM Time In', 'AM Time Out', 'PM Time In', 'PM Time Out'][scanCount];

  return { next_scan_label: nextScanLabel, scan_count: scanCount };
}

export async function scanAttendance({ qr_code, user }) {
  if (!qr_code) {
    throw new Error('QR code is required');
  }

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

  let scanType = 'time_in';
  let scanLabel = 'AM Time In';
  let scanOrder = 1;

  if (internId) {
    const recentThreshold = new Date(Date.now() - 10000).toISOString();
    const { data: recentScan, error: recentScanError } = await supabase
      .from('attendance_logs')
      .select('id')
      .eq('intern_id', internId)
      .gte('scan_time', recentThreshold)
      .order('scan_time', { ascending: false })
      .limit(1)
      .single();

    if (!recentScanError && recentScan) {
      throw new Error('A recent scan was already recorded. Please wait a few seconds before scanning again.');
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data: todayLogs, error: logsError } = await supabase
      .from('attendance_logs')
      .select('scan_type, scan_time')
      .eq('intern_id', internId)
      .gte('scan_time', todayStart.toISOString())
      .lte('scan_time', todayEnd.toISOString())
      .order('scan_time', { ascending: true });

    if (logsError) {
      throw new Error('Failed to retrieve today\'s attendance logs');
    }

    const scanCount = Array.isArray(todayLogs) ? todayLogs.length : 0;
    if (scanCount >= 4) {
      throw new Error('You have already completed 4 attendance scans today. Please try again tomorrow.');
    }

    scanOrder = scanCount + 1;
    scanType = scanOrder % 2 === 1 ? 'time_in' : 'time_out';
    scanLabel = ['AM Time In', 'AM Time Out', 'PM Time In', 'PM Time Out'][scanCount];
  }

  const scanTime = new Date().toISOString();
  const { data: record, error: insertError } = await supabase.from('attendance_logs').insert([
    {
      intern_id: internId,
      intern_name: internName,
      scan_type: scanType,
      scan_time: scanTime,
      qr_code_id: qrData.id,
    },
  ]).select().single();

  if (insertError || !record) {
    throw new Error('Failed to record attendance');
  }

  const nextScanLabel = scanOrder >= 4
    ? 'All scans completed for today'
    : ['AM Time In', 'AM Time Out', 'PM Time In', 'PM Time Out'][scanOrder];

  return {
    message: `${scanLabel} recorded successfully`,
    scan_type: scanType,
    scan_label: scanLabel,
    scan_order: scanOrder,
    next_scan_label: nextScanLabel,
    intern_name: internName,
    scan_time: scanTime,
  };
}
