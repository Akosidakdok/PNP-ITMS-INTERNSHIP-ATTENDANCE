import { useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import Modal from '../../components/common/Modal.jsx';
import { format } from 'date-fns';
import { User, Calendar as CalendarIcon, Tag, Filter } from 'lucide-react';
import { useCalendar } from '../../hooks/useCalendar.js';

export default function InternCalendar() {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const calendarRef = useRef(null);
  const [currentDate, setCurrentDate] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
  });

  // Use the custom hook
  const { fetchEvents } = useCalendar(calendarRef);

  const openDetails = (event) => {
    setSelectedEvent(event.extendedProps);
  };

  const handleDateChange = (part, value) => {
    const newDate = new Date(currentDate.year, currentDate.month);
    if (part === 'month') newDate.setMonth(value);
    if (part === 'year') newDate.setFullYear(value);
    calendarRef.current?.getApi().gotoDate(newDate);
  };

  const handleDatesSet = (arg) => {
    setCurrentDate({
      month: arg.view.currentStart.getMonth(),
      year: arg.view.currentStart.getFullYear(),
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Program Calendar</h1>
        <p className="text-gray-500 text-sm">View holidays, announcements, and memos.</p>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-gray-400" />
        <div className="form-group mb-0">
          <select className="form-input form-select text-sm" value={currentDate.month} onChange={e => handleDateChange('month', e.target.value)}>
            {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <select className="form-input form-select text-sm" value={currentDate.year} onChange={e => handleDateChange('year', e.target.value)}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="card p-4">
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