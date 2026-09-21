import {
  MAX_RENDERED_MINUTES,
  PHT_UTC_OFFSET_MS,
  calculateRenderedMinutes,
  getPhtDateKey,
} from './attendanceTime.js';

const VALID_APPROVAL_STATUSES = new Set(['pending', 'approved', 'rejected']);
const VALID_OVERRIDE_TYPES = new Set(['SUSPENDED', 'EXCUSED', 'HOURS', 'OTHERS']);

function timestampOf(value) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function phtTimeString(value) {
  const timestamp = timestampOf(value);
  if (timestamp === null) return null;
  return new Date(timestamp + PHT_UTC_OFFSET_MS).toISOString().slice(11, 16);
}

function normalizeStatus(value) {
  return VALID_APPROVAL_STATUSES.has(value) ? value : 'pending';
}

function minutesFromRecord(record) {
  if (Number.isFinite(Number(record?.total_minutes))) {
    return Math.max(0, Math.round(Number(record.total_minutes)));
  }
  if (Number.isFinite(Number(record?.total_hours))) {
    return Math.max(0, Math.round(Number(record.total_hours) * 60));
  }
  return 0;
}

function hoursFromMinutes(minutes) {
  return Number((minutes / 60).toFixed(4));
}

export function parseDtrOverride(remarks) {
  if (typeof remarks !== 'string' || !remarks.startsWith('OVERRIDE:')) return null;

  const parts = remarks.split(':');
  const type = String(parts[1] || '').toUpperCase();
  if (!VALID_OVERRIDE_TYPES.has(type)) return null;

  if (type === 'HOURS' || type === 'OTHERS') {
    const hours = Number(parts[2]);
    return {
      type,
      hours: Number.isFinite(hours) ? hours : 0,
      remarks: parts.slice(3).join(':').trim(),
    };
  }

  // Current rows include a numeric placeholder before the remarks. This also
  // supports legacy rows that stored the remarks immediately after the type.
  const hasNumericPlaceholder = parts.length > 3 && Number.isFinite(Number(parts[2]));
  return {
    type,
    hours: type === 'EXCUSED' ? 8 : 0,
    remarks: parts.slice(hasNumericPlaceholder ? 3 : 2).join(':').trim(),
  };
}

export function buildStandardDtrRecord(date, entries = []) {
  const sorted = entries
    .filter(entry => entry && !parseDtrOverride(entry.remarks))
    .map(entry => ({ ...entry, _timestamp: timestampOf(entry.scan_time) }))
    .filter(entry => entry._timestamp !== null)
    .sort((a, b) => a._timestamp - b._timestamp);

  const timeInEntry = sorted.find(entry => entry.scan_type === 'time_in') || null;
  const timeOutEntry = timeInEntry
    ? sorted.find(entry => entry.scan_type === 'time_out' && entry._timestamp > timeInEntry._timestamp) || null
    : sorted.find(entry => entry.scan_type === 'time_out') || null;

  const isComplete = Boolean(timeInEntry && timeOutEntry);
  const totalMinutes = isComplete
    ? calculateRenderedMinutes(timeInEntry.scan_time, timeOutEntry.scan_time)
    : 0;

  const relevantEntries = [timeInEntry, timeOutEntry].filter(Boolean);
  const relevantStatuses = relevantEntries.map(entry => normalizeStatus(entry.approval_status));
  let approvalStatus = 'pending';
  if (relevantStatuses.some(status => status === 'rejected')) {
    approvalStatus = 'rejected';
  } else if (
    isComplete
    && relevantStatuses.length === 2
    && relevantStatuses.every(status => status === 'approved')
  ) {
    approvalStatus = 'approved';
  }

  const timeIn = phtTimeString(timeInEntry?.scan_time);
  const timeOut = phtTimeString(timeOutEntry?.scan_time);
  const remarks = relevantEntries.map(entry => entry.remarks).find(Boolean) || null;

  return {
    date,
    am_time_in: timeIn,
    am_time_out: null,
    pm_time_in: null,
    pm_time_out: timeOut,
    am_status: normalizeStatus(timeInEntry?.approval_status),
    pm_status: normalizeStatus(timeOutEntry?.approval_status),
    approval_status: approvalStatus,
    worked_minutes: totalMinutes,
    total_minutes: totalMinutes,
    approved_minutes: approvalStatus === 'approved' ? totalMinutes : 0,
    total_hours: hoursFromMinutes(totalMinutes),
    time_in: timeIn,
    time_out: timeOut,
    is_complete: isComplete,
    remarks,
    time_in_id: timeInEntry?.id ?? null,
    time_out_id: timeOutEntry?.id ?? null,
  };
}

