import { format, parseISO } from 'date-fns';

export default function DTRTable({ records, intern, month, year }) {
  const totalApproved = records.filter(r => r.approval_status === 'approved').reduce((s, r) => s + (r.total_hours || 0), 0);

  return (
    <div className="dtr-print-container">
      {/* DTR Header */}
      <div className="text-center mb-4 border-b-2 border-blue-800 pb-4">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Republic of the Philippines</p>
        <p className="text-xs text-gray-500 mb-1">Philippine National Police</p>
        <h2 className="text-lg font-bold text-blue-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Information Technology Management Service
        </h2>
        <h3 className="text-base font-bold text-blue-800 mt-1">DAILY TIME RECORD</h3>
        <p className="text-xs text-gray-500 mt-1">
          {month && year ? `For the month of ${format(new Date(year, month - 1), 'MMMM yyyy')}` : 'All Records'}
        </p>
      </div>

      {/* Intern Info */}
      {intern && (
        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="font-semibold text-gray-600">Name: </span>
            <span className="uppercase font-bold text-gray-800">{intern.full_name}</span>
          </div>
          <div>
            <span className="font-semibold text-gray-600">School: </span>
            <span>{intern.school}</span>
          </div>
          <div>
            <span className="font-semibold text-gray-600">Department: </span>
            <span>{intern.department_name || '—'}</span>
          </div>
          <div>
            <span className="font-semibold text-gray-600">Required Hours: </span>
            <span>{intern.required_hours} hrs</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="data-table border border-gray-200 text-xs">
          <thead>
            <tr>
              <th className="border border-gray-200 text-center">Date</th>
              <th className="border border-gray-200 text-center">Day</th>
              <th className="border border-gray-200 text-center">Time In</th>
              <th className="border border-gray-200 text-center">Time Out</th>
              <th className="border border-gray-200 text-center">Total Hours</th>
              <th className="border border-gray-200 text-center">Status</th>
              <th className="border border-gray-200 text-center">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-gray-400 py-6">No DTR records for this period</td>
              </tr>
            ) : (
              records.map(r => {
                const date = parseISO(r.date);
                return (
                  <tr key={r.id} className={r.approval_status === 'rejected' ? 'bg-red-50' : ''}>
                    <td className="border border-gray-200 text-center font-medium">{format(date, 'MM/dd/yyyy')}</td>
                    <td className="border border-gray-200 text-center">{format(date, 'EEE')}</td>
                    <td className="border border-gray-200 text-center">{r.time_in ? format(new Date(`2000-01-01T${r.time_in}`), 'hh:mm a') : '—'}</td>
                    <td className="border border-gray-200 text-center">{r.time_out ? format(new Date(`2000-01-01T${r.time_out}`), 'hh:mm a') : '—'}</td>
                    <td className="border border-gray-200 text-center font-semibold">{r.total_hours ? `${r.total_hours.toFixed(2)}h` : '—'}</td>
                    <td className="border border-gray-200 text-center">
                      <span className={`badge badge-${r.approval_status}`}>{r.approval_status}</span>
                    </td>
                    <td className="border border-gray-200">{r.remarks || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50">
              <td colSpan={4} className="border border-gray-200 text-right font-bold text-blue-800 pr-3">
                Total Approved Hours:
              </td>
              <td className="border border-gray-200 text-center font-bold text-blue-800">
                {totalApproved.toFixed(2)}h
              </td>
              <td colSpan={2} className="border border-gray-200" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Signature Block */}
      <div className="grid grid-cols-2 gap-8 mt-8 text-sm">
        <div className="text-center">
          <div className="border-b border-gray-400 mt-8 mb-1" />
          <p className="font-semibold text-gray-700">Intern Signature</p>
          <p className="text-xs text-gray-500">Date: ________________</p>
        </div>
        <div className="text-center">
          <div className="border-b border-gray-400 mt-8 mb-1" />
          <p className="font-semibold text-gray-700">Supervisor / Administrator</p>
          <p className="text-xs text-gray-500">PNP-ITMS</p>
        </div>
      </div>
    </div>
  );
}
