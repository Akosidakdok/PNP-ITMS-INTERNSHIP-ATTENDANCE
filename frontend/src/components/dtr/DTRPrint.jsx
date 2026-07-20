import { useRef } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import DTRTable from './DTRTable.jsx';
import { FileDown, Printer } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DTRPrint({ records, intern, month, year }) {
  const printRef = useRef(null);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    const el = printRef.current;
    if (!el) return;
    const toastId = toast.loading('Generating PDF...');
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      const pageHeight = pdf.internal.pageSize.getHeight();
      
      const canvasRatio = canvas.width / canvas.height;
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
      toast.success('PDF exported successfully!');
    } catch {
      toast.dismiss(toastId);
      toast.error('Failed to export PDF');
    }
  };

  return (
    <div>
      {/* Action buttons — hidden during print */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4 no-print">
        <button className="btn btn-secondary btn-sm w-full sm:w-auto" onClick={handlePrint}>
          <Printer className="w-4 h-4" /> Print
        </button>
        <button className="btn btn-primary btn-sm w-full sm:w-auto" onClick={handleExportPDF}>
          <FileDown className="w-4 h-4" /> Export PDF
        </button>
      </div>

      {/* The printable area — horizontal scroll on mobile */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div ref={printRef} style={{ backgroundColor: '#fff' }}>
          <DTRTable records={records} intern={intern} month={month} year={year} />
        </div>
      </div>
    </div>
  );
}
