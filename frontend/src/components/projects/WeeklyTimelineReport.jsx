import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Download, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import { downloadWeeklyTimelinePdf } from '../../utils/weeklyTimelinePdf.js';

const STATUSES = ['Not Started', 'In Progress', 'Completed', 'Blocked'];

function emptyReport() {
  return {
    start_date: '',
    end_date: '',
    revision: 0,
    weeks: Array.from({ length: 10 }, (_, index) => ({
      week: index + 1,
      focus: '',
      accomplishments: '',
      status: 'Not Started',
    })),
  };
}

function normalizeReport(report) {
  if (!report) return emptyReport();
  const defaults = emptyReport();
  return {
    start_date: report.start_date || '',
    end_date: report.end_date || '',
    revision: Number(report.revision) || 0,
    weeks: defaults.weeks.map((week, index) => ({ ...week, ...(report.weeks?.[index] || {}) })),
  };
}

export default function WeeklyTimelineReport({ projectId, projectTitle, canEdit = false, canExport = false }) {
  const [report, setReport] = useState(emptyReport);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveConflict, setSaveConflict] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.get(`/projects/${projectId}/weekly-timeline`);
      setReport(normalizeReport(response.data?.report));
      setSaveConflict(false);
    } catch (error) {
      setLoadError(error.response?.data?.error || 'Could not load the weekly timeline');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const updateWeek = (index, field, value) => {
    setReport(current => ({
      ...current,
      weeks: current.weeks.map((week, weekIndex) => weekIndex === index
        ? { ...week, [field]: value }
        : week),
    }));
  };

  const saveReport = async event => {
    event.preventDefault();
    if (!report.start_date || !report.end_date) {
      toast.error('Enter a start date and an end date');
      return;
    }
    if (report.start_date > report.end_date) {
      toast.error('Start date must be on or before the end date');
      return;
    }
    setSaving(true);
    try {
      const response = await api.put(`/projects/${projectId}/weekly-timeline`, {
        ...report,
        expected_revision: report.revision,
      });
      setReport(normalizeReport(response.data?.report));
      setSaveConflict(false);
      toast.success('Weekly timeline saved');
    } catch (error) {
      if (error.response?.status === 409) setSaveConflict(true);
      toast.error(error.response?.data?.error || 'Could not save the weekly timeline');
    } finally {
      setSaving(false);
    }
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      const response = await api.get(`/projects/${projectId}/weekly-timeline/export`);
      const savedReport = response.data?.report;
      if (!savedReport) {
        toast.error('Save the reporting dates before exporting');
        return;
      }
      downloadWeeklyTimelinePdf(projectTitle, savedReport);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not export the weekly timeline');
    } finally {
      setExporting(false);
    }
  };

  const setDate = (field, value) => setReport(current => ({ ...current, [field]: value }));

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
        <div>
          <h4 className="flex items-center gap-2 font-bold text-slate-900">
            <CalendarDays className="h-4 w-4 text-blue-600" /> Weekly Timeline
          </h4>
          <p className="mt-1 text-xs text-slate-500">Shared weekly report for this project.</p>
        </div>
        {canExport && (
          <button
            type="button"
            onClick={exportReport}
            disabled={loading || Boolean(loadError) || exporting || !report.start_date}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export PDF
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading weekly timeline...
        </div>
      ) : loadError ? (
        <div className="space-y-3 p-5">
          <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-3 text-sm text-red-700">
            {loadError}. Editing is paused until the saved report loads.
          </p>
          <button
            type="button"
            onClick={loadReport}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Retry loading
          </button>
        </div>
      ) : (
        <form onSubmit={saveReport} className="space-y-4 p-4 sm:p-5">
          {!canEdit && !report.start_date && (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
              No weekly timeline report has been saved yet.
            </p>
          )}
          {(canEdit || report.start_date) && <>
          {saveConflict && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              <span>Another intern saved changes first. Your unsaved edits are still here.</span>
              <button
                type="button"
                onClick={loadReport}
                className="font-semibold underline underline-offset-2"
              >
                Load latest report and discard my edits
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              Reporting start date
              <input
                type="date"
                required={canEdit}
                disabled={!canEdit || saving}
                value={report.start_date}
                onChange={event => setDate('start_date', event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 disabled:bg-slate-50"
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              Reporting end date
              <input
                type="date"
                required={canEdit}
                min={report.start_date || undefined}
                disabled={!canEdit || saving}
                value={report.end_date}
                onChange={event => setDate('end_date', event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 disabled:bg-slate-50"
              />
            </label>
          </div>

          <div className="space-y-3">
            {report.weeks.map((week, index) => (
              <article key={week.week} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h5 className="text-sm font-bold text-slate-800">Week {week.week}</h5>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    Status
                    <select
                      value={week.status || 'Not Started'}
                      disabled={!canEdit || saving}
                      onChange={event => updateWeek(index, 'status', event.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:bg-slate-50"
                    >
                      {STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600">
                    Focus
                    <textarea
                      rows={2}
                      maxLength={4000}
                      disabled={!canEdit || saving}
                      value={week.focus || ''}
                      onChange={event => updateWeek(index, 'focus', event.target.value)}
                      placeholder={canEdit ? 'What was the focus this week?' : '-'}
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 placeholder:text-slate-400 disabled:bg-slate-50"
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-semibold text-slate-600">
                    Accomplishments
                    <textarea
                      rows={2}
                      maxLength={4000}
                      disabled={!canEdit || saving}
                      value={week.accomplishments || ''}
                      onChange={event => updateWeek(index, 'accomplishments', event.target.value)}
                      placeholder={canEdit ? 'Describe what was completed.' : '-'}
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 placeholder:text-slate-400 disabled:bg-slate-50"
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>

          {canEdit && (
            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Weekly Timeline'}
              </button>
            </div>
          )}
          </>}
        </form>
      )}
    </section>
  );
}
