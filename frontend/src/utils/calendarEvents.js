// Use the month query supported by both older and current calendar APIs.
// FullCalendar's visible range can include days from three different months.
export async function loadCalendarRange(loadMonth, startDate, endDate) {
  const firstDay = new Date(`${startDate}T00:00:00Z`);
  const month = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), 1));
  const end = new Date(`${endDate}T00:00:00Z`);
  const requests = [];

  while (month < end) {
    requests.push(loadMonth(month.getUTCFullYear(), month.getUTCMonth() + 1));
    month.setUTCMonth(month.getUTCMonth() + 1);
  }

  const months = await Promise.all(requests);
  return months.flat().filter(event => event.start >= startDate && event.start < endDate);
}
