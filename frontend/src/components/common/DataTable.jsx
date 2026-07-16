import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';

export default function DataTable({
  columns,
  data,
  loading,
  total,
  page,
  limit,
  onPageChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No records found',
  actions,
}) {
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Controls */}
      {(onSearchChange || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {onSearchChange && (
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                className="form-input text-sm"
                style={{ paddingLeft: '2.25rem' }}
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={e => onSearchChange(e.target.value)}
              />
            </div>
          )}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col.key} style={{ width: col.width }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {columns.map(col => (
                      <td key={col.key}>
                        <div className="skeleton h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <Search className="w-5 h-5 text-gray-300" />
                      </div>
                      <p className="text-sm">{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                  <tr key={row.id || i} className="animate-fade-in">
                    {columns.map(col => (
                      <td key={col.key}>
                        {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-sm">
            <p className="text-gray-500">
              Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onPageChange(1)} disabled={page === 1}>
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onPageChange(page - 1)} disabled={page === 1}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 rounded-lg bg-pnp-50 text-pnp-700 font-medium">
                {page} / {totalPages}
              </span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>
                <ChevronRight className="w-4 h-4" />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onPageChange(totalPages)} disabled={page === totalPages}>
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
