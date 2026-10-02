import { useCallback } from 'react';
import api from '../../utils/api.js';
import toast from 'react-hot-toast';
import { loadCalendarRange } from '../../utils/calendarEvents.js';

export const EVENT_TYPES = [
  { key: 'announcement', label: 'Announcement', color: '#3b82f6' },
  { key: 'holiday', label: 'Holiday', color: '#ef4444' },
  { key: 'memo', label: 'Memo', color: '#f97316' },
  { key: 'suspension', label: 'Suspension', color: '#a855f7' },
];

export function getCalendarYearOptions(selectedYear) {
  const firstYear = Math.max(2000, Math.min(2024, selectedYear - 2));
  const lastYear = Math.min(2100, Math.max(2040, selectedYear + 2));
  return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
}

function formatCalendarEvents(rawEvents) {
  return rawEvents.map(e => ({
    id: e.id,
    title: e.title,
    start: e.event_date,
    allDay: true,
    backgroundColor: EVENT_TYPES.find(t => t.key === e.event_type)?.color || '#6b7280',
    borderColor: EVENT_TYPES.find(t => t.key === e.event_type)?.color || '#6b7280',
    extendedProps: { ...e, creator_name: e.creator?.full_name },
  }));
}

export function useCalendar(calendarRef) {
  const loadEvents = useCallback(async (year, month) => {
    try {
      const res = await api.get('/calendar-events', { params: { year, month } });
      const rawEvents = res.data?.events || [];

      return formatCalendarEvents(rawEvents);
    } catch (err) {
      console.error('Failed to load events for calendar:', err);
      throw err;
    }
  }, []);

  const fetchEvents = useCallback(async (fetchInfo, successCallback, failureCallback) => {
    try {
      let formattedEvents;
      if (fetchInfo?.startStr && fetchInfo?.endStr) {
        formattedEvents = await loadCalendarRange(
          loadEvents,
          fetchInfo.startStr.slice(0, 10),
          fetchInfo.endStr.slice(0, 10),
        );
      } else {
        const targetDate = fetchInfo?.view?.currentStart
          || calendarRef?.current?.getApi?.()?.getDate()
          || new Date();
        formattedEvents = await loadEvents(targetDate.getFullYear(), targetDate.getMonth() + 1);
      }

      if (typeof successCallback === 'function') {
        successCallback(formattedEvents);
      }
      return formattedEvents;
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to load calendar events', {
        id: 'calendar-load-error',
      });
      if (typeof failureCallback === 'function') {
        failureCallback(err);
      }
      return [];
    }
  }, [calendarRef, loadEvents]);

  return { fetchEvents, loadEvents };
}
