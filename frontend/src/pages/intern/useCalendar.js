import { useCallback } from 'react';
import api from '../../utils/api.js';
import toast from 'react-hot-toast';

export const EVENT_TYPES = [
  { key: 'announcement', label: 'Announcement', color: '#3b82f6' },
  { key: 'holiday', label: 'Holiday', color: '#ef4444' },
  { key: 'memo', label: 'Memo', color: '#f97316' },
  { key: 'suspension', label: 'Suspension', color: '#a855f7' },
];

export function useCalendar(calendarRef) {
  const loadEvents = useCallback(async (year, month) => {
    const res = await api.get('/calendar-events', { params: { year, month } });

    return res.data.events.map(e => ({
      id: e.id,
      title: e.title,
      start: e.event_date,
      allDay: true,
      backgroundColor: EVENT_TYPES.find(t => t.key === e.event_type)?.color || '#6b7280',
      borderColor: EVENT_TYPES.find(t => t.key === e.event_type)?.color || '#6b7280',
      extendedProps: { ...e, creator_name: e.creator?.full_name },
    }));
  }, []);

  const fetchEvents = useCallback(async (fetchInfo, successCallback, failureCallback) => {
    if (!calendarRef.current) {
      failureCallback(new Error("Calendar not ready"));
      return;
    }

    try {
      const calendarApi = calendarRef.current.getApi();
      const currentDate = calendarApi.getDate();
      const formattedEvents = await loadEvents(currentDate.getFullYear(), currentDate.getMonth() + 1);

      successCallback(formattedEvents);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to load calendar events');
      failureCallback(err);
    }
  }, [calendarRef, loadEvents]);

  return { fetchEvents, loadEvents };
}
