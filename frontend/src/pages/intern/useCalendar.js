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
    try {
      const res = await api.get('/calendar-events', { params: { year, month } });
      const rawEvents = res.data?.events || [];

      return rawEvents.map(e => ({
        id: e.id,
        title: e.title,
        start: e.event_date,
        allDay: true,
        backgroundColor: EVENT_TYPES.find(t => t.key === e.event_type)?.color || '#6b7280',
        borderColor: EVENT_TYPES.find(t => t.key === e.event_type)?.color || '#6b7280',
        extendedProps: { ...e, creator_name: e.creator?.full_name },
      }));
    } catch (err) {
      console.error('Failed to load events for calendar:', err);
      throw err;
    }
  }, []);

  const fetchEvents = useCallback(async (fetchInfo, successCallback, failureCallback) => {
    try {
      let targetDate;
      if (fetchInfo?.view?.currentStart) {
        targetDate = new Date(fetchInfo.view.currentStart);
      } else if (fetchInfo?.start && fetchInfo?.end) {
        const midTime = (new Date(fetchInfo.start).getTime() + new Date(fetchInfo.end).getTime()) / 2;
        targetDate = new Date(midTime);
      } else if (calendarRef?.current?.getApi) {
        targetDate = calendarRef.current.getApi().getDate();
      } else {
        targetDate = new Date();
      }

      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;
      const formattedEvents = await loadEvents(year, month);

      if (typeof successCallback === 'function') {
        successCallback(formattedEvents);
      }
      return formattedEvents;
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to load calendar events');
      if (typeof failureCallback === 'function') {
        failureCallback(err);
      }
      return [];
    }
  }, [calendarRef, loadEvents]);

  return { fetchEvents, loadEvents };
}
