import api from './api.js';

const INTERN_PAGE_SIZE = 100;

/**
 * Loads the complete intern set for selectors and batch workflows, excluding
 * archived records by default unless includeArchived is requested.
 * The general interns endpoint remains paginated for the management table;
 * selector screens should not silently stop at the first page.
 */
export async function fetchAllInterns(params = {}) {
  const { includeArchived = false, ...queryParams } = params;
  const interns = [];
  let page = 1;
  let total = Infinity;

  while (interns.length < total) {
    const response = await api.get('/interns', {
      params: {
        ...queryParams,
        ...(includeArchived ? { status: 'all' } : {}),
        page,
        limit: INTERN_PAGE_SIZE,
      },
    });
    const pageInterns = response.data?.interns || [];
    total = Number.isFinite(Number(response.data?.total))
      ? Number(response.data.total)
      : interns.length + pageInterns.length;
    interns.push(...pageInterns);

    if (pageInterns.length === 0 || pageInterns.length < INTERN_PAGE_SIZE) break;
    page += 1;
  }

  return interns;
}
