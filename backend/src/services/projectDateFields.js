const DATE_FIELDS = [
  ['project_start_date', 'Project start date'],
  ['project_target_date', 'Project target date'],
];

function normalizeOptionalDate(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be a valid date`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid date`);
  }
  return value;
}

export function normalizeProjectDateFields(payload = {}, current = {}) {
  const next = {};
  const candidate = {};
  for (const [key, label] of DATE_FIELDS) {
    if (Object.hasOwn(payload, key)) {
      next[key] = normalizeOptionalDate(payload[key], label);
      candidate[key] = next[key];
    } else {
      candidate[key] = normalizeOptionalDate(current[key], label);
    }
  }

  const startDate = candidate.project_start_date;
  const targetDate = candidate.project_target_date;
  if (startDate && targetDate && startDate > targetDate) {
    throw new Error('Project target date must be on or after the project start date');
  }
  return next;
}
