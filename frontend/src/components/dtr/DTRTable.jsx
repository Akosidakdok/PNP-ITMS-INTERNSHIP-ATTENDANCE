import { format, getDaysInMonth, parseISO } from 'date-fns';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

/**
 * Split a full name into { lastName, firstName, middleName }
 * Best-effort: treats last word as last name, second-to-last as middle (if 3+ words)
 */
function splitName(fullName = '') {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { lastName: parts[0], firstName: '', middleName: '' };
  if (parts.length === 2) return { lastName: parts[1], firstName: parts[0], middleName: '' };
  const lastName  = parts[parts.length - 1];
  const firstName = parts[0];
  const middleName = parts.slice(1, parts.length - 1).join(' ');
  return { lastName, firstName, middleName };
}

/** Color-coded approval status badge */
function StatusBadge({ status, large = false }) {
  if (!status) return <>&nbsp;</>;

  const map = {
    approved: { bg: '#dcfce7', color: '#15803d', border: '1px solid #86efac', label: 'Approved' },
    rejected: { bg: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', label: 'Rejected' },
    pending:  { bg: '#fef9c3', color: '#854d0e', border: '1px solid #fde047', label: 'Pending'  },
  };
  const cfg = map[status] || map.pending;

  return (
    <span style={{
      background: cfg.bg,
      color: cfg.color,
      border: cfg.border,
      fontSize: large ? '10px' : '8px',
      padding: large ? '2px 6px' : '1px 4px',
      borderRadius: '4px',
      display: 'inline-block',
      whiteSpace: 'nowrap',
      fontWeight: 'bold',
    }}>
      {cfg.label}
    </span>
  );
}

export default function DTRTable({ records, intern, month, year }) {
  const daysInMonth = month && year ? getDaysInMonth(new Date(year, month - 1, 1)) : 31;

  // Build lookup: Manila calendar day → record
  const recordsByDay = {};
  records.forEach(r => {
    try {
      const d = parseISO(r.date);
      if (d.getMonth() + 1 === month && d.getFullYear() === year) {
        recordsByDay[d.getDate()] = r;
      }
    } catch { /* skip malformed dates */ }
  });

  // Totals from all records in month
  const totalMinutes = records.reduce((sum, r) => sum + Math.round((r.total_hours || 0) * 60), 0);
  const totalHrs = Math.floor(totalMinutes / 60);
  const totalMin = totalMinutes % 60;

  // Overall status across all records
  const allStatuses = records.map(r => r.approval_status).filter(Boolean);
  let overallStatus = 'pending';
  if (allStatuses.length && allStatuses.every(s => s === 'approved')) overallStatus = 'approved';
  if (allStatuses.some(s => s === 'rejected')) overallStatus = 'rejected';

  const { lastName, firstName, middleName } = intern ? splitName(intern.full_name) : {};

  // Times come from backend already in Manila HH:MM — just pretty-print them
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    try {
      return format(new Date(`2000-01-01T${timeStr}`), 'h:mm a');
    } catch { return timeStr; }
  };

  return (
    <div
      id="dtr-print-root"
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '11px',
        color: '#000',
        backgroundColor: '#fff',
        padding: '16px 20px',
        maxWidth: '720px',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        {/* PNP Logo — left */}
        <img
          src="/PNP_LOGO.png"
          alt="PNP Logo"
          style={{ width: '64px', height: '64px', objectFit: 'contain' }}
          onError={e => { e.target.style.display = 'none'; }}
        />

        {/* Center text */}
        <div style={{ textAlign: 'center', flex: 1, lineHeight: '1.4' }}>
          <div style={{ fontSize: '10px' }}>Republic of the Philippines</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold' }}>NATIONAL POLICE COMMISSION</div>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>PHILIPPINE NATIONAL POLICE</div>
          <div style={{ fontSize: '11px', fontWeight: 'bold' }}>
            INFORMATION TECHNOLOGY MANAGEMENT SERVICE
          </div>
          <div style={{ fontSize: '10px' }}>Camp BGen Rafael T Crame, Quezon City</div>
        </div>

        {/* ITMS Logo — right */}
        <img
          src="/ITMS_LOGO.png"
          alt="ITMS Logo"
          style={{ width: '64px', height: '64px', objectFit: 'contain' }}
          onError={e => { e.target.style.display = 'none'; }}
        />
      </div>

      

      {/* ── TITLE ── */}
      <div style={{ textAlign: 'center', margin: '6px 0 4px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold' }}>On-the-Job Training</div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', textDecoration: 'underline' }}>
          DAILY TIME RECORD
        </div>
      </div>

      {/* ── INFO FIELDS ── */}
      <div style={{ marginBottom: '6px' }}>
        {/* Month / Year */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '3px' }}>
          <div>
            <span style={{ fontWeight: 'bold' }}>MONTH: </span>
            <span style={{ borderBottom: '1px solid #000', minWidth: '90px', display: 'inline-block', paddingBottom: '1px' }}>
              {month ? MONTH_NAMES[month - 1] : ''}
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 'bold' }}>YEAR: </span>
            <span style={{ borderBottom: '1px solid #000', minWidth: '60px', display: 'inline-block', paddingBottom: '1px' }}>
              {year || ''}
            </span>
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: '3px' }}>
          <span style={{ fontWeight: 'bold' }}>Name: </span>
          <span style={{
            borderBottom: '1px solid #000',
            display: 'inline-grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
            minWidth: '420px',
            paddingBottom: '1px',
          }}>
            <span style={{ textAlign: 'center' }}>{intern ? lastName : ''}</span>
            <span style={{ textAlign: 'center' }}>{intern ? firstName : ''}</span>
            <span style={{ textAlign: 'center' }}>{intern ? middleName : ''}</span>
          </span>
        </div>
        {/* Name sub-labels */}
        <div style={{ display: 'inline-grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginLeft: '42px', minWidth: '420px', marginBottom: '3px' }}>
          <span style={{ fontSize: '9px', textAlign: 'center', color: '#555' }}>Last Name</span>
          <span style={{ fontSize: '9px', textAlign: 'center', color: '#555' }}>First Name</span>
          <span style={{ fontSize: '9px', textAlign: 'center', color: '#555' }}>Middle Name</span>
        </div>

        {/* Course */}
        <div style={{ marginBottom: '3px' }}>
          <span style={{ fontWeight: 'bold' }}>Course: </span>
          <span style={{ borderBottom: '1px solid #000', minWidth: '340px', display: 'inline-block', paddingBottom: '1px' }}>
            {intern?.course || ''}
          </span>
        </div>

        {/* School */}
        <div style={{ marginBottom: '3px' }}>
          <span style={{ fontWeight: 'bold' }}>School: </span>
          <span style={{ borderBottom: '1px solid #000', minWidth: '340px', display: 'inline-block', paddingBottom: '1px' }}>
            {intern?.school || ''}
          </span>
        </div>

        {/* Training Hours */}
        <div style={{ marginBottom: '3px' }}>
          <span style={{ fontWeight: 'bold' }}>Training Hours: </span>
          <span style={{ borderBottom: '1px solid #000', minWidth: '90px', display: 'inline-block', paddingBottom: '1px' }}>
            {intern?.required_hours ? `${intern.required_hours} hrs` : ''}
          </span>
        </div>

        {/* Office */}
        <div style={{ marginBottom: '6px' }}>
          <span style={{ fontWeight: 'bold' }}>Office: </span>
          <span style={{ borderBottom: '1px solid #000', minWidth: '340px', display: 'inline-block', paddingBottom: '1px' }}>
            {intern?.department_name || ''}
          </span>
        </div>
      </div>

      {/* ── ATTENDANCE TABLE ── */}
      {/*
        Columns: Date | AM Time In | AM Status | PM Time Out | PM Status | Total Hrs | Overall Status
        Removed: AM Time Out, AM Sig(2), PM Time In, PM Sig(1)
      */}
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '10px',
        tableLayout: 'fixed',
      }}>
        <colgroup>
          <col style={{ width: '12%' }} /> {/* Date */}
          <col style={{ width: '12%' }} /> {/* AM Time In */}
          <col style={{ width: '13%' }} /> {/* AM Status */}
          <col style={{ width: '12%' }} /> {/* PM Time Out */}
          <col style={{ width: '13%' }} /> {/* PM Status */}
          <col style={{ width: '11%' }} /> {/* Total Hrs */}
          <col style={{ width: '27%' }} /> {/* Overall Status */}
        </colgroup>
        <thead>
          {/* Group headers */}
          <tr>
            <th rowSpan={2} style={thStyle({ borderRight: '1px solid #000' })}>Date</th>
            <th colSpan={2} style={thStyle({ backgroundColor: '#cce5ff', borderRight: '1px solid #000' })}>AM</th>
            <th colSpan={2} style={thStyle({ backgroundColor: '#ffdde1', borderRight: '1px solid #000' })}>PM</th>
            <th rowSpan={2} style={thStyle({ borderRight: '1px solid #000' })}>{'Total\nHrs.'}</th>
            <th rowSpan={2} style={thStyle({})}>Overall{'\n'}Status</th>
          </tr>
          <tr>
            {/* AM sub-headers */}
            <th style={thStyle({ backgroundColor: '#cce5ff' })}>Time In</th>
            <th style={thStyle({ backgroundColor: '#cce5ff', borderRight: '1px solid #000' })}>Status</th>
            {/* PM sub-headers */}
            <th style={thStyle({ backgroundColor: '#ffdde1' })}>Time Out</th>
            <th style={thStyle({ backgroundColor: '#ffdde1', borderRight: '1px solid #000' })}>Status</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const rec = recordsByDay[day];
            return (
              <tr key={day}>
                {/* Date formatted as MM/DD/YYYY */}
                <td style={tdStyle({ textAlign: 'center', fontWeight: '600', borderRight: '1px solid #000', height: '18px', fontSize: '9px' })}>
                  {`${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`}
                </td>

                {/* AM Time In (capped: early scans show as 8:00 AM) */}
                <td style={tdStyle({ backgroundColor: '#e8f4ff', textAlign: 'center', fontSize: '9px' })}>
                  {rec ? formatTime(rec.am_time_in) : ''}
                </td>

                {/* AM Status */}
                <td style={tdStyle({ backgroundColor: '#e8f4ff', textAlign: 'center', borderRight: '1px solid #000' })}>
                  {rec?.am_time_in ? <StatusBadge status={rec.am_status} /> : <>&nbsp;</>}
                </td>

                {/* Time Out — shows PM Time Out; falls back to AM Time Out if intern left during AM */}
                <td style={tdStyle({ backgroundColor: '#ffe8eb', textAlign: 'center', fontSize: '9px' })}>
                  {rec ? formatTime(rec.pm_time_out || rec.am_time_out) : ''}
                </td>

                {/* Time Out Status — uses PM status when PM exists, AM status otherwise */}
                <td style={tdStyle({ backgroundColor: '#ffe8eb', textAlign: 'center', borderRight: '1px solid #000' })}>
                  {rec?.pm_time_out
                    ? <StatusBadge status={rec.pm_status} />
                    : rec?.am_time_out
                      ? <StatusBadge status={rec.am_status} />
                      : <>&nbsp;</>}
                </td>

                {/* Total Hrs */}
                <td style={tdStyle({ textAlign: 'center', borderRight: '1px solid #000', fontSize: '9px' })}>
                  {rec && rec.total_hours ? rec.total_hours.toFixed(2) : ''}
                </td>

                {/* Overall Status for the day */}
                <td style={tdStyle({ textAlign: 'center' })}>
                  {rec ? <StatusBadge status={rec.approval_status} /> : <>&nbsp;</>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── TOTAL ROW ── */}
      <div style={{ textAlign: 'right', marginTop: '4px', fontSize: '11px', fontWeight: 'bold' }}>
        Total:&nbsp;
        <span style={{ borderBottom: '1px solid #000', minWidth: '40px', display: 'inline-block', textAlign: 'center', paddingBottom: '1px' }}>
          {totalHrs}
        </span>
        &nbsp;Hrs.&nbsp;
        <span style={{ borderBottom: '1px solid #000', minWidth: '40px', display: 'inline-block', textAlign: 'center', paddingBottom: '1px' }}>
          {String(totalMin).padStart(2, '0')}
        </span>
        &nbsp;min.
      </div>

      {/* ── SIGNATURE + OVERALL STATUS BLOCK ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '32px', fontSize: '10px' }}>
        {/* Trainee */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <div style={{ borderBottom: '1px solid #000', marginBottom: '2px', minHeight: '20px' }} />
              <div>Trainee&apos;s Signature over Printed Name</div>
            </div>
            <div>
              <div style={{ borderBottom: '1px solid #000', marginBottom: '2px', minHeight: '20px' }} />
              <div>Date</div>
            </div>
          </div>
        </div>

        {/* Supervisor */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <div style={{ borderBottom: '1px solid #000', marginBottom: '2px', minHeight: '20px' }} />
              <div>Supervisor&apos;s Signature over Printed Name</div>
            </div>
            <div>
              <div style={{ borderBottom: '1px solid #000', marginBottom: '2px', minHeight: '20px' }} />
              <div>Date</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Style helpers ── */
function thStyle(extra = {}) {
  return {
    border: '1px solid #000',
    padding: '3px 2px',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '10px',
    whiteSpace: 'pre-line',
    verticalAlign: 'middle',
    ...extra,
  };
}

function tdStyle(extra = {}) {
  return {
    border: '1px solid #000',
    padding: '1px 2px',
    verticalAlign: 'middle',
    height: '16px',
    ...extra,
  };
}
