import domtoimage from 'dom-to-image-more';
import { jsPDF } from 'jspdf';

const EXPORT_WIDTH = 760;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 10;

const EVALUATION_PRINT_STYLES = `
  @page { size: A4 portrait; margin: 10mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .evaluation-export-sheet { width: 760px !important; max-width: none !important; max-height: none !important; height: auto !important; margin: 0 auto !important; overflow: visible !important; background: #fff !important; box-shadow: none !important; }
  .evaluation-export-sheet .no-print, .evaluation-export-actions { display: none !important; }
  .evaluation-export-sheet .table-responsive { overflow: visible !important; }
  .evaluation-export-sheet table { display: table !important; width: 100% !important; table-layout: fixed; }
  .evaluation-export-sheet thead { display: table-header-group !important; }
  .evaluation-export-sheet tbody { display: table-row-group !important; }
  .evaluation-export-sheet tr { display: table-row !important; break-inside: avoid; }
  .evaluation-export-sheet th, .evaluation-export-sheet td { display: table-cell !important; }
  .evaluation-export-sheet td::before { display: none !important; content: none !important; }
`;

function safeFilename(value) {
  return String(value || 'evaluation')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'evaluation';
}

function cloneEvaluationSheet(element) {
  const clone = element.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.add('evaluation-export-sheet');
  clone.querySelectorAll('.no-print, .evaluation-export-actions').forEach(node => node.remove());
  clone.style.width = `${EXPORT_WIDTH}px`;
  clone.style.maxWidth = 'none';
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  clone.style.background = '#ffffff';
  return clone;
}

function waitForImages(element) {
  return Promise.all(Array.from(element.querySelectorAll('img'), image => {
    if (image.complete) return Promise.resolve();
    return new Promise(resolve => {
      image.onload = resolve;
      image.onerror = resolve;
    });
  }));
}

export async function printEvaluationElement(element, title = 'Evaluation') {
  if (!element) throw new Error('Evaluation sheet is unavailable');

  const pages = await renderEvaluationPages(element);
  const printRoot = document.createElement('div');
  printRoot.id = 'evaluation-print-root';
  const style = document.createElement('style');
  style.textContent = `
    @page { size: A4 portrait; margin: ${PAGE_MARGIN_MM}mm; }
    @media screen {
      #evaluation-print-root { display: none !important; }
    }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body.evaluation-print-active > *:not(#evaluation-print-root) { display: none !important; visibility: hidden !important; }
      body.evaluation-print-active #evaluation-print-root,
      body.evaluation-print-active #evaluation-print-root * { visibility: visible !important; }
      body.evaluation-print-active #evaluation-print-root { display: block !important; width: ${A4_WIDTH_MM - PAGE_MARGIN_MM * 2}mm !important; margin: 0 auto !important; }
      body.evaluation-print-active #dtr-print-frame { display: none !important; visibility: hidden !important; }
      .evaluation-print-page { display: block; break-after: page; page-break-after: always; }
      .evaluation-print-page:last-child { break-after: auto; page-break-after: auto; }
      .evaluation-print-page img { display: block; width: 100%; height: auto; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
  document.head.appendChild(style);

  pages.forEach(page => {
    const pageElement = document.createElement('div');
    pageElement.className = 'evaluation-print-page';
    const image = document.createElement('img');
    image.src = page.data;
    pageElement.appendChild(image);
    printRoot.appendChild(pageElement);
  });

  const originalTitle = document.title;
  document.body.appendChild(printRoot);
  document.body.classList.add('evaluation-print-active');
  document.title = title;

  try {
    await Promise.all(Array.from(printRoot.querySelectorAll('img'), image => image.decode()));
    await document.fonts?.ready;
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    window.print();
  } finally {
    document.body.classList.remove('evaluation-print-active');
    printRoot.remove();
    style.remove();
    document.title = originalTitle;
  }
}

async function renderEvaluationPages(element) {
  if (!element) throw new Error('Evaluation sheet is unavailable');

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${EXPORT_WIDTH}px`;
  host.style.zIndex = '-1';
  const clone = cloneEvaluationSheet(element);
  host.appendChild(clone);
  const style = document.createElement('style');
  style.textContent = EVALUATION_PRINT_STYLES;
  host.prepend(style);
  document.body.appendChild(host);

  try {
    await waitForImages(clone);
    const imageData = await domtoimage.toPng(clone, {
      bgcolor: '#ffffff',
      scale: 2,
      width: EXPORT_WIDTH,
      style: { width: `${EXPORT_WIDTH}px`, transform: 'scale(1)', transformOrigin: 'top left' },
    });

    const image = new Image();
    image.src = imageData;
    await image.decode();

    const contentWidth = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;
    const contentHeight = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2;
    const pageSourceHeight = Math.floor((image.width * contentHeight) / contentWidth);
    const pageCanvas = document.createElement('canvas');
    const context = pageCanvas.getContext('2d');
    pageCanvas.width = image.width;

    const pages = [];
    for (let sourceY = 0; sourceY < image.height; sourceY += pageSourceHeight) {
      const sliceHeight = Math.min(pageSourceHeight, image.height - sourceY);
      pageCanvas.height = sliceHeight;
      context.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(image, 0, sourceY, image.width, sliceHeight, 0, 0, image.width, sliceHeight);
      const renderedHeight = (sliceHeight * contentWidth) / image.width;
      pages.push({ data: pageCanvas.toDataURL('image/png'), renderedHeight });
    }
    return pages;
  } finally {
    host.remove();
  }
}

export async function exportEvaluationElementToPdf(element, filename = 'evaluation') {
  const pages = await renderEvaluationPages(element);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const contentWidth = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;

  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(page.data, 'PNG', PAGE_MARGIN_MM, PAGE_MARGIN_MM, contentWidth, page.renderedHeight, undefined, 'FAST');
  });

  pdf.save(`${safeFilename(filename)}.pdf`);
}
