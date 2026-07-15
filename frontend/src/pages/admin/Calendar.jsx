import { useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction'; // <-- Import the interaction plugin
import { Trash2, Tag, Calendar as CalendarIcon, FileText, Filter } from 'lucide-react';
import api from '../../utils/api.js';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { useCalendar, EVENT_TYPES } from '../../hooks/useCalendar.js';

const INIT_FORM = { title: '', description: '', event_date: '', event_type: 'announcement' };

export default function AdminCalendar() {
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
  const { fetchEvents } = useCalendar(calendarRef);

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
    setSelectedEvent(event.extendedProps);
    setModal('delete');
  }

  const handleSave = async () => {
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
      calendarRef.current.getApi().refetchEvents();
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
      calendarRef.current.getApi().refetchEvents();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to delete event');
    } finally {
      setSaving(false);
    }
  };

  const handleEventDrop = async (info) => {
    const { id, title } = info.event.extendedProps;
    const newDate = info.event.startStr;
    if (!confirm(`Move "${title}" to ${newDate}?`)) {
      info.revert();
      return;
    }
    try {
      await api.put(`/calendar-events/${id}`, { event_date: newDate });
      toast.success('Event date updated');
      calendarRef.current.getApi().refetchEvents();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to move event');
      info.revert();
    }
  };

  const eventIcons = { holiday: <Tag className="w-3 h-3 text-red-500" />, announcement: <CalendarIcon className="w-3 h-3 text-blue-500" />, memo: <FileText className="w-3 h-3 text-orange-500" /> };

  const renderEventContent = (eventInfo) => (
    <div className="flex items-center justify-between w-full p-1 gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {eventIcons[eventInfo.event.extendedProps.event_type] || <Tag className="w-3 h-3" />}
        <span className="truncate font-medium text-xs">
          {eventInfo.event.title}
        </span>
      </div>
      <button className="ml-2 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); openDelete(eventInfo.event); }}>
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );

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
        <p className="text-gray-500 text-sm">Manage holidays, announcements, and memos.</p>
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
        <div className="flex-1" />
        <button className="btn btn-primary" onClick={() => openCreate(new Date().toISOString().slice(0, 10))}>
          Add Event
        </button>
      </div>

      <div className="card p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next',
            center: 'title',
            right: 'today'
          }}
          customButtons={{
            addEventButton: {
              text: 'Add Event',
              click: () => openCreate(new Date().toISOString().slice(0, 10)),
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
          eventClick={(arg) => openEdit(arg.event)}
          datesSet={handleDatesSet}
          editable={true} // Allows drag-and-drop
          eventDrop={handleEventDrop}
          eventContent={renderEventContent}
          droppable={true}
        />
      </div>

      {/* Form Modal */}
      <Modal isOpen={modal === 'form'} onClose={() => setModal(null)} title={selectedEvent ? 'Edit Event' : 'New Event'} size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </>}>
        <div className="space-y-4">
          <div className="form-group"><label className="form-label form-label-sm">Title *</label><input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label form-label-sm">Date *</label><input type="date" className="form-input" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label form-label-sm">Type *</label>
            <select className="form-input form-select" value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}>
              {EVENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label form-label-sm">Description</label><textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
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