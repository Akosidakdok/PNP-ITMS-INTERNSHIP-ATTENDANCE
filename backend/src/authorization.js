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

const DISABLED_ACCOUNT_STATUSES = new Set(['archived', 'inactive', 'disabled']);

function isDisabledAccount(account) {
  return DISABLED_ACCOUNT_STATUSES.has(String(account?.status || '').toLowerCase());
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

  if (!supervisor || isDisabledAccount(supervisor)) {
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

function projectMemberIds(project) {
  if (!Array.isArray(project?.members)) return new Set();
  return new Set(
    project.members
      .map(member => normalizePositiveId(
        typeof member === 'object' && member !== null ? member.id : member
      ))
      .filter(Boolean)
  );
}

export function getProjectAccessFlags(user, project, supervisorDivisionId = null) {
  const userId = normalizePositiveId(user?.id);
  const projectLeaderId = normalizePositiveId(project?.leader_id);
  const projectDivisionId = normalizePositiveId(project?.division_id);
  const role = user?.role;
  const isAdmin = role === 'admin';
  const isSupervisor = role === 'supervisor';
  const isLeader = role === 'intern' && userId !== null && projectLeaderId === userId;
  const isMember = role === 'intern' && userId !== null && projectMemberIds(project).has(userId);
  const isScopedSupervisor = isSupervisor
    && projectDivisionId !== null
    && projectDivisionId === normalizePositiveId(supervisorDivisionId);

  return {
    isAdmin,
    isSupervisor: isScopedSupervisor,
    isStaff: isAdmin || isScopedSupervisor,
    isLeader,
    isMember,
    canUpdate: isAdmin || isScopedSupervisor || isLeader || isMember,
    canDelete: isAdmin || isScopedSupervisor || isLeader,
    canUpload: isAdmin || isScopedSupervisor || isLeader || isMember,
    canManageTeam: isAdmin || isScopedSupervisor || isLeader,
  };
}

async function getCurrentInternAccount(user) {
  const internId = normalizePositiveId(user?.id);
  if (!internId || user?.role !== 'intern') {
    throw authorizationError('Intern account is not authorized');
  }

  const { data: intern, error } = await supabase
    .from('accounts')
    .select('id, role, division_id, status')
    .eq('id', internId)
    .eq('role', 'intern')
    .maybeSingle();

  if (error) {
    console.error('Current intern project authorization lookup failed:', {
      code: error.code,
      internId,
    });
    throw authorizationError('Unable to verify project access', 500);
  }
  if (!intern || isDisabledAccount(intern)) {
    throw authorizationError('Intern account is not authorized');
  }
  return intern;
}

async function getProjectAuthorizationRecord(projectId) {
  const id = normalizePositiveId(projectId);
  if (!id) throw authorizationError('Invalid project ID', 400);

  const { data: project, error } = await supabase
    .from('intern_projects')
    .select('id, leader_id, division_id, members')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Project authorization lookup failed:', { code: error.code, projectId: id });
    throw authorizationError('Unable to verify project access', 500);
  }
  if (!project) throw authorizationError('Project not found', 404);
  return project;
}

async function getVerifiedProjectAccess(user, projectId) {
  const project = await getProjectAuthorizationRecord(projectId);
  let supervisorDivisionId = null;

  if (user?.role === 'supervisor') {
    supervisorDivisionId = await getCurrentSupervisorDivisionId(user);
  } else if (user?.role === 'intern') {
    await getCurrentInternAccount(user);
  } else if (user?.role !== 'admin') {
    throw authorizationError('Project access is not permitted');
  }

  return {
    project,
    ...getProjectAccessFlags(user, project, supervisorDivisionId),
  };
}

function requireProjectPermission(access, permission, message) {
  if (!access[permission]) throw authorizationError(message);
  return access;
}

export async function authorizeProjectCreation(user, payload = {}) {
  if (user?.role === 'admin') {
    return {
      divisionId: normalizePositiveId(payload.division_id),
      leaderId: normalizePositiveId(payload.leader_id) || normalizePositiveId(user.id),
    };
  }

  if (user?.role === 'supervisor') {
    const divisionId = await getCurrentSupervisorDivisionId(user);
    const requestedDivisionId = normalizePositiveId(payload.division_id);
    if (requestedDivisionId && requestedDivisionId !== divisionId) {
      throw authorizationError('Cannot create a project outside your assigned division');
    }
    const leaderId = normalizePositiveId(payload.leader_id);
    if (!leaderId) {
      throw authorizationError('A project leader from your division is required', 400);
    }
    await assertSupervisorCanAccessIntern(user, leaderId, 'project leaders');
    return { divisionId, leaderId };
  }

  const intern = await getCurrentInternAccount(user);
  const internId = normalizePositiveId(intern.id);
  const internDivisionId = normalizePositiveId(intern.division_id);
  const requestedLeaderId = normalizePositiveId(payload.leader_id);
  const requestedDivisionId = normalizePositiveId(payload.division_id);

  if (requestedLeaderId && requestedLeaderId !== internId) {
    throw authorizationError('Interns can only create projects they lead');
  }
  if (requestedDivisionId && requestedDivisionId !== internDivisionId) {
    throw authorizationError('Cannot create a project outside your assigned division');
  }
  return { divisionId: internDivisionId, leaderId: internId };
}

export async function assertCanUpdateProject(user, projectId) {
  const access = await getVerifiedProjectAccess(user, projectId);
  return requireProjectPermission(access, 'canUpdate', 'Permission denied to update this project');
}

export async function assertCanDeleteProject(user, projectId) {
  const access = await getVerifiedProjectAccess(user, projectId);
  return requireProjectPermission(access, 'canDelete', 'Only the project leader or assigned staff can delete this project');
}

export async function assertCanUploadProjectFile(user, projectId) {
  const access = await getVerifiedProjectAccess(user, projectId);
  return requireProjectPermission(access, 'canUpload', 'Permission denied to upload files to this project');
}

export async function assertCanDeleteProjectFile(user, projectId, fileId) {
  const normalizedProjectId = normalizePositiveId(projectId);
  const normalizedFileId = normalizePositiveId(fileId);
  if (!normalizedProjectId || !normalizedFileId) {
    throw authorizationError('Invalid project file ID', 400);
  }

  const { data: file, error } = await supabase
    .from('project_files')
    .select('id, project_id, uploaded_by')
    .eq('id', normalizedFileId)
    .maybeSingle();

  if (error) {
    console.error('Project file authorization lookup failed:', {
      code: error.code,
      fileId: normalizedFileId,
    });
    throw authorizationError('Unable to verify project file access', 500);
  }
  if (!file || Number(file.project_id) !== normalizedProjectId) {
    throw authorizationError('Project file not found', 404);
  }

  const access = await getVerifiedProjectAccess(user, normalizedProjectId);
  const isUploader = user?.role === 'intern'
    && normalizePositiveId(file.uploaded_by) === normalizePositiveId(user.id);
  if (!access.isStaff && !access.isLeader && !isUploader) {
    throw authorizationError('Permission denied to delete this project file');
  }
  return { ...access, file, isUploader };
}

const PROJECT_UPDATE_FIELDS = new Set([
  'title',
  'description',
  'group_name',
  'status',
  'progress',
  'github_repo',
  'demo_url',
]);

export function sanitizeProjectUpdatePayload(payload = {}, access = {}) {
  const sanitized = Object.fromEntries(
    Object.entries(payload).filter(([key]) => PROJECT_UPDATE_FIELDS.has(key))
  );

  if (access.canManageTeam && Array.isArray(payload.members)) {
    sanitized.members = payload.members;
  }
  // Changing ownership or division can expand access. Only a full administrator
  // may perform those changes; scoped supervisors remain inside their division.
  if (access.isAdmin) {
    if (payload.division_id !== undefined) sanitized.division_id = payload.division_id;
    if (payload.leader_id !== undefined) sanitized.leader_id = payload.leader_id;
  }
  return sanitized;
}
