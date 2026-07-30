import { supabase } from './supabaseClient.js';

function authorizationError(message, statusCode = 403) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function supervisorScopeMessage(resourceName) {
  return `Cannot access ${resourceName} outside your assigned division`;
}

export async function getCurrentSupervisorDivisionId(user) {
  const supervisorId = normalizePositiveId(user?.id);
  if (!supervisorId) {
    throw authorizationError('Unable to verify supervisor division access');
  }

  const { data: supervisor, error } = await supabase
    .from('accounts')
    .select('id, role, division_id, status')
    .eq('id', supervisorId)
    .eq('role', 'supervisor')
    .maybeSingle();

  if (error) {
    console.error('Current supervisor authorization lookup failed:', {
      code: error.code,
      supervisorId,
    });
    throw authorizationError('Unable to verify supervisor division access', 500);
  }

  const disabledStatuses = new Set(['archived', 'inactive', 'disabled']);
  if (!supervisor || disabledStatuses.has(String(supervisor.status || '').toLowerCase())) {
    throw authorizationError('Supervisor account is not authorized');
  }

  const divisionId = normalizePositiveId(supervisor.division_id);
  if (!divisionId) {
    throw authorizationError('Supervisor account has no assigned division');
  }
  return divisionId;
}

/**
 * Ensures every requested intern exists and belongs to the supervisor's division.
 * Administrators and other non-supervisor roles are intentionally left unchanged.
 */
export async function assertSupervisorCanAccessInterns(user, internIds, resourceName = 'intern records') {
  if (user?.role !== 'supervisor') return;

  const suppliedIds = Array.isArray(internIds) ? internIds : [];
  const requestedIds = [...new Set(suppliedIds.map(normalizePositiveId))];
  if (!requestedIds.length || requestedIds.some(id => id === null)) {
    throw authorizationError(supervisorScopeMessage(resourceName));
  }

  const supervisorDivisionId = await getCurrentSupervisorDivisionId(user);
  const { data: interns, error } = await supabase
    .from('accounts')
    .select('id, division_id')
    .eq('role', 'intern')
    .in('id', requestedIds);

  if (error) {
    console.error('Supervisor division authorization lookup failed:', {
      code: error.code,
      requestedCount: requestedIds.length,
    });
    throw authorizationError('Unable to verify supervisor division access', 500);
  }

  const internById = new Map((interns || []).map(intern => [Number(intern.id), intern]));
  const allWithinDivision = requestedIds.every(id => {
    const intern = internById.get(id);
    return intern
      && normalizePositiveId(intern.division_id) === supervisorDivisionId;
  });

  if (!allWithinDivision) {
    throw authorizationError(supervisorScopeMessage(resourceName));
  }
}

export async function assertSupervisorCanAccessIntern(user, internId, resourceName = 'intern record') {
  return assertSupervisorCanAccessInterns(user, [internId], resourceName);
}

/**
 * Resolves an intern-owned record and then applies the supervisor division check.
 */
export async function assertSupervisorCanAccessResource(
  user,
  table,
  resourceId,
  resourceName
) {
  if (user?.role !== 'supervisor') return;

  const id = normalizePositiveId(resourceId);
  if (!id) {
    throw authorizationError(supervisorScopeMessage(resourceName));
  }

  const { data: resource, error } = await supabase
    .from(table)
    .select('intern_id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Supervisor resource authorization lookup failed:', {
      code: error.code,
      table,
      resourceId: id,
    });
    throw authorizationError('Unable to verify supervisor division access', 500);
  }

  if (!resource?.intern_id) {
    throw authorizationError(supervisorScopeMessage(resourceName));
  }

  await assertSupervisorCanAccessIntern(user, resource.intern_id, resourceName);
}
