const fixedHolidays = {
  '01-01': "New Year's Day",
  '04-09': 'Araw ng Kagitingan',
  '05-01': 'Labor Day',
  '06-12': 'Independence Day',
  '11-30': 'Bonifacio Day',
  '12-25': 'Christmas Day',
  '12-30': 'Rizal Day',
};

// Preserve the movable dates already recognized by the DTR.
const movableHolidays = {
  '2024-03-28': 'Maundy Thursday',
  '2024-03-29': 'Good Friday',
  '2024-08-26': 'National Heroes Day',
  '2025-04-17': 'Maundy Thursday',
  '2025-04-18': 'Good Friday',
  '2025-08-25': 'National Heroes Day',
  '2026-04-02': 'Maundy Thursday',
  '2026-04-03': 'Good Friday',
  '2026-08-31': 'National Heroes Day',
  '2027-03-25': 'Maundy Thursday',
  '2027-03-26': 'Good Friday',
  '2027-08-30': 'National Heroes Day',
};

export function calendarEventAppliesToDivision(event, divisionId) {
  return event.event_type !== 'holiday' || event.holiday_division_id == null
    || String(event.holiday_division_id) === String(divisionId);
}

export function indexHolidayEvents(events, divisionId) {
  const holidays = new Map();
  for (const event of events) {
    if (event.event_type !== 'holiday' || !calendarEventAppliesToDivision(event, divisionId)) continue;
    // Prefer the applicable local label when it overlaps a program-wide event.
    if (!holidays.has(event.event_date) || event.holiday_division_id != null) {
      holidays.set(event.event_date, event.title || 'Holiday');
    }
  }
  return holidays;
}

export function getHolidayName(date, indexedEvents) {
  return indexedEvents.get(date) || movableHolidays[date] || fixedHolidays[date.slice(5)] || null;
}
