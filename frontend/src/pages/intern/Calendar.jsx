import { useState, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import Modal from '../../components/common/Modal.jsx';
import { format } from 'date-fns';
import { User, Calendar as CalendarIcon, Tag, Filter, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useCalendar } from '../../hooks/useCalendar.js';

export default function InternCalendar() {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const calendarRef = useRef(null);
  const [currentDate, setCurrentDate] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
  });
  const [mobileEvents, setMobileEvents] = useState([]);
  const [mobileLoading, setMobileLoading] = useState(false);
  const [mobileError, setMobileError] = useState('');
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);

  // Use the custom hook
  const { fetchEvents, loadEvents } = useCalendar(calendarRef);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const handleChange = event => setIsMobile(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    let active = true;
    setMobileLoading(true);
    setMobileError('');
    loadEvents(currentDate.year, currentDate.month + 1)
      .then(events => {
        if (active) setMobileEvents(events.sort((a, b) => String(a.start).localeCompare(String(b.start))));
      })
      .catch(() => {
        if (active) {
          setMobileEvents([]);
          setMobileError('Unable to load this month’s program events.');
        }
      })
      .finally(() => { if (active) setMobileLoading(false); });
    return () => { active = false; };
  }, [currentDate.month, currentDate.year, isMobile, loadEvents]);

  const openDetails = (event) => {
    setSelectedEvent(event.extendedProps || event);
  };

  const handleDateChange = (part, value) => {
    const numericValue = Number(value);
    const newDate = new Date(currentDate.year, currentDate.month);
    if (part === 'month') newDate.setMonth(numericValue);
    if (part === 'year') newDate.setFullYear(numericValue);
    setCurrentDate({ month: newDate.getMonth(), year: newDate.getFullYear() });
    calendarRef.current?.getApi().gotoDate(newDate);
  };

  const moveMonth = (offset) => {
    const target = new Date(currentDate.year, currentDate.month + offset, 1);
    setCurrentDate({ month: target.getMonth(), year: target.getFullYear() });
    calendarRef.current?.getApi().gotoDate(target);
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate({ month: today.getMonth(), year: today.getFullYear() });
    calendarRef.current?.getApi().today();
  };

  const handleDatesSet = (arg) => {
    setCurrentDate({
      month: arg.view.currentStart.getMonth(),
      year: arg.view.currentStart.getFullYear(),
    });
  };

  return (
    <div className="intern-calendar-page space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Program Calendar</h1>
        <p className="text-gray-500 text-sm">View holidays, announcements, and memos.</p>
      </div>

      {/* Filters */}
      <div className="card intern-calendar-filters p-3 flex flex-col sm:flex-row flex-wrap gap-3 sm:items-center">
        <Filter className="w-4 h-4 text-gray-400 hidden sm:block" />
        <div className="form-group mb-0 w-full sm:w-auto">
          <select className="form-input form-select text-sm w-full" value={currentDate.month} onChange={e => handleDateChange('month', e.target.value)}>
            {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div className="form-group mb-0 w-full sm:w-auto">
          <select className="form-input form-select text-sm w-full" value={currentDate.year} onChange={e => handleDateChange('year', e.target.value)}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="intern-calendar-mobile">
        <div className="calendar-mobile-toolbar">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft /></button>
          <div>
            <small>Program schedule</small>
            <strong>{format(new Date(currentDate.year, currentDate.month, 1), 'MMMM yyyy')}</strong>
          </div>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight /></button>
        </div>
        <button type="button" className="calendar-mobile-today" onClick={goToToday}>Go to today</button>

        <div className="calendar-mobile-agenda" aria-live="polite">
          {mobileLoading ? (
            <div className="calendar-mobile-empty"><Loader2 className="animate-spin" /><p>Loading events...</p></div>
          ) : mobileError ? (
            <div className="calendar-mobile-empty"><CalendarIcon /><strong>Calendar unavailable</strong><p>{mobileError}</p></div>
          ) : mobileEvents.length === 0 ? (
            <div className="calendar-mobile-empty"><CalendarIcon /><strong>No scheduled events</strong><p>There are no announcements, holidays, or memos this month.</p></div>
          ) : mobileEvents.map(event => {
            const eventDate = new Date(`${event.start}T00:00:00`);
            return (
              <button key={event.id} type="button" className="calendar-agenda-event" onClick={() => openDetails(event)}>
                <span className="calendar-agenda-event__date"><strong>{format(eventDate, 'dd')}</strong><small>{format(eventDate, 'EEE')}</small></span>
                <span className="calendar-agenda-event__body">
                  <span className={`badge badge-${event.extendedProps.event_type}`}>{event.extendedProps.event_type}</span>
                  <strong>{event.title}</strong>
                  {event.extendedProps.description && <small>{event.extendedProps.description}</small>}
                </span>
                <ChevronRight />
              </button>
            );
          })}
        </div>
      </div>

      {!isMobile && (
        <div className="card intern-calendar-desktop p-4 overflow-x-auto">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: 'prev,next', center: 'title', right: 'today' }}
            events={fetchEvents}
            buttonText={{
              today: 'Today',
              month: 'Month',
            }}
            buttonClassNames={{
              today: 'btn btn-secondary btn-sm',
              dayGridMonth: 'btn btn-secondary btn-sm',
            }}
            eventClick={(arg) => openDetails(arg.event)}
            datesSet={handleDatesSet}
          />
        </div>
      )}

      {/* Details Modal */}
      <Modal isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} title="Event Details" size="sm">
        {selectedEvent && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>{selectedEvent.title}</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Tag className="w-4 h-4 text-gray-400" />
                <span className={`badge badge-${selectedEvent.event_type}`}>{selectedEvent.event_type}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <CalendarIcon className="w-4 h-4 text-gray-400" />
                <span>{format(new Date(selectedEvent.event_date), 'MMMM dd, yyyy')}</span>
              </div>
              {selectedEvent.creator_name && (
                <div className="flex items-center gap-2 text-gray-600">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-xs">Posted by {selectedEvent.creator_name}</span>
                </div>
              )}
            </div>
            {selectedEvent.description && <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{selectedEvent.description}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
