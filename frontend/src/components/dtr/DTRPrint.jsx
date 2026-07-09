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
    toast.loading('Generating PDF...');
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#fff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const fname = intern ? `DTR_${intern.full_name.replace(/\s+/g, '_')}_${year}-${String(month).padStart(2, '0')}.pdf` : 'DTR_Export.pdf';
      pdf.save(fname);
      toast.dismiss();
      toast.success('PDF exported successfully!');
    } catch {
      toast.dismiss();
      toast.error('Failed to export PDF');
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 no-print">
        <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
          <Printer className="w-4 h-4" /> Print
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleExportPDF}>
          <FileDown className="w-4 h-4" /> Export PDF
        </button>
      </div>

      <div ref={printRef} className="bg-white p-6 rounded-xl">
        <DTRTable records={records} intern={intern} month={month} year={year} />
      </div>
    </div>
  );
}
