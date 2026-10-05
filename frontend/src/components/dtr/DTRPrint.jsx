import { useRef, useState, useEffect } from 'react';
import DTRTable from './DTRTable.jsx';
import Modal from '../common/Modal.jsx';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  FileDown,
  Printer,
  Download,
  FileText,
  Calendar,
  Check,
  Layers,
  Loader2,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import domtoimage from 'dom-to-image-more';
import { jsPDF } from 'jspdf';

const DTR_EXPORT_WIDTH = 760;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function waitForNextPaint() {
  return new Promise(resolve => window.requestAnimationFrame(() => {
    window.requestAnimationFrame(resolve);
  }));
}

async function captureDtrPng(element) {
  const noPrintElements = element.querySelectorAll('.no-print');
  const originalDisplays = [];
  const scrollableElements = element.querySelectorAll('.overflow-x-auto');
  const originalOverflows = [];

  // The export class restores the official sheet width on phones before the
  // DOM is cloned. Without it, mobile CSS collapses the seven-column sheet.
  element.classList.add('dtr-export-mode');

  try {
    noPrintElements.forEach(node => {
      originalDisplays.push(node.style.display);
      node.style.display = 'none';
    });

    scrollableElements.forEach(node => {
      originalOverflows.push(node.style.overflowX);
      node.style.overflowX = 'visible';
    });

    await waitForNextPaint();

    return await domtoimage.toPng(element, {
      bgcolor: '#ffffff',
      scale: 2,
      width: DTR_EXPORT_WIDTH,
      style: {
        transform: 'scale(1)',
        transformOrigin: 'top left',
        margin: '0',
        width: `${DTR_EXPORT_WIDTH}px`,
      }
    });
  } finally {
    noPrintElements.forEach((node, idx) => {
      node.style.display = originalDisplays[idx];
    });
    scrollableElements.forEach((node, idx) => {
      node.style.overflowX = originalOverflows[idx];
    });
    element.classList.remove('dtr-export-mode');
  }
}

