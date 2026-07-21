import { useRef, useState } from 'react';
import DTRTable from './DTRTable.jsx';
import { FileDown, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import domtoimage from 'dom-to-image-more';
import { jsPDF } from 'jspdf';

export default function DTRPrint({ records, intern, month, year, onRowClick }) {
  const printRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    const el = printRef.current;
    if (!el) return;
    
    setIsExporting(true);
    const toastId = toast.loading('Generating perfect PDF layout...');
    
    try {
      // Temporarily hide .no-print elements inside the printable area
      const noPrintElements = el.querySelectorAll('.no-print');
      const originalDisplays = [];
      noPrintElements.forEach(node => {
        originalDisplays.push(node.style.display);
        node.style.display = 'none';
      });

      // Temporarily disable scrollbars on any element to avoid them appearing in the PDF
      const scrollableElements = el.querySelectorAll('.overflow-x-auto');
      const originalOverflows = [];
      scrollableElements.forEach(node => {
        originalOverflows.push(node.style.overflowX);
        node.style.overflowX = 'visible';
      });

      // Use dom-to-image-more for pixel-perfect CSS rendering
      const imgData = await domtoimage.toPng(el, {
        bgcolor: '#ffffff',
        scale: 2, // higher resolution
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });

      // Restore .no-print elements
      noPrintElements.forEach((node, idx) => {
        node.style.display = originalDisplays[idx];
      });

      // Restore scrollbars
      scrollableElements.forEach((node, idx) => {
        node.style.overflowX = originalOverflows[idx];
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate dimensions to fit A4 page
      const imgProps = pdf.getImageProperties(imgData);
      const canvasRatio = imgProps.width / imgProps.height;
      const pdfRatio = pdfWidth / pageHeight;

      let finalWidth = pdfWidth;
      let finalHeight = pageHeight;
      let x = 0;
      let y = 0;

      if (canvasRatio > pdfRatio) {
        // limited by width
        finalWidth = pdfWidth;
        finalHeight = pdfWidth / canvasRatio;
        y = (pageHeight - finalHeight) / 2;
      } else {
        // limited by height
        finalHeight = pageHeight;
        finalWidth = pageHeight * canvasRatio;
        x = (pdfWidth - finalWidth) / 2;
      }

      pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);

      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const fname = intern
        ? `DTR_${intern.full_name.replace(/\s+/g, '_')}_${year}-${monthNames[(month || 1) - 1]}.pdf`
        : 'DTR_Export.pdf';
      
      pdf.save(fname);
      toast.dismiss(toastId);
      toast.success('PDF successfully downloaded!');
    } catch (err) {
      console.error("PDF Export Error:", err);
      toast.dismiss(toastId);
      toast.error(`Failed to export PDF: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      {/* Action buttons — hidden during print */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4 no-print">
        <button className="btn btn-secondary btn-sm w-full sm:w-auto" onClick={handlePrint} disabled={isExporting}>
          <Printer className="w-4 h-4" /> Print
        </button>
        <button className="btn btn-primary btn-sm w-full sm:w-auto" onClick={handleExportPDF} disabled={isExporting}>
          <FileDown className="w-4 h-4" /> {isExporting ? 'Exporting...' : 'Export PDF'}
        </button>
      </div>

      {/* The printable area — horizontal scroll on mobile */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div ref={printRef} style={{ backgroundColor: '#fff', padding: '10mm', width: '100%', boxSizing: 'border-box' }} id="dtr-print-root">
          <DTRTable records={records} intern={intern} month={month} year={year} onRowClick={onRowClick} />
        </div>
      </div>
    </div>
  );
}