function buildOverrideRecord(date, entries, overrideLog, override) {
  const normalEntries = entries.filter(entry => !parseDtrOverride(entry.remarks));
  const standardRecord = buildStandardDtrRecord(date, normalEntries);
  const requestedMinutes = Math.round(Math.max(0, Number(override.hours) || 0) * 60);
  const totalMinutes = Math.min(MAX_RENDERED_MINUTES, requestedMinutes);

  if (override.type === 'SUSPENDED') {
    return {
      ...buildStandardDtrRecord(date, []),
      approval_status: 'approved',
      am_status: 'approved',
      pm_status: 'approved',
      remarks: override.remarks || 'Suspension',
      is_complete: true,
      is_override: true,
      override_type: 'suspended',
      override_hours: 0,
      override_remarks: override.remarks,
      override_id: overrideLog.id ?? null,
    };
  }

  const creditedMinutes = override.type === 'EXCUSED' ? MAX_RENDERED_MINUTES : totalMinutes;
  const keepScans = override.type === 'HOURS';
  const base = keepScans ? standardRecord : buildStandardDtrRecord(date, []);

  return {
    ...base,
    approval_status: 'approved',
    am_status: base.time_in ? base.am_status : 'approved',
    pm_status: base.time_out ? base.pm_status : 'approved',
    worked_minutes: keepScans ? base.worked_minutes : 0,
    total_minutes: creditedMinutes,
    approved_minutes: creditedMinutes,
    total_hours: hoursFromMinutes(creditedMinutes),
    is_complete: true,
    remarks: override.remarks || (
      override.type === 'EXCUSED'
        ? 'Excused'
        : override.type === 'HOURS'
          ? 'Hours overridden'
          : 'Others'
    ),
    is_override: true,
    override_type: override.type.toLowerCase(),
    override_hours: hoursFromMinutes(creditedMinutes),
    override_remarks: override.remarks,
    override_id: overrideLog.id ?? null,
  };
}

export function buildDtrRecords(logs = []) {
  const grouped = new Map();

  for (const log of logs) {
    const timestamp = timestampOf(log?.scan_time);
    if (timestamp === null) continue;
    const date = getPhtDateKey(timestamp);
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(log);
  }

  return [...grouped.entries()]
    .map(([date, entries]) => {
      const overrideCandidates = entries
        .map(entry => ({ entry, override: parseDtrOverride(entry.remarks) }))
        .filter(candidate => candidate.override)
        .sort((a, b) => (timestampOf(a.entry.scan_time) || 0) - (timestampOf(b.entry.scan_time) || 0));
      const selectedOverride = overrideCandidates.at(-1);

      return selectedOverride
        ? buildOverrideRecord(date, entries, selectedOverride.entry, selectedOverride.override)
        : buildStandardDtrRecord(date, entries);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function summarizeDtrRecords(records = []) {
  let workedMinutes = 0;
  let approvedMinutes = 0;
  let completedDays = 0;
  let approvedDays = 0;
  let daysPresent = 0;

  for (const record of records) {
    const effectiveMinutes = minutesFromRecord(record);
    const recordWorkedMinutes = Number.isFinite(Number(record?.worked_minutes))
      ? Math.max(0, Math.round(Number(record.worked_minutes)))
      : effectiveMinutes;
    const recordApprovedMinutes = Number.isFinite(Number(record?.approved_minutes))
      ? Math.max(0, Math.round(Number(record.approved_minutes)))
      : record?.approval_status === 'approved'
        ? effectiveMinutes
        : 0;

    workedMinutes += recordWorkedMinutes;
    if (record?.is_complete) completedDays += 1;
    if (record?.approval_status === 'approved') {
      approvedMinutes += recordApprovedMinutes;
      if (record.is_complete) approvedDays += 1;
    }
    if (
      record?.approval_status !== 'rejected'
      && (Boolean(record?.time_in) || (record?.is_override && recordApprovedMinutes > 0))
    ) {
      daysPresent += 1;
    }
  }

  return {
    days_present: daysPresent,
    completed_days: completedDays,
    approved_days: approvedDays,
    worked_minutes: workedMinutes,
    approved_minutes: approvedMinutes,
    worked_hours: hoursFromMinutes(workedMinutes),
    approved_hours: hoursFromMinutes(approvedMinutes),
  };
}