export default function DTRPrint({
  records = [],
  intern,
  internId,
  month,
  year,
  onRowClick,
  onDateClick,
  isSelectable = false,
  selectedDates = [],
  onDateToggle,
  onSelectAllDates,
  allDatesSelected = false,
}) {
  const { user } = useAuth();
  const printRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportMode, setIsExportMode] = useState(false);
  const [paperFormat, setPaperFormat] = useState('a4'); // 'a4' | 'letter' | 'folio'

  // Multi-month / specific-month PDF export modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(year || new Date().getFullYear());
  const [selectedMonths, setSelectedMonths] = useState([month || (new Date().getMonth() + 1)]);
  const [combinePdf, setCombinePdf] = useState(true);
  const [exportProgress, setExportProgress] = useState(null); // { current, total, message }
  const [activeExportItem, setActiveExportItem] = useState(null); // { month, year, records }

  // Synchronize defaults with props
  useEffect(() => {
    if (year) setSelectedYear(year);
  }, [year]);

  useEffect(() => {
    if (month) setSelectedMonths([month]);
  }, [month]);

  // Fetch records for a given month and year
  const fetchMonthRecords = async (targetMonth, targetYear) => {
    if (targetMonth === month && targetYear === year && Array.isArray(records)) {
      return records;
    }

    try {
      const effectiveInternId = internId || intern?.id;
      if (effectiveInternId && user?.role !== 'intern') {
        const res = await api.get(`/admin/dtr/${effectiveInternId}`, {
          params: { month: targetMonth, year: targetYear }
        });
        return res.data?.records || [];
      } else {
        const res = await api.get('/dtr', {
          params: { month: targetMonth, year: targetYear, limit: 31 }
        });
        return res.data?.records || [];
      }
    } catch (err) {
      console.error(`Failed to fetch DTR records for ${targetMonth}/${targetYear}:`, err);
      return [];
    }
  };

  const toggleMonth = (mNum) => {
    if (isExporting) return;
    setSelectedMonths(prev => {
      if (prev.includes(mNum)) {
        return prev.filter(m => m !== mNum);
      } else {
        return [...prev, mNum].sort((a, b) => a - b);
      }
    });
  };

  const selectPresetMonths = (preset) => {
    if (isExporting) return;
    const currentMonthNum = month || (new Date().getMonth() + 1);
    switch (preset) {
      case 'this_month':
        setSelectedMonths([currentMonthNum]);
        break;
      case 'all':
        setSelectedMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        break;
      case 'q1':
        setSelectedMonths([1, 2, 3]);
        break;
      case 'q2':
        setSelectedMonths([4, 5, 6]);
        break;
      case 'q3':
        setSelectedMonths([7, 8, 9]);
        break;
      case 'q4':
        setSelectedMonths([10, 11, 12]);
        break;
      case 'clear':
        setSelectedMonths([]);
        break;
      default:
        break;
    }
  };

  const handlePrint = async () => {
    const el = printRef.current;
    if (!el || isExporting) return;

    setIsExporting(true);
    const toastId = toast.loading('Preparing official DTR for printing...');

    try {
      setIsExportMode(true);
      await waitForNextPaint();
      const imgData = await captureDtrPng(el);

      toast.dismiss(toastId);

      let printFrame = document.getElementById('dtr-print-frame');
      if (printFrame) {
        printFrame.remove();
      }

      printFrame = document.createElement('iframe');
      printFrame.id = 'dtr-print-frame';
      printFrame.style.position = 'fixed';
      printFrame.style.top = '-10000px';
      printFrame.style.left = '-10000px';
      printFrame.style.width = '1000px';
      printFrame.style.height = '1400px';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);

      let pagePaperSize = 'a4';
      if (paperFormat === 'letter') {
        pagePaperSize = 'letter';
      } else if (paperFormat === 'folio') {
        pagePaperSize = '8.5in 13in';
      }

      const frameDoc = printFrame.contentWindow.document;
      frameDoc.open();
      frameDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Daily Time Record - Print</title>
            <style>
              @page {
                size: ${pagePaperSize} portrait;
                margin: 4mm 6mm;
              }
              * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }
              html, body {
                width: 100%;
                height: 100%;
                background: #ffffff;
                overflow: hidden;
              }
              body {
                display: flex;
                justify-content: center;
                align-items: flex-start;
              }
              .print-img {
                width: 100%;
                max-width: 100%;
                max-height: 98vh;
                height: auto;
                object-fit: contain;
                display: block;
                margin: 0 auto;
              }
            </style>
          </head>
          <body>
            <img class="print-img" src="${imgData}" />
          </body>
        </html>
      `);
      frameDoc.close();

      const img = frameDoc.querySelector('img');
      const triggerPrint = () => {
        setTimeout(() => {
          try {
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();
          } catch (e) {
            console.error('Print frame error:', e);
            window.print();
          }
        }, 250);
      };

      if (img.complete) {
        triggerPrint();
      } else {
        img.onload = triggerPrint;
      }
    } catch (err) {
      console.error("Print Error:", err);
      toast.dismiss(toastId);
      toast.error('Failed to print DTR: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExportMode(false);
      setIsExporting(false);
    }
  };

  const handleExportImage = async () => {
    const el = printRef.current;
    if (!el || isExporting) return;

    setIsExporting(true);
    const toastId = toast.loading('Generating DTR sheet image...');

    try {
      setIsExportMode(true);
      await waitForNextPaint();
      const imgData = await captureDtrPng(el);

      const fname = intern
        ? `DTR_${intern.full_name.replace(/\s+/g, '_')}_${year}-${MONTH_SHORT[(month || 1) - 1]}.png`
        : 'DTR_Export.png';

      const link = document.createElement('a');
      link.download = fname;
      link.href = imgData;
      link.click();

      toast.dismiss(toastId);
      toast.success('DTR image exported successfully!');
    } catch (err) {
      console.error("Image Export Error:", err);
      toast.dismiss(toastId);
      toast.error(`Failed to export image: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExportMode(false);
      setIsExporting(false);
    }
  };

  // Multi-month / specific-month PDF export generator
  const handleExportCustomPDF = async () => {
    if (selectedMonths.length === 0) {
      toast.error('Please select at least 1 month to export');
      return;
    }

    const sortedMonths = [...selectedMonths].sort((a, b) => a - b);
    setIsExporting(true);
    setExportProgress({
      current: 0,
      total: sortedMonths.length,
      message: 'Initializing PDF export...'
    });

    try {
      setIsExportMode(true);

      // Determine dimensions according to selected format
      let jsPdfFormat = 'a4';
      let pdfWidth = 210;
      let pageHeight = 297;

      if (paperFormat === 'letter') {
        jsPdfFormat = 'letter';
        pdfWidth = 215.9;
        pageHeight = 279.4;
      } else if (paperFormat === 'folio') {
        jsPdfFormat = [215.9, 330.2];
        pdfWidth = 215.9;
        pageHeight = 330.2;
      }

      let combinedPdf = null;
      if (combinePdf) {
        combinedPdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: jsPdfFormat,
        });
      }

      const marginMm = 8;
      const printableWidth = pdfWidth - (marginMm * 2);
      const printableHeight = pageHeight - (marginMm * 2);

      for (let i = 0; i < sortedMonths.length; i++) {
        const m = sortedMonths[i];
        const monthLabel = `${MONTH_NAMES[m - 1]} ${selectedYear}`;
        setExportProgress({
          current: i + 1,
          total: sortedMonths.length,
          message: `Preparing ${monthLabel} (${i + 1} of ${sortedMonths.length})...`
        });

        // 1. Fetch records for this month
        const monthRecords = await fetchMonthRecords(m, selectedYear);

        // 2. Set active export item to render in print canvas
        setActiveExportItem({
          month: m,
          year: selectedYear,
          records: monthRecords,
        });

        // 3. Wait for browser paint & layout stabilization
        await waitForNextPaint();
        await new Promise(r => setTimeout(r, 90));

        // 4. Capture DTR PNG
        const el = printRef.current;
        if (!el) throw new Error('DTR canvas element not available');
        const imgData = await captureDtrPng(el);

        // 5. Add to PDF
        if (combinePdf && combinedPdf) {
          const imgProps = combinedPdf.getImageProperties(imgData);
          const imgRatio = imgProps.width / imgProps.height;

          let finalWidth = printableWidth;
          let finalHeight = printableWidth / imgRatio;

          if (finalHeight > printableHeight) {
            finalHeight = printableHeight;
            finalWidth = printableHeight * imgRatio;
          }

          const x = (pdfWidth - finalWidth) / 2;
          const y = (pageHeight - finalHeight) / 2;

          if (i > 0) {
            combinedPdf.addPage(jsPdfFormat, 'portrait');
          }

          combinedPdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight, undefined, 'FAST');
        } else {
          // Individual PDF for each month
          const singlePdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: jsPdfFormat,
          });

          const imgProps = singlePdf.getImageProperties(imgData);
          const imgRatio = imgProps.width / imgProps.height;

          let finalWidth = printableWidth;
          let finalHeight = printableWidth / imgRatio;

          if (finalHeight > printableHeight) {
            finalHeight = printableHeight;
            finalWidth = printableHeight * imgRatio;
          }

          const x = (pdfWidth - finalWidth) / 2;
          const y = (pageHeight - finalHeight) / 2;

          singlePdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight, undefined, 'FAST');
          const internPart = intern?.full_name ? intern.full_name.trim().replace(/\s+/g, '_') : 'Intern';
          const singleFname = `DTR_${internPart}_${selectedYear}-${MONTH_SHORT[m - 1]}.pdf`;
          singlePdf.save(singleFname);
        }
      }

      if (combinePdf && combinedPdf) {
        setExportProgress({
          current: sortedMonths.length,
          total: sortedMonths.length,
          message: 'Finalizing compiled PDF document...'
        });

        const internPart = intern?.full_name ? intern.full_name.trim().replace(/\s+/g, '_') : 'Intern';
        let fname = '';
        if (sortedMonths.length === 1) {
          fname = `DTR_${internPart}_${selectedYear}-${MONTH_SHORT[sortedMonths[0] - 1]}.pdf`;
        } else if (
          sortedMonths.length > 1 &&
          sortedMonths.every((val, idx, arr) => idx === 0 || val === arr[idx - 1] + 1)
        ) {
          fname = `DTR_${internPart}_${selectedYear}_${MONTH_SHORT[sortedMonths[0] - 1]}-${MONTH_SHORT[sortedMonths[sortedMonths.length - 1] - 1]}.pdf`;
        } else {
          fname = `DTR_${internPart}_${selectedYear}_${sortedMonths.map(m => MONTH_SHORT[m - 1]).join('_')}.pdf`;
        }

        combinedPdf.save(fname);
      }

      toast.success(
        sortedMonths.length === 1
          ? `DTR for ${MONTH_NAMES[sortedMonths[0] - 1]} ${selectedYear} exported successfully!`
          : `Combined DTR (${sortedMonths.length} months) exported as 1 PDF successfully!`
      );
      setExportModalOpen(false);
    } catch (err) {
      console.error('PDF Export Error:', err);
      toast.error(`Failed to export PDF: ${err.message || 'Unknown error'}`);
    } finally {
      setActiveExportItem(null);
      setIsExportMode(false);
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  // Format years list for dropdown
  const yearOptions = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  return (
    <div className="dtr-print">
      {/* Action buttons & Paper format selector — hidden during print */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 no-print dtr-print__actions">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            onClick={handlePrint}
            disabled={isExporting}
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            onClick={handleExportImage}
            disabled={isExporting}
          >
            <Download className="w-4 h-4" /> {isExporting ? 'Exporting...' : 'Export PNG'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm flex items-center gap-1.5 font-bold shadow-xs bg-blue-700 hover:bg-blue-800 text-white"
            onClick={() => setExportModalOpen(true)}
            disabled={isExporting}
          >
            <FileDown className="w-4 h-4" /> Export PDF
          </button>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
          <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="font-semibold text-slate-600">Size:</span>
          <select
            value={paperFormat}
            onChange={(e) => setPaperFormat(e.target.value)}
            disabled={isExporting}
            className="border-none bg-transparent font-bold text-blue-700 focus:ring-0 cursor-pointer text-xs py-0.5 pl-1 pr-6"
          >
            <option value="a4">A4 (210 × 297 mm)</option>
            <option value="letter">Short / Letter (8.5 × 11 in)</option>
            <option value="folio">Long / Folio (8.5 × 13 in)</option>
          </select>
        </div>
      </div>

      {/* DTR Color Coding Legend — on screen indicator */}
      <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4 no-print dtr-print__legend">
        <span className="font-bold text-slate-700 text-xs mr-1">
          Color Coding:
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold bg-red-100 text-red-800 border border-red-300 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-red-600"></span>
          Absent (Red)
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold bg-yellow-100 text-yellow-900 border border-yellow-300 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
          Holiday (Yellow)
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-300 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
          Suspended (Blue)
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold bg-purple-100 text-purple-800 border border-purple-300 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-purple-600"></span>
          School F2F (Purple)
        </span>
      </div>

      {/* The printable area — horizontal scroll on mobile */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} className="w-full flex justify-center dtr-print__viewport">
        <div
          ref={printRef}
          id="dtr-print-root"
          style={{
            backgroundColor: '#fff',
            width: '760px',
            minWidth: '760px',
            margin: '0 auto',
            padding: '10mm',
            boxSizing: 'border-box',
          }}
          className="dtr-print__canvas"
        >
          <DTRTable
            records={activeExportItem ? activeExportItem.records : records}
            intern={intern}
            month={activeExportItem ? activeExportItem.month : month}
            year={activeExportItem ? activeExportItem.year : year}
            onRowClick={activeExportItem ? undefined : onRowClick}
            onDateClick={activeExportItem ? undefined : onDateClick}
            isSelectable={activeExportItem ? false : isSelectable}
            selectedDates={activeExportItem ? [] : selectedDates}
            onDateToggle={activeExportItem ? undefined : onDateToggle}
            onSelectAllDates={activeExportItem ? undefined : onSelectAllDates}
            allDatesSelected={activeExportItem ? false : allDatesSelected}
            exportMode={isExportMode || Boolean(activeExportItem)}
          />
        </div>
      </div>

      {/* ── EXPORT OPTIONS MODAL (Single Month / Multi-Month as 1 PDF) ── */}
      {exportModalOpen && (
        <Modal
          isOpen={exportModalOpen}
          onClose={() => {
            if (!isExporting) setExportModalOpen(false);
          }}
          title="Export Daily Time Record (PDF)"
          size="lg"
          footer={
            <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
              <div className="text-xs text-slate-600 text-left">
                {selectedMonths.length === 0 ? (
                  <span className="text-amber-600 font-semibold">Please select at least 1 month</span>
                ) : selectedMonths.length === 1 ? (
                  <span>
                    Selected: <strong>{MONTH_NAMES[selectedMonths[0] - 1]} {selectedYear}</strong> (1 Page PDF)
                  </span>
                ) : (
                  <span>
                    Selected: <strong>{selectedMonths.length} Months</strong> ({selectedMonths.map(m => MONTH_SHORT[m - 1]).join(', ')})
                    {combinePdf ? ' → 1 Combined PDF' : ' → Individual PDFs'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  className="btn btn-secondary text-xs sm:text-sm"
                  onClick={() => setExportModalOpen(false)}
                  disabled={isExporting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary text-xs sm:text-sm flex items-center gap-1.5 font-bold shadow-xs bg-blue-700 hover:bg-blue-800 text-white"
                  onClick={handleExportCustomPDF}
                  disabled={isExporting || selectedMonths.length === 0}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating PDF...
                    </>
                  ) : selectedMonths.length > 1 && combinePdf ? (
                    <>
                      <FileDown className="w-4 h-4" />
                      Export {selectedMonths.length} Months as 1 PDF
                    </>
                  ) : selectedMonths.length === 1 ? (
                    <>
                      <FileDown className="w-4 h-4" />
                      Export {MONTH_SHORT[selectedMonths[0] - 1]} PDF (1 Page)
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4" />
                      Export {selectedMonths.length} Months (PDF)
                    </>
                  )}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4 text-xs sm:text-sm">
            {/* Header info badge */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <p className="font-bold text-blue-950 text-sm">
                  {intern?.full_name || 'Official Intern DTR Export'}
                </p>
                <p className="text-xs text-blue-700">
                  {intern?.school_name || intern?.course ? `${intern?.school_name || ''} ${intern?.course ? `(${intern.course})` : ''}` : 'Philippine National Police - ITMS'}
                </p>
              </div>
              <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-blue-200">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <label className="text-xs font-bold text-slate-700">Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  disabled={isExporting}
                  className="border-none bg-transparent font-bold text-blue-700 focus:ring-0 cursor-pointer text-xs py-0 pl-1 pr-6"
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Preset Filters */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  Select Month(s) to Export
                </span>
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                  {selectedMonths.length} of 12 selected
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => selectPresetMonths('this_month')}
                  disabled={isExporting}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                >
                  Only {MONTH_SHORT[(month || 1) - 1]}
                </button>
                <button
                  type="button"
                  onClick={() => selectPresetMonths('all')}
                  disabled={isExporting}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                >
                  All Months
                </button>
                <button
                  type="button"
                  onClick={() => selectPresetMonths('q1')}
                  disabled={isExporting}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                >
                  Q1 (Jan–Mar)
                </button>
                <button
                  type="button"
                  onClick={() => selectPresetMonths('q2')}
                  disabled={isExporting}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                >
                  Q2 (Apr–Jun)
                </button>
                <button
                  type="button"
                  onClick={() => selectPresetMonths('q3')}
                  disabled={isExporting}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                >
                  Q3 (Jul–Sep)
                </button>
                <button
                  type="button"
                  onClick={() => selectPresetMonths('q4')}
                  disabled={isExporting}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                >
                  Q4 (Oct–Dec)
                </button>
                <button
                  type="button"
                  onClick={() => selectPresetMonths('clear')}
                  disabled={isExporting}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors ml-auto"
                >
                  Clear
                </button>
              </div>

              {/* 12 Months Interactive Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                {MONTH_NAMES.map((name, idx) => {
                  const mNum = idx + 1;
                  const isSelected = selectedMonths.includes(mNum);
                  return (
                    <button
                      type="button"
                      key={mNum}
                      onClick={() => toggleMonth(mNum)}
                      disabled={isExporting}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                        isSelected
                          ? 'bg-blue-50 border-blue-500 text-blue-950 font-bold shadow-xs ring-2 ring-blue-400'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] transition-colors ${
                          isSelected ? 'bg-blue-600 text-white font-bold' : 'border border-slate-300 bg-white'
                        }`}>
                          {isSelected ? '✓' : ''}
                        </span>
                        <span>{name}</span>
                      </span>
                      <span className="text-[10px] opacity-60">
                        {MONTH_SHORT[idx]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Document and Paper Configuration */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  PDF Export Settings
                </span>
                <span className="text-xs text-slate-500">Official PNP Format</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Multi-page merge option */}
                <div
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    combinePdf
                      ? 'bg-blue-50/60 border-blue-300 text-blue-950'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                  onClick={() => !isExporting && setCombinePdf(!combinePdf)}
                >
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={combinePdf}
                      onChange={(e) => setCombinePdf(e.target.checked)}
                      disabled={isExporting || selectedMonths.length <= 1}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-xs block text-slate-800">
                        Combine as 1 Single PDF
                      </span>
                      <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                        {selectedMonths.length > 1
                          ? `Merge all ${selectedMonths.length} months sequentially (1 month per page).`
                          : 'Merges multiple months into 1 document if 2+ months are chosen.'}
                      </span>
                    </div>
                  </label>
                </div>

                {/* Paper size selection */}
                <div className="p-3 rounded-lg border bg-white border-slate-200 flex flex-col justify-between">
                  <div>
                    <label className="font-bold text-xs block text-slate-800 mb-1">
                      Paper Size Format
                    </label>
                    <select
                      value={paperFormat}
                      onChange={(e) => setPaperFormat(e.target.value)}
                      disabled={isExporting}
                      className="form-input form-select text-xs w-full py-1.5 px-2 bg-slate-50 border border-slate-300 rounded-md font-semibold text-slate-800"
                    >
                      <option value="a4">A4 (210 × 297 mm) — Standard</option>
                      <option value="letter">Short / Letter (8.5 × 11 in)</option>
                      <option value="folio">Long / Folio (8.5 × 13 in) — PH Gov</option>
                    </select>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Scaled to 1 full portrait page per month.
                  </span>
                </div>
              </div>
            </div>

            {/* Live Progress Bar during Export */}
            {isExporting && exportProgress && (
              <div className="bg-blue-50 border border-blue-300 rounded-xl p-3.5 space-y-2 animate-pulse">
                <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    {exportProgress.message}
                  </span>
                  <span>
                    {exportProgress.current} / {exportProgress.total}
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${exportProgress.total > 0 ? (exportProgress.current / exportProgress.total) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
