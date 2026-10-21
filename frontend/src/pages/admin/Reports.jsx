import { useState, useEffect, useRef } from 'react';
import { BarChart3, Download, Filter } from 'lucide-react';
import api from '../../utils/api.js';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { divisionLabel } from '../../utils/display.js';
import { jsPDF } from 'jspdf';

const toMinutes = (minutes, hours) => Number.isFinite(Number(minutes))
  ? Math.max(0, Math.round(Number(minutes)))
  : Math.max(0, Math.round((Number(hours) || 0) * 60));

const formatDuration = minutes => {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, '0')}m`;
};

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const REPORT_HEADERS = ['Intern Name', 'School', 'Division', 'Days Present', 'Total Hours', 'Required Hours', 'Rendered Hours'];

const currentMonthRange = () => {
  const today = new Date();
  return {
    start_date: format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd'),
    end_date: format(today, 'yyyy-MM-dd'),
  };
};

const formatReportDate = date => format(new Date(`${date}T00:00:00`), 'MMM d, yyyy');

export default function Reports() {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [divisions, setDivisions] = useState([]);
  const [filters, setFilters] = useState(() => ({ ...currentMonthRange(), division_id: '' }));
  const reportRequestId = useRef(0);
  const hasMountedFilterEffect = useRef(false);

  useEffect(() => {
    api.get('/divisions')
      .then(r => setDivisions(r.data.divisions || []))
      .catch(() => toast.error('Could not load division list.'));
    fetchReport();
  }, []);

  const fetchReport = async () => {
    if (!filters.start_date || !filters.end_date) {
      toast.error('Choose both a start date and an end date');
      return;
    }
    if (filters.start_date > filters.end_date) {
      toast.error('Start date must be on or before end date');
      return;
    }

    const requestId = ++reportRequestId.current;
    setLoading(true);
    try {
      const res = await api.get('/admin/reports/attendance', { params: {
        start_date: filters.start_date,
        end_date: filters.end_date,
        division_id: filters.division_id,
      } });
      if (requestId === reportRequestId.current) setReport(res.data.report || []);
    } catch {
      if (requestId === reportRequestId.current) {
        setReport([]);
        toast.error('Failed to generate report.');
      }
    } finally {
      if (requestId === reportRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    // Keep exports tied to the exact date range and division used to generate them.
    if (!hasMountedFilterEffect.current) {
      hasMountedFilterEffect.current = true;
      return;
    }
    reportRequestId.current += 1;
    setLoading(false);
    setReport([]);
  }, [filters.start_date, filters.end_date, filters.division_id]);

  const getExportRows = () => report.map(r => ({
    full_name: r.full_name,
    school: r.school || '',
    division: divisionLabel(r.division_name),
    days_present: Number(r.days_present) || 0,
    total_hours: toMinutes(r.total_minutes, r.total_hours) / 60,
    required_hours: Number(r.required_hours) || 0,
    rendered_hours: toMinutes(r.rendered_minutes, r.rendered_hours) / 60,
  }));

  const getSelectedDivisionLabel = () => {
    if (!filters.division_id) return 'All Divisions';
    const division = divisions.find(d => String(d.id) === String(filters.division_id));
    return division ? divisionLabel(division.name) : 'Selected Division';
  };

  const getFilenameDateRange = () => `${filters.start_date}_to_${filters.end_date}`;

  const exportCSV = () => {
    const rows = getExportRows().map(r => [
      r.full_name,
      r.school,
      r.division,
      r.days_present,
      r.total_hours.toFixed(2),
      r.required_hours,
      r.rendered_hours.toFixed(2),
    ]);
    const csv = `\uFEFF${[REPORT_HEADERS, ...rows].map(row => row.map(csvCell).join(',')).join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `PNP-ITMS-Report-${getFilenameDateRange()}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const reportRows = getExportRows();
  const dateRangeLabel = filters.start_date && filters.end_date
    ? `${formatReportDate(filters.start_date)} to ${formatReportDate(filters.end_date)}`
    : 'Select a date range';

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const columns = [
      { label: 'Intern Name', width: 48, value: row => row.full_name },
      { label: 'School', width: 42, value: row => row.school || '—' },
      { label: 'Division', width: 48, value: row => row.division },
      { label: 'Days Present', width: 30, value: row => String(row.days_present) },
      { label: 'Total Hours', width: 34, value: row => row.total_hours.toFixed(2) },
      { label: 'Required Hours', width: 34, value: row => String(row.required_hours) },
      { label: 'Rendered Hours', width: 37, value: row => row.rendered_hours.toFixed(2) },
    ];
    const tableWidth = columns.reduce((total, column) => total + column.width, 0);
    const tableLeft = (pageWidth - tableWidth) / 2;
    const headerHeight = 10;
    const rowLineHeight = 4;

    const drawTableHeader = y => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      let x = tableLeft;
      columns.forEach(column => {
        doc.setFillColor(30, 64, 175);
        doc.rect(x, y, column.width, headerHeight, 'FD');
        doc.text(column.label, x + 2, y + 6.5);
        x += column.width;
      });
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      return y + headerHeight;
    };

    const drawPageHeading = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(17, 24, 39);
      doc.text('PNP-ITMS Attendance Report', margin, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Date range: ${dateRangeLabel}`, margin, 20);
      doc.text(`Division: ${getSelectedDivisionLabel()}`, margin, 25);
      return drawTableHeader(31);
    };

    let y = drawPageHeading();
    const bodyRows = reportRows.map(row => columns.map(column => String(column.value(row))));

    bodyRows.forEach((row, rowIndex) => {
      const cellLines = row.map((value, columnIndex) => doc.splitTextToSize(value, columns[columnIndex].width - 4));
      const lineCount = Math.max(...cellLines.map(lines => lines.length));
      const rowHeight = Math.max(9, lineCount * rowLineHeight + 2);
      if (y + rowHeight > pageHeight - 12) {
        doc.addPage();
        y = drawPageHeading();
      }

      let x = tableLeft;
      columns.forEach((column, columnIndex) => {
        doc.setFillColor(rowIndex % 2 === 0 ? 255 : 248, rowIndex % 2 === 0 ? 255 : 250, rowIndex % 2 === 0 ? 255 : 252);
        doc.setDrawColor(203, 213, 225);
        doc.rect(x, y, column.width, rowHeight, 'FD');
        doc.text(cellLines[columnIndex], x + 2, y + 4, { lineHeightFactor: 1 });
        x += column.width;
      });
      y += rowHeight;
    });

    doc.save(`PNP-ITMS-Report-${getFilenameDateRange()}.pdf`);
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const tableRows = reportRows.map(row => [
        row.full_name,
        row.school,
        row.division,
        row.days_present,
        Number(row.total_hours.toFixed(2)),
        row.required_hours,
        Number(row.rendered_hours.toFixed(2)),
      ]);
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['PNP-ITMS Attendance Report'],
        [`Date range: ${dateRangeLabel}`],
        [`Division: ${getSelectedDivisionLabel()}`],
        [],
        REPORT_HEADERS,
        ...tableRows,
      ]);
      worksheet['!cols'] = [
        { wch: 30 }, { wch: 28 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
      ];
      worksheet['!autofilter'] = { ref: `A5:G${Math.max(5, tableRows.length + 5)}` };
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
      XLSX.writeFileXLSX(workbook, `PNP-ITMS-Report-${getFilenameDateRange()}.xlsx`);
    } catch {
      toast.error('Could not export the Excel report');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Reports</h1>
          <p className="text-gray-500 text-sm">Attendance and performance summary reports</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button id="export-pdf-btn" className="btn btn-secondary w-full sm:w-auto" onClick={exportPDF} disabled={report.length === 0}>
            <Download className="w-4 h-4" /> Export PDF
          </button>
          <button id="export-excel-btn" className="btn btn-secondary w-full sm:w-auto" onClick={exportExcel} disabled={report.length === 0}>
            <Download className="w-4 h-4" /> Export Excel
          </button>
          <button id="export-csv-btn" className="btn btn-primary w-full sm:w-auto" onClick={exportCSV} disabled={report.length === 0}>
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end">
        <div className="form-group w-full sm:w-auto">
          <label className="form-label" htmlFor="report-start-date">From</label>
          <input
            id="report-start-date"
            type="date"
            className="form-input text-sm w-full sm:w-auto"
            value={filters.start_date}
            max={filters.end_date || undefined}
            onChange={e => setFilters(f => ({ ...f, start_date: e.target.value }))}
          />
        </div>
        <div className="form-group w-full sm:w-auto">
          <label className="form-label" htmlFor="report-end-date">To</label>
          <input
            id="report-end-date"
            type="date"
            className="form-input text-sm w-full sm:w-auto"
            value={filters.end_date}
            min={filters.start_date || undefined}
            onChange={e => setFilters(f => ({ ...f, end_date: e.target.value }))}
          />
        </div>
        <div className="form-group w-full sm:w-auto">
          <label className="form-label">Division</label>
          <select className="form-input form-select text-sm w-full sm:w-auto" value={filters.division_id} onChange={e => setFilters(f => ({ ...f, division_id: e.target.value }))}>
            <option value="">All Divisions</option>
            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button id="generate-report-btn" className="btn btn-primary btn-sm w-full sm:w-auto" onClick={fetchReport} disabled={loading || !filters.start_date || !filters.end_date || filters.start_date > filters.end_date}>
          <Filter className="w-4 h-4" /> {loading ? 'Loading...' : 'Generate'}
        </button>
      </div>

      {/* Report Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-gray-800 text-sm">
            Attendance Report — {dateRangeLabel}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Intern Name</th>
                <th>Division</th>
                <th>Days Present</th>
                <th>Total Hours</th>
                <th>Required</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j}><div className="skeleton h-4" /></td>)}</tr>
                ))
              ) : report.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No data for this period</td></tr>
              ) : (
                report.map((r, i) => {
                  const renderedMinutes = toMinutes(r.rendered_minutes, r.rendered_hours);
                  const requiredMinutes = (Number(r.required_hours) || 486) * 60;
                  const pct = Math.min(100, requiredMinutes > 0 ? (renderedMinutes / requiredMinutes) * 100 : 0);
                  return (
                    <tr key={i}>
                      <td data-label="Intern Name" className="font-medium text-gray-800">{r.full_name}</td>
                      <td data-label="Division" className="text-xs text-gray-500">{divisionLabel(r.division_name)}</td>
                      <td data-label="Days Present" className="text-center font-semibold">{r.days_present}</td>
                      <td data-label="Total Hours" className="text-center font-semibold">{formatDuration(toMinutes(r.total_minutes, r.total_hours))}</td>
                      <td data-label="Required" className="text-center text-gray-500">{r.required_hours}h</td>
                      <td data-label="Progress">
                        <div className="flex items-center gap-2 min-w-28">
                          <div className="progress-bar flex-1">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-medium text-blue-600">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
