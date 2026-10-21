export const WEEKLY_TIMELINE_STATUSES = Object.freeze([
  'Not Started',
  'In Progress',
  'Completed',
  'Blocked',
]);

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FIELD_LENGTH = 4000;
const REPORTING_WINDOW_DAYS = 70;

function requireIsoDate(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const date = String(value);
  if (!ISO_DATE_PATTERN.test(date)) throw new Error(`${label} must be a valid date`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${label} must be a valid date`);
  }
  return date;
}

export function calculateWeeklyTimelineEndDate(startDate) {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + REPORTING_WINDOW_DAYS - 1);
  return date.toISOString().slice(0, 10);
}

function cleanField(value, label) {
  const field = value == null ? '' : String(value).trim();
  if (field.length > MAX_FIELD_LENGTH) throw new Error(`${label} is too long`);
  return field;
}

export function normalizeWeeklyTimelineReport(input = {}) {
  const start_date = requireIsoDate(input.start_date, 'Start date');
  const end_date = calculateWeeklyTimelineEndDate(start_date);
  if (!Array.isArray(input.weeks) || input.weeks.length !== 10) {
    throw new Error('Weekly timeline must contain exactly 10 weeks');
  }

  const weeks = input.weeks.map((entry, index) => {
    const week = index + 1;
    const status = String(entry?.status || 'Not Started').trim();
    if (!WEEKLY_TIMELINE_STATUSES.includes(status)) {
      throw new Error(`Week ${week} has an invalid status`);
    }
    if (entry?.week !== undefined && Number(entry.week) !== week) {
      throw new Error('Weekly timeline entries must be numbered 1 through 10 in order');
    }
    return {
      week,
      focus: cleanField(entry?.focus, `Week ${week} focus`),
      accomplishments: cleanField(entry?.accomplishments, `Week ${week} accomplishments`),
      status,
    };
  });

  return { start_date, end_date, weeks };
}

export function getWeeklyTimelinePermissions(access) {
  const role = access?.account?.role;
  const isIntern = role === 'intern';
  const internProjectIsArchived = isIntern && Boolean(access?.project?.archived_at);
  return {
    canRead: Boolean(access?.canView) && !internProjectIsArchived,
    canEdit: isIntern && !internProjectIsArchived && Boolean(access?.isMember || access?.isLeader),
    canExport: role === 'admin' || role === 'superadmin',
  };
}
