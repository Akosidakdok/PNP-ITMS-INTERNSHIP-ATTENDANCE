import { useRef, useState } from 'react';
import DTRTable from './DTRTable.jsx';
import { FileDown, Printer, Download, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import domtoimage from 'dom-to-image-more';
import { jsPDF } from 'jspdf';

const DTR_EXPORT_WIDTH = 760;

function waitForNextPaint() {
  return new Promise(resolve => window.requestAnimationFrame(resolve));
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
  records,
  intern,
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
  const printRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportMode, setIsExportMode] = useState(false);
  const [paperFormat, setPaperFormat] = useState('a4'); // 'a4' | 'letter' | 'folio'

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

  const handleExportPDF = async () => {
    const el = printRef.current;
    if (!el) return;
    
    setIsExporting(true);
    const toastId = toast.loading('Generating official DTR document (PDF)...');
    
    try {
      setIsExportMode(true);
      await waitForNextPaint();
      const imgData = await captureDtrPng(el);

      // Determine dimensions according to selected format
      let jsPdfFormat = 'a4';
      let pdfWidth = 210;
      let pageHeight = 297;

      if (paperFormat === 'letter') {
        jsPdfFormat = 'letter';
        pdfWidth = 215.9;
        pageHeight = 279.4;
      } else if (paperFormat === 'folio') {
        // Standard Philippine Long / Folio: 8.5 x 13 in
        jsPdfFormat = [215.9, 330.2];
        pdfWidth = 215.9;
        pageHeight = 330.2;
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: jsPdfFormat,
      });
      
      // Calculate dimensions to fit page cleanly with standard 8mm margins
      const imgProps = pdf.getImageProperties(imgData);
      const imgRatio = imgProps.width / imgProps.height;

      const marginMm = 8;
      const printableWidth = pdfWidth - (marginMm * 2);
      const printableHeight = pageHeight - (marginMm * 2);

      let finalWidth = printableWidth;
      let finalHeight = printableWidth / imgRatio;

      // Scale to fit on 1 single page if height exceeds page bounds
      if (finalHeight > printableHeight) {
        finalHeight = printableHeight;
        finalWidth = printableHeight * imgRatio;
      }

      // Center the DTR neatly within the page margins
      const x = (pdfWidth - finalWidth) / 2;
      const y = (pageHeight - finalHeight) / 2;

      pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight, undefined, 'FAST');

      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const fname = intern
        ? `DTR_${intern.full_name.replace(/\s+/g, '_')}_${year}-${monthNames[(month || 1) - 1]}.pdf`
        : 'DTR_Export.pdf';
      
      pdf.save(fname);
      toast.dismiss(toastId);
      toast.success('DTR PDF exported successfully!');
    } catch (err) {
      console.error("PDF Export Error:", err);
      toast.dismiss(toastId);
      toast.error(`Failed to export PDF: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExportMode(false);
      setIsExporting(false);
    }
  };

  const handleExportImage = async () => {
    const el = printRef.current;
    if (!el) return;

    setIsExporting(true);
    const toastId = toast.loading('Generating DTR sheet image...');

    try {
      setIsExportMode(true);
      await waitForNextPaint();
      const imgData = await captureDtrPng(el);

      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const fname = intern
        ? `DTR_${intern.full_name.replace(/\s+/g, '_')}_${year}-${monthNames[(month || 1) - 1]}.png`
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

  return (
    <div className="dtr-print">
      {/* Action buttons & Paper format selector — hidden during print */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 no-print dtr-print__actions">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-secondary btn-sm flex items-center gap-1.5" onClick={handlePrint} disabled={isExporting}>
            <Printer className="w-4 h-4" /> Print
          </button>
          <button className="btn btn-secondary btn-sm flex items-center gap-1.5" onClick={handleExportImage} disabled={isExporting}>
            <Download className="w-4 h-4" /> {isExporting ? 'Exporting...' : 'Export PNG'}
          </button>
          <button className="btn btn-primary btn-sm flex items-center gap-1.5 font-bold shadow-xs" onClick={handleExportPDF} disabled={isExporting}>
            <FileDown className="w-4 h-4" /> {isExporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
          <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="font-semibold text-slate-600">Size:</span>
          <select
            value={paperFormat}
            onChange={(e) => setPaperFormat(e.target.value)}
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
            records={records}
            intern={intern}
            month={month}
            year={year}
            onRowClick={onRowClick}
            onDateClick={onDateClick}
            isSelectable={isSelectable}
            selectedDates={selectedDates}
            onDateToggle={onDateToggle}
            onSelectAllDates={onSelectAllDates}
            allDatesSelected={allDatesSelected}
            exportMode={isExportMode}
           />
        </div>
      </div>
    </div>
  );
}
