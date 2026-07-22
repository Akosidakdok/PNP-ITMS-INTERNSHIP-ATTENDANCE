import { useState } from 'react';
import { format, getDaysInMonth, parseISO } from 'date-fns';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

function getHolidayName(year, month, day) {
  // Fixed dates
  if (month === 1 && day === 1) return "New Year's Day";
  if (month === 4 && day === 9) return "Araw ng Kagitingan";
  if (month === 5 && day === 1) return "Labor Day";
  if (month === 6 && day === 12) return "Independence Day";
  if (month === 11 && day === 30) return "Bonifacio Day";
  if (month === 12 && day === 25) return "Christmas Day";
  if (month === 12 && day === 30) return "Rizal Day";

  // Movable holidays for 2024, 2025, 2026, 2027
  if (year === 2024) {
    if (month === 3 && day === 28) return "Maundy Thursday";
    if (month === 3 && day === 29) return "Good Friday";
    if (month === 8 && day === 26) return "National Heroes Day";
  }
  if (year === 2025) {
    if (month === 4 && day === 17) return "Maundy Thursday";
    if (month === 4 && day === 18) return "Good Friday";
    if (month === 8 && day === 25) return "National Heroes Day";
  }
  if (year === 2026) {
    if (month === 4 && day === 2) return "Maundy Thursday";
    if (month === 4 && day === 3) return "Good Friday";
    if (month === 8 && day === 31) return "National Heroes Day";
  }
  if (year === 2027) {
    if (month === 3 && day === 25) return "Maundy Thursday";
    if (month === 3 && day === 26) return "Good Friday";
    if (month === 8 && day === 30) return "National Heroes Day";
  }

  return null;
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

export default function DTRTable({ records, intern, month, year, onRowClick }) {
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

  // Fallback to splitName if the new distinct columns are empty (for existing interns before migration)
  let lastName = intern?.last_name || '';
  let firstName = intern?.first_name || '';
  let middleName = intern?.middle_name || '';
  let nameSuffix = intern?.name_suffix ? `, ${intern.name_suffix}` : '';

  if (intern && !lastName && !firstName && intern.full_name) {
    const parts = intern.full_name.trim().split(/\s+/);
    if (parts.length === 1) {
      lastName = parts[0];
    } else if (parts.length === 2) {
      lastName = parts[1];
      firstName = parts[0];
    } else if (parts.length > 2) {
      lastName = parts[parts.length - 1];
      firstName = parts[0];
      middleName = parts.slice(1, parts.length - 1).join(' ');
    }
  }

  // Times come from backend already in Manila HH:MM — just pretty-print them
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    try {
      return format(new Date(`2000-01-01T${timeStr}`), 'h:mm a');
    } catch { return timeStr; }
  };

  return (
    <>
      {/* ── MOBILE LIST VIEW ── */}
      <div className="md:hidden space-y-3 no-print bg-gray-50/30 p-1">
        <div className="flex items-center justify-between mb-4 px-2">
          <div>
            <h2 className="font-bold text-gray-800 text-sm">Attendance Log</h2>
            <p className="text-xs text-gray-500">{month && year ? format(new Date(year, month - 1, 1), 'MMMM yyyy') : ''}</p>
          </div>
          <div className="text-right">
            <span className="font-black text-blue-700 text-lg">{totalHrs}h {totalMin}m</span>
          </div>
        </div>

        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const rec = recordsByDay[day];
          const holiday = getHolidayName(year, month, day);
          const dateStr = month && year ? format(new Date(year, month - 1, day), 'EEE, MMM d') : day;
          
          // Skip empty weekends to save space
          const isWeekend = month && year ? [0, 6].includes(new Date(year, month - 1, day).getDay()) : false;
          if (!rec && !holiday && isWeekend) return null;

          return (
            <div 
              key={day} 
              className={`p-3 rounded-xl border ${rec ? 'bg-white border-gray-200 shadow-sm cursor-pointer active:bg-gray-50' : 'bg-gray-100/40 border-gray-100'}`}
              onClick={() => rec && onRowClick && onRowClick(rec)}
            >
              <div className="flex justify-between items-center mb-1.5">
                <span className={`font-bold text-xs ${isWeekend ? 'text-gray-400' : 'text-gray-700'}`}>{dateStr}</span>
                {rec && <StatusBadge status={rec.approval_status} />}
              </div>
              
              {holiday ? (
                <div className="text-xs font-semibold text-red-500 italic">{holiday}</div>
              ) : rec?.remarks && String(rec.remarks).startsWith('OVERRIDE:') ? (
                <div className="text-[11px] font-semibold text-purple-600 bg-purple-50 p-1.5 rounded inline-block mt-1">
                  {String(rec.remarks).split(':')[3] || 'Overridden'} 
                  <span className="opacity-75 ml-1">({Number(String(rec.remarks).split(':')[2] || 0).toFixed(2)}h)</span>
                </div>
              ) : rec ? (
                <div className="grid grid-cols-3 gap-2 text-[11px] mt-2">
                  <div className="bg-gray-50 p-1.5 rounded">
                    <span className="text-gray-400 block mb-0.5 text-[9px] uppercase font-bold">In</span>
                    <span className="font-semibold text-gray-800">{formatTime(rec.time_in) || '--:--'}</span>
                  </div>
                  <div className="bg-gray-50 p-1.5 rounded">
                    <span className="text-gray-400 block mb-0.5 text-[9px] uppercase font-bold">Out</span>
                    <span className="font-semibold text-gray-800">{formatTime(rec.time_out) || '--:--'}</span>
                  </div>
                  <div className="bg-gray-50 p-1.5 rounded text-right">
                    <span className="text-gray-400 block mb-0.5 text-[9px] uppercase font-bold">Hours</span>
                    <span className="font-black text-blue-600">{Number(rec.total_hours || 0).toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic">No record</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── DESKTOP PRINT VIEW ── */}
      <div
        id="dtr-print-root"
        className="hidden md:block print:block"
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

      {/* ── INFO FIELDS (LEGACY FLOAT LAYOUT FOR HTML2CANVAS) ── */}
      <div style={{ fontSize: '11px', marginBottom: '12px' }}>
        
        {/* Month / Year */}
        <div style={{ clear: 'both', marginBottom: '8px', height: '16px' }}>
          <div style={{ float: 'left', fontWeight: 'bold', width: '50px' }}>MONTH:</div>
          <div style={{ float: 'left', width: '120px', textAlign: 'center' }}>
            <div style={{ height: '14px' }}>{month ? MONTH_NAMES[month - 1] : ''}</div>
            <div style={{ borderTop: '1px solid #000' }}></div>
          </div>
          
          <div style={{ float: 'left', width: '30px' }}>&nbsp;</div>
          
          <div style={{ float: 'left', fontWeight: 'bold', width: '40px' }}>YEAR:</div>
          <div style={{ float: 'left', width: '80px', textAlign: 'center' }}>
            <div style={{ height: '14px' }}>{year || ''}</div>
            <div style={{ borderTop: '1px solid #000' }}></div>
          </div>
        </div>

        {/* Name */}
        <div style={{ clear: 'both', marginBottom: '12px', height: '28px' }}>
          <div style={{ float: 'left', fontWeight: 'bold', width: '45px' }}>Name:</div>
          <div style={{ float: 'left', width: 'calc(100% - 45px)' }}>
            <div style={{ height: '14px' }}>
              <div style={{ float: 'left', width: '30%', textAlign: 'center' }}>{intern ? lastName : ''}</div>
              <div style={{ float: 'left', width: '30%', textAlign: 'center' }}>{intern ? firstName : ''}</div>
              <div style={{ float: 'left', width: '30%', textAlign: 'center' }}>{intern ? middleName : ''}</div>
              <div style={{ float: 'left', width: '10%', textAlign: 'center' }}>{intern ? nameSuffix.replace(', ', '') : ''}</div>
            </div>
            <div style={{ borderTop: '1px solid #000', clear: 'both' }}></div>
            <div style={{ marginTop: '2px' }}>
              <div style={{ float: 'left', width: '30%', textAlign: 'center', fontSize: '9px', color: '#555' }}>Last Name</div>
              <div style={{ float: 'left', width: '30%', textAlign: 'center', fontSize: '9px', color: '#555' }}>First Name</div>
              <div style={{ float: 'left', width: '30%', textAlign: 'center', fontSize: '9px', color: '#555' }}>Middle Name</div>
              <div style={{ float: 'left', width: '10%', textAlign: 'center', fontSize: '9px', color: '#555' }}>Suffix</div>
            </div>
          </div>
        </div>

        {/* Course */}
        <div style={{ clear: 'both', marginBottom: '8px', height: '16px' }}>
          <div style={{ float: 'left', fontWeight: 'bold', width: '50px' }}>Course:</div>
          <div style={{ float: 'left', width: 'calc(100% - 50px)' }}>
            <div style={{ height: '14px', paddingLeft: '8px' }}>{intern?.course || ''}</div>
            <div style={{ borderTop: '1px solid #000' }}></div>
          </div>
        </div>

        {/* School */}
        <div style={{ clear: 'both', marginBottom: '8px', height: '16px' }}>
          <div style={{ float: 'left', fontWeight: 'bold', width: '50px' }}>School:</div>
          <div style={{ float: 'left', width: 'calc(100% - 50px)' }}>
            <div style={{ height: '14px', paddingLeft: '8px' }}>{intern?.school || ''}</div>
            <div style={{ borderTop: '1px solid #000' }}></div>
          </div>
        </div>

        {/* Training Hours */}
        <div style={{ clear: 'both', marginBottom: '8px', height: '16px' }}>
          <div style={{ float: 'left', fontWeight: 'bold', width: '90px' }}>Training Hours:</div>
          <div style={{ float: 'left', width: '100px', textAlign: 'center' }}>
            <div style={{ height: '14px' }}>{intern?.required_hours ? `${intern.required_hours} hrs` : ''}</div>
            <div style={{ borderTop: '1px solid #000' }}></div>
          </div>
        </div>

        {/* Office */}
        <div style={{ clear: 'both', marginBottom: '8px', height: '16px' }}>
          <div style={{ float: 'left', fontWeight: 'bold', width: '45px' }}>Office:</div>
          <div style={{ float: 'left', width: 'calc(100% - 45px)' }}>
            <div style={{ height: '14px', paddingLeft: '8px' }}>{intern?.division_name || intern?.department_name || ''}</div>
            <div style={{ borderTop: '1px solid #000' }}></div>
          </div>
        </div>

        <div style={{ clear: 'both' }}></div>
      </div>

      {/* ── ATTENDANCE TABLE ── */}
      {/*
        Columns: Date | AM Time In | AM Status | PM Time Out | PM Status | Total Hrs | Overall Status
        Removed: AM Time Out, AM Sig(2), PM Time In, PM Sig(1)
      */}
      <div className="overflow-x-auto w-full">
        <table style={{
          width: '100%',
          minWidth: '600px',
          borderCollapse: 'collapse',
          fontSize: '10px',
          tableLayout: 'fixed',
        }}>
        <colgroup><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} /><col style={{ width: '11%' }} /><col style={{ width: '27%' }} /></colgroup>
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
            const dateObj = new Date(year, month - 1, day);
            const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
            const holidayName = getHolidayName(year, month, day);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            // Click helper
            const handleRowClick = () => {
              if (onRowClick) {
                onRowClick(day, rec);
              }
            };

            if (rec?.is_override) {
              if (rec.override_type === 'suspended') {
                return (
                  <tr
                    key={day}
                    onClick={handleRowClick}
                    style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                    className={onRowClick ? 'hover:bg-blue-50/20 transition-colors' : ''}
                  >
                    {/* Date formatted as MM/DD/YYYY */}
                    <td style={tdStyle({ textAlign: 'center', fontWeight: '600', borderRight: '1px solid #000', height: '18px', fontSize: '9px' })}>
                      {`${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`}
                    </td>
                    <td colSpan={6} style={tdStyle({
                      textAlign: 'center',
                      fontWeight: 'bold',
                      fontStyle: 'italic',
                      backgroundColor: '#f3f4f6', // Suspension gray
                      color: '#4b5563',
                      fontSize: '9px',
                      letterSpacing: '0.5px',
                      height: '18px'
                    })}>
                      SUSPENDED: {rec.remarks || 'Suspension'}
                    </td>
                  </tr>
                );
              } else if (rec.override_type === 'excused') {
                return (
                  <tr
                    key={day}
                    onClick={handleRowClick}
                    style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                    className={onRowClick ? 'hover:bg-blue-50/20 transition-colors' : ''}
                  >
                    {/* Date formatted as MM/DD/YYYY */}
                    <td style={tdStyle({ textAlign: 'center', fontWeight: '600', borderRight: '1px solid #000', height: '18px', fontSize: '9px' })}>
                      {`${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`}
                    </td>
                    <td colSpan={4} style={tdStyle({
                      textAlign: 'center',
                      fontWeight: 'bold',
                      fontStyle: 'italic',
                      backgroundColor: '#e6fffa', // excused green-ish
                      color: '#0d9488',
                      fontSize: '9px',
                      letterSpacing: '0.5px',
                      height: '18px',
                      borderRight: '1px solid #000'
                    })}>
                      EXCUSED: {rec.remarks || 'Excused'}
                    </td>
                    <td style={tdStyle({ textAlign: 'center', borderRight: '1px solid #000', fontSize: '9px', fontWeight: 'bold', color: '#0d9488' })}>
                      8.00
                    </td>
                    <td style={tdStyle({ textAlign: 'center' })}>
                      <StatusBadge status="approved" />
                    </td>
                  </tr>
                );
              } else if (rec.override_type === 'others') {
                return (
                  <tr
                    key={day}
                    onClick={handleRowClick}
                    style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                    className={onRowClick ? 'hover:bg-blue-50/20 transition-colors' : ''}
                  >
                    {/* Date formatted as MM/DD/YYYY */}
                    <td style={tdStyle({ textAlign: 'center', fontWeight: '600', borderRight: '1px solid #000', height: '18px', fontSize: '9px' })}>
                      {`${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`}
                    </td>
                    <td colSpan={4} style={tdStyle({
                      textAlign: 'center',
                      fontWeight: 'bold',
                      fontStyle: 'italic',
                      backgroundColor: '#f3e8ff', // light purple
                      color: '#7e22ce',
                      fontSize: '9px',
                      letterSpacing: '0.5px',
                      height: '18px',
                      borderRight: '1px solid #000'
                    })}>
                      {rec.remarks ? rec.remarks.toUpperCase() : 'OTHERS'}
                    </td>
                    <td style={tdStyle({ textAlign: 'center', borderRight: '1px solid #000', fontSize: '9px', fontWeight: 'bold', color: '#7e22ce' })}>
                      {(rec.total_hours || 0).toFixed(2)}
                    </td>
                    <td style={tdStyle({ textAlign: 'center' })}>
                      <StatusBadge status="approved" />
                    </td>
                  </tr>
                );
              }
            }

            if ((isWeekend || holidayName) && !rec) {
              return (
                <tr
                  key={day}
                  onClick={handleRowClick}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  className={onRowClick ? 'hover:bg-blue-50/20 transition-colors' : ''}
                >
                  {/* Date formatted as MM/DD/YYYY */}
                  <td style={tdStyle({ textAlign: 'center', fontWeight: '600', borderRight: '1px solid #000', height: '18px', fontSize: '9px' })}>
                    {`${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`}
                  </td>
                  {/* Spanned label across all remaining columns */}
                  <td colSpan={6} style={tdStyle({
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontStyle: 'italic',
                    backgroundColor: holidayName ? '#fef3c7' : '#f3f4f6', // Light amber for holiday, light gray for weekend
                    color: holidayName ? '#b45309' : '#6b7280',
                    fontSize: '9px',
                    letterSpacing: '1px',
                    height: '18px'
                  })}>
                    {holidayName ? holidayName.toUpperCase() : dayOfWeek === 6 ? 'SATURDAY' : 'SUNDAY'}
                  </td>
                </tr>
              );
            }

            return (
              <tr
                key={day}
                onClick={handleRowClick}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                className={onRowClick ? 'hover:bg-blue-50/20 transition-colors' : ''}
              >
                {/* Date formatted as MM/DD/YYYY */}
                <td style={tdStyle({ textAlign: 'center', fontWeight: '600', borderRight: '1px solid #000', height: '18px', fontSize: '9px' })}>
                  {`${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`}
                </td>

                {/* AM Time In */}
                <td style={tdStyle({ backgroundColor: '#e8f4ff', textAlign: 'center', fontSize: '9px' })}>
                  {rec ? formatTime(rec.am_time_in) : ''}
                </td>

                {/* AM Status */}
                <td style={tdStyle({ backgroundColor: '#e8f4ff', textAlign: 'center', borderRight: '1px solid #000' })}>
                  {rec?.am_time_in ? <StatusBadge status={rec.am_status} /> : <>&nbsp;</>}
                </td>

                {/* Time Out */}
                <td style={tdStyle({ backgroundColor: '#ffe8eb', textAlign: 'center', fontSize: '9px' })}>
                  {rec ? formatTime(rec.pm_time_out || rec.am_time_out) : ''}
                </td>

                {/* Time Out Status */}
                <td style={tdStyle({ backgroundColor: '#ffe8eb', textAlign: 'center', borderRight: '1px solid #000' })}>
                  {rec?.pm_time_out
                    ? <StatusBadge status={rec.pm_status} />
                    : rec?.am_time_out
                      ? <StatusBadge status={rec.am_status} />
                      : <>&nbsp;</>}
                </td>

                {/* Total Hrs */}
                <td style={tdStyle({
                  textAlign: 'center',
                  borderRight: '1px solid #000',
                  fontSize: '9px',
                  fontWeight: rec?.is_override ? 'bold' : 'normal',
                  color: rec?.is_override ? '#2563eb' : 'inherit'
                })}>
                  {rec && rec.total_hours ? rec.total_hours.toFixed(2) : ''}
                  {rec?.is_override && <span style={{ fontSize: '7px', display: 'block', color: '#2563eb', fontWeight: 'bold' }}>Override</span>}
                </td>

                {/* Overall Status for the day */}
                <td style={tdStyle({ textAlign: 'center' })}>
                  {rec ? <StatusBadge status={rec.approval_status} /> : <>&nbsp;</>}
                  {rec?.is_override && rec.override_remarks && (
                    <span style={{ fontSize: '7px', display: 'block', color: '#4b5563' }} className="truncate max-w-16 mx-auto">
                      {rec.override_remarks}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

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
    </>
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
