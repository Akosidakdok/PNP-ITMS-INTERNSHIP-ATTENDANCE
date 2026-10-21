const REPORTING_WINDOW_DAYS = 70;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function calculateWeeklyTimelineEndDate(startDate) {
  if (!ISO_DATE_PATTERN.test(String(startDate || ''))) return '';
  const date = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== startDate) return '';
  date.setUTCDate(date.getUTCDate() + REPORTING_WINDOW_DAYS - 1);
  return date.toISOString().slice(0, 10);
}
