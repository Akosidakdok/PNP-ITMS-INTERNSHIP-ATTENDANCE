import { useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { exportEvaluationElementToPdf, printEvaluationElement } from '../../utils/evaluationExport.js';

export default function EvaluationActions({ elementId, filename }) {
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const getSheet = () => document.getElementById(elementId);

  const handlePrint = async () => {
    if (printing || exporting) return;
    setPrinting(true);
    try {
      await printEvaluationElement(getSheet(), filename);
    } catch (error) {
      toast.error(error.message || 'Could not print this evaluation');
    } finally {
      setPrinting(false);
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportEvaluationElementToPdf(getSheet(), filename);
      toast.success('Evaluation PDF downloaded');
    } catch (error) {
      console.error('Evaluation PDF export failed:', error);
      toast.error(error.message || 'Could not export this evaluation');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="evaluation-export-actions no-print flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={handlePrint}
        disabled={exporting || printing}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        <Printer className="h-4 w-4" /> {printing ? 'Preparing...' : 'Print'}
      </button>
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting || printing}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
      >
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {exporting ? 'Exporting...' : 'Export PDF'}
      </button>
    </div>
  );
}
