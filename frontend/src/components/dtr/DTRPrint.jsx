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

      // If content is taller than one A4 page, add additional pages
      const pageHeight = pdf.internal.pageSize.getHeight();
      if (pdfHeight <= pageHeight) {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      } else {
        let position = 0;
        let remainingHeight = pdfHeight;
        let firstPage = true;
        while (remainingHeight > 0) {
          if (!firstPage) pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, -position, pdfWidth, pdfHeight);
          position += pageHeight;
          remainingHeight -= pageHeight;
          firstPage = false;
        }
      }

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
      <div className="flex gap-2 mb-4 no-print">
        <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
          <Printer className="w-4 h-4" /> Print
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleExportPDF}>
          <FileDown className="w-4 h-4" /> Export PDF
        </button>
      </div>

      {/* The printable area */}
      <div ref={printRef} style={{ backgroundColor: '#fff' }}>
        <DTRTable records={records} intern={intern} month={month} year={year} />
      </div>
    </div>
  );
}
