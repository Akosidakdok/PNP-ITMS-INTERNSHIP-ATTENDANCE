import { jsPDF } from 'jspdf';
import { getWeeklyTimelineStatusStyle } from './weeklyTimelineStatus.js';

const PAGE_WIDTH = 210;
const LEFT = 16;
const RIGHT = 16;
const BOTTOM = 278;

function prettyDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

export function createWeeklyTimelinePdf(projectTitle, report) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const contentWidth = PAGE_WIDTH - LEFT - RIGHT;
  let y = 21;
  const ensureRoom = (height = 6) => {
    if (y + height > BOTTOM) {
      pdf.addPage();
      y = 18;
    }
  };

  pdf.setProperties({ title: `Weekly Timeline Report - ${projectTitle}` });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('WEEKLY TIMELINE REPORT', PAGE_WIDTH / 2, y, { align: 'center' });
  y += 8;
  pdf.setFontSize(12);
  const titleLines = pdf.splitTextToSize(projectTitle || 'Untitled Project', contentWidth);
  pdf.text(titleLines, PAGE_WIDTH / 2, y, { align: 'center' });
  y += titleLines.length * 5 + 2;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`Reporting Window: ${prettyDate(report.start_date)} - ${prettyDate(report.end_date)}`, PAGE_WIDTH / 2, y, { align: 'center' });
  y += 7;
  pdf.setDrawColor(190, 204, 222);
  pdf.setLineWidth(0.35);
  pdf.line(LEFT, y, PAGE_WIDTH - RIGHT, y);
  y += 8;

  const addField = (label, rawValue) => {
    const value = String(rawValue || '').trim() || '-';
    const labelWidth = 39;
    const lines = pdf.splitTextToSize(value, contentWidth - labelWidth);
    ensureRoom(5);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(`${label}:`, LEFT, y);
    pdf.setFont('helvetica', 'normal');
    if (lines.length) {
      pdf.text(lines[0], LEFT + labelWidth, y);
      y += 4.7;
    }
    for (const line of lines.slice(1)) {
      ensureRoom(5);
      pdf.text(line, LEFT + labelWidth, y);
      y += 4.7;
    }
  };

  const addStatus = rawValue => {
    const status = String(rawValue || 'Not Started').trim() || 'Not Started';
    const style = getWeeklyTimelineStatusStyle(status);
    const labelWidth = 39;
    const x = LEFT + labelWidth;
    ensureRoom(6);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    const badgeWidth = pdf.getTextWidth(status) + 4;
    pdf.setTextColor(0, 0, 0);
    pdf.text('STATUS:', LEFT, y);
    pdf.setFillColor(...style.pdfBackground);
    pdf.roundedRect(x, y - 3.6, badgeWidth, 5.5, 1.5, 1.5, 'F');
    pdf.setTextColor(...style.pdfText);
    pdf.text(status, x + 2, y);
    pdf.setTextColor(0, 0, 0);
    y += 4.7;
  };

  (report.weeks || []).forEach((week, index) => {
    ensureRoom(20);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(`WEEK: Week ${index + 1}`, LEFT, y);
    y += 5;
    addField('FOCUS', week.focus);
    addField('ACCOMPLISHMENTS', week.accomplishments);
    addStatus(week.status);
    y += 1.5;
  });

  const pageCount = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(110, 120, 135);
    pdf.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - RIGHT, 289, { align: 'right' });
  }
  return pdf;
}

export function downloadWeeklyTimelinePdf(projectTitle, report) {
  const slug = String(projectTitle || 'project-weekly-timeline')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'project-weekly-timeline';
  createWeeklyTimelinePdf(projectTitle, report).save(`${slug}-weekly-timeline.pdf`);
}
