const STATUS_STYLES = {
  'Not Started': {
    controlClass: 'border-slate-200 bg-slate-100 text-slate-700',
    pdfBackground: [241, 245, 249],
    pdfText: [51, 65, 85],
  },
  'In Progress': {
    controlClass: 'border-blue-200 bg-blue-50 text-blue-700',
    pdfBackground: [219, 234, 254],
    pdfText: [29, 78, 216],
  },
  Completed: {
    controlClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    pdfBackground: [209, 250, 229],
    pdfText: [4, 120, 87],
  },
  Blocked: {
    controlClass: 'border-rose-200 bg-rose-50 text-rose-700',
    pdfBackground: [255, 228, 230],
    pdfText: [190, 18, 60],
  },
};

export function getWeeklyTimelineStatusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES['Not Started'];
}
