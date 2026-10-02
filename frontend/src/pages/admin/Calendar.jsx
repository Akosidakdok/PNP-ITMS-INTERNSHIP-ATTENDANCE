import { useState, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction'; // <-- Import the interaction plugin
import { format } from 'date-fns';
import { Trash2, Tag, Calendar as CalendarIcon, FileText, Filter, AlertCircle } from 'lucide-react';
import api from '../../utils/api.js';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { useCalendar, EVENT_TYPES, getCalendarYearOptions } from '../../hooks/useCalendar.js';
import { useAuth } from '../../context/AuthContext.jsx';

const INIT_FORM = { title: '', description: '', event_date: '', event_type: 'announcement' };

export default function AdminCalendar() {
  const { user } = useAuth();
  const [modal, setModal] = useState(null); // 'form' | 'delete'
  const [form, setForm] = useState(INIT_FORM);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [saving, setSaving] = useState(false);
  const calendarRef = useRef(null);
  const [currentDate, setCurrentDate] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
  });

  // Use the custom hook
  const { fetchEvents, loadEvents } = useCalendar(calendarRef);
  const [mobileEvents, setMobileEvents] = useState([]);
  const [mobileLoading, setMobileLoading] = useState(false);
  const [mobileError, setMobileError] = useState('');
  const [eventsRevision, setEventsRevision] = useState(0);
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  ));
  const canManageEvent = event => user?.role === 'superadmin'
    || user?.role === 'admin'
    || (user?.role === 'supervisor' && Number(event?.created_by) === Number(user.id));
  const selectedEventCanEdit = !selectedEvent || canManageEvent(selectedEvent);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleMediaChange = event => setIsMobile(event.matches);
    mediaQuery.addEventListener?.('change', handleMediaChange);
    return () => mediaQuery.removeEventListener?.('change', handleMediaChange);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileEvents([]);
      setMobileError('');
      return undefined;
    }
    let active = true;
    setMobileLoading(true);
    setMobileError('');
    setMobileEvents([]);
    loadEvents(currentDate.year, currentDate.month + 1)
      .then(events => { if (active) setMobileEvents(events); })
      .catch(() => {
        if (active) setMobileError('Unable to load this month’s program events.');
      })
      .finally(() => { if (active) setMobileLoading(false); });
    return () => { active = false; };
  }, [currentDate.month, currentDate.year, eventsRevision, isMobile, loadEvents]);

  const refreshEvents = () => {
    calendarRef.current?.getApi()?.refetchEvents();
    setEventsRevision(revision => revision + 1);
  };

  const openCreate = (date) => {
    setSelectedEvent(null);
    setForm({ ...INIT_FORM, event_date: date });
    setModal('form');
  };

  const openEdit = (event) => {
    const { id, title, description, event_date, event_type } = event.extendedProps;
    setSelectedEvent(event.extendedProps);
    setForm({ id, title, description: description || '', event_date, event_type });
    setModal('form');
  };

  const openDelete = (event) => {
    if (!canManageEvent(event.extendedProps)) return;
    setSelectedEvent(event.extendedProps);
    setModal('delete');
  }

  const handleSave = async () => {
    if (!selectedEventCanEdit) return;
    if (!form.title || !form.event_date) {
      toast.error('Title and date are required');
      return;
    }
    setSaving(true);
    try {
      if (selectedEvent) {
        await api.put(`/calendar-events/${selectedEvent.id}`, form);
        toast.success('Event updated');
      } else {
        await api.post('/calendar-events', form);
        toast.success('Event created');
      }
      setModal(null);
      refreshEvents();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/calendar-events/${selectedEvent.id}`);
      toast.success('Event deleted');
      setModal(null);
      refreshEvents();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to delete event');
    } finally {
      setSaving(false);
    }
  };

  const handleEventDrop = async (info) => {
    if (!canManageEvent(info.event.extendedProps)) {
      info.revert();
      return;
    }
    const { id, title } = info.event.extendedProps;
    const newDate = info.event.startStr;
    if (!confirm(`Move "${title}" to ${newDate}?`)) {
      info.revert();
      return;
    }
    try {
      await api.put(`/calendar-events/${id}`, { event_date: newDate });
      toast.success('Event date updated');
      refreshEvents();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to move event');
      info.revert();
    }
  };

  const eventIcons = { holiday: <Tag className="w-3 h-3 text-red-500" />, announcement: <CalendarIcon className="w-3 h-3 text-blue-500" />, memo: <FileText className="w-3 h-3 text-orange-500" />, suspension: <AlertCircle className="w-3 h-3 text-purple-500" /> };

  const renderEventContent = (eventInfo) => (
    <div className="flex items-center justify-between w-full p-1 gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {eventIcons[eventInfo.event.extendedProps.event_type] || <Tag className="w-3 h-3" />}
        <span className="truncate font-medium text-xs">
          {eventInfo.event.title}
        </span>
      </div>
      {canManageEvent(eventInfo.event.extendedProps) && (
        <button className="ml-2 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); openDelete(eventInfo.event); }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  const handleDateChange = (part, value) => {
    const newDate = new Date(currentDate.year, currentDate.month);
    if (part === 'month') newDate.setMonth(Number(value));
    if (part === 'year') newDate.setFullYear(Number(value));
    setCurrentDate({ month: newDate.getMonth(), year: newDate.getFullYear() });
    calendarRef.current?.getApi()?.gotoDate(newDate);
  };

  const handleDatesSet = (arg) => {
    setCurrentDate({
      month: arg.view.currentStart.getMonth(),
      year: arg.view.currentStart.getFullYear(),
    });
  };

  return (
    <div className="space-y-6 animate-fade-in admin-calendar-page">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Program Calendar</h1>
        <p className="text-gray-500 text-sm">Manage holidays, suspensions, announcements, and memos.</p>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-col sm:flex-row flex-wrap gap-3 sm:items-center">
        <Filter className="w-4 h-4 text-gray-400 hidden sm:block" />
        <div className="form-group mb-0 w-full sm:w-auto">
          <select className="form-input form-select text-sm w-full" value={currentDate.month} onChange={e => handleDateChange('month', e.target.value)}>
            {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div className="form-group mb-0 w-full sm:w-auto">
          <select className="form-input form-select text-sm w-full" value={currentDate.year} onChange={e => handleDateChange('year', e.target.value)}>
            {getCalendarYearOptions(currentDate.year).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => openCreate(format(new Date(), 'yyyy-MM-dd'))}>
          Add Event
        </button>
      </div>

      {!isMobile && (
        <div className="card p-4 overflow-x-auto admin-calendar-desktop">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate={new Date(currentDate.year, currentDate.month, 1)}
            headerToolbar={{
              left: 'prev,next',
              center: 'title',
              right: 'today'
            }}
            customButtons={{
              addEventButton: {
                text: 'Add Event',
                click: () => openCreate(format(new Date(), 'yyyy-MM-dd')),
                bootstrapFontAwesome: 'btn btn-primary',
              }
            }}
            buttonText={{
              today: 'Today',
              month: 'Month',
            }}
            buttonClassNames={{
              today: 'btn btn-secondary btn-sm',
              dayGridMonth: 'btn btn-secondary btn-sm',
            }}
            events={fetchEvents}
            eventDataTransform={event => ({ ...event, editable: canManageEvent(event.extendedProps) })}
            eventClick={(arg) => openEdit(arg.event)}
            dateClick={(info) => openCreate(info.dateStr)}
            datesSet={handleDatesSet}
            editable={true} // Allows drag-and-drop
            eventDrop={handleEventDrop}
            eventContent={renderEventContent}
            droppable={true}
          />
        </div>
      )}

      <div className="card p-3 admin-calendar-mobile" aria-label="Calendar events for the selected month">
        <div className="admin-calendar-mobile__heading">
          <span>Events this month</span>
          <span>{mobileEvents.length}</span>
        </div>
        {mobileLoading ? (
          <div className="admin-calendar-mobile__empty">Loading events...</div>
        ) : mobileError ? (
          <div className="admin-calendar-mobile__empty">{mobileError}</div>
        ) : mobileEvents.length === 0 ? (
          <div className="admin-calendar-mobile__empty">No events scheduled for this month.</div>
        ) : (
          <div className="admin-calendar-mobile__events">
            {mobileEvents
              .slice()
              .sort((a, b) => String(a.start).localeCompare(String(b.start)))
              .map(event => (
                <div className="admin-calendar-mobile__event" key={event.id}>
                  <button type="button" className="admin-calendar-mobile__event-main" onClick={() => openEdit(event)}>
                    <span className="admin-calendar-mobile__date">
                      <strong>{new Date(`${event.start}T00:00:00`).getDate()}</strong>
                      <small>{new Date(`${event.start}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</small>
                    </span>
                    <span className="admin-calendar-mobile__details">
                      <strong>{event.title}</strong>
                      <small>{EVENT_TYPES.find(type => type.key === event.extendedProps.event_type)?.label || 'Event'}</small>
                    </span>
                  </button>
                  {canManageEvent(event.extendedProps) && (
                    <button type="button" className="admin-calendar-mobile__delete" aria-label={`Delete ${event.title}`} onClick={() => openDelete(event)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Form Modal */}
      <Modal isOpen={modal === 'form'} onClose={() => setModal(null)} title={selectedEvent ? (selectedEventCanEdit ? 'Edit Event' : 'Event Details') : 'New Event'} size="sm"
        footer={<>
          {selectedEvent && (
            <button className="btn btn-outline-primary mr-auto" onClick={() => openCreate(form.event_date)}>
              Add Another
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setModal(null)}>{selectedEventCanEdit ? 'Cancel' : 'Close'}</button>
          {selectedEventCanEdit && <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>}
        </>}>
        <div className="space-y-4">
          {!selectedEventCanEdit && <p className="text-sm text-gray-500">Only the event creator can edit or delete this event.</p>}
          <div className="form-group"><label className="form-label form-label-sm">Title *</label><input className="form-input" value={form.title} disabled={!selectedEventCanEdit} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label form-label-sm">Date *</label><input type="date" className="form-input" value={form.event_date} disabled={!selectedEventCanEdit} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label form-label-sm">Type *</label>
            <select className="form-input form-select" value={form.event_type} disabled={!selectedEventCanEdit} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}>
              {EVENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label form-label-sm">Description</label><textarea className="form-input" rows={3} value={form.description} disabled={!selectedEventCanEdit} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={modal === 'delete'} onClose={() => setModal(null)} title="Delete Event" size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete'}</button>
        </>}>
        <p>Are you sure you want to delete the event "<strong>{selectedEvent?.title}</strong>"?</p>
      </Modal>
    </div>
  );
}
