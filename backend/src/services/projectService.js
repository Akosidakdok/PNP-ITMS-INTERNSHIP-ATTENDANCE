import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../supabaseClient.js';
import {
  getCurrentAuthorizedAccount,
  getProjectAccessFlags,
  serializeProjectPermissions,
} from '../authorization.js';

const STORAGE_BUCKET = 'documents';
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const DISABLED_STATUSES = new Set(['inactive', 'disabled', 'archived']);
const PROJECT_STATUSES = new Set(['planning', 'in_progress', 'review', 'completed', 'on_hold']);

function projectError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function positiveId(value, label = 'ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw projectError(`Invalid ${label}`, 400);
  return id;
}

function cleanText(value, { required = false, max = 5000, label = 'Value' } = {}) {
  const clean = String(value || '').trim();
  if (required && !clean) throw projectError(`${label} is required`);
  if (clean.length > max) throw projectError(`${label} is too long`);
  return clean;
}

function memberAccountIds(members = []) {
  return [...new Set((Array.isArray(members) ? members : [])
    .map(member => Number(typeof member === 'object' && member !== null ? member.id : member))
    .filter(id => Number.isInteger(id) && id > 0))];
}

function externalContributors(members = []) {
  const seen = new Set();
  return (Array.isArray(members) ? members : [])
    .filter(member => {
      const id = Number(typeof member === 'object' && member !== null ? member.id : member);
      return !Number.isInteger(id) || id <= 0;
    })
    .map(member => cleanText(
      typeof member === 'object' && member !== null
        ? member.full_name || member.name
        : member,
      { max: 200, label: 'Contributor name' }
    ))
    .filter(name => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function getMembershipProjectIds(accountId) {
  const { data, error } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('account_id', accountId)
    .is('removed_at', null);
  if (error) throw projectError(`Could not load project membership: ${error.message}`, 500);
  return [...new Set((data || []).map(row => Number(row.project_id)).filter(Boolean))];
}

async function buildScopedProjectQuery(user, filters = {}, fields = '*') {
  const account = await getCurrentAuthorizedAccount(user);
  let query = supabase.from('intern_projects').select(fields);

  if (account.role === 'supervisor') {
    if (!account.division_id) throw projectError('Supervisor account has no assigned division', 403);
    query = query.eq('division_id', account.division_id);
  } else if (account.role === 'intern') {
    const memberProjectIds = await getMembershipProjectIds(account.id);
    query = memberProjectIds.length
      ? query.or(`leader_id.eq.${account.id},id.in.(${memberProjectIds.join(',')})`)
      : query.eq('leader_id', account.id);
  } else if (filters.division_id) {
    query = query.eq('division_id', positiveId(filters.division_id, 'division ID'));
  }

  const includeArchived = filters.include_archived === true || filters.include_archived === 'true';
  if (!includeArchived || account.role === 'intern') query = query.is('archived_at', null);
  if (filters.project_id) query = query.eq('id', positiveId(filters.project_id, 'project ID'));
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.group_name) query = query.ilike('group_name', `%${filters.group_name}%`);
  if (filters.search) {
    const search = String(filters.search).replace(/[(),]/g, ' ').trim();
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,group_name.ilike.%${search}%`);
    }
  }
  return { account, query };
}

async function loadProjectTeam(projectIds) {
  if (!projectIds.length) return { membersByProject: {}, memberIdsByProject: {} };
  const [{ data: rows, error }, { data: contributors, error: contributorError }] = await Promise.all([
    supabase
      .from('project_members')
      .select('project_id, account_id, project_role, joined_at')
      .in('project_id', projectIds)
      .is('removed_at', null),
    supabase
      .from('project_contributors')
      .select('id, project_id, display_name, created_at')
      .in('project_id', projectIds),
  ]);
  if (error) throw projectError(`Could not load project members: ${error.message}`, 500);
  if (contributorError) throw projectError(`Could not load project contributors: ${contributorError.message}`, 500);

  const accountIds = [...new Set((rows || []).map(row => row.account_id).filter(Boolean))];
  let accounts = [];
  if (accountIds.length) {
    const result = await supabase
      .from('accounts')
      .select('id, full_name, division_id, division_name, status')
      .in('id', accountIds);
    if (result.error) throw projectError(`Could not load project member accounts: ${result.error.message}`, 500);
    accounts = result.data || [];
  }
  const accountById = new Map(accounts.map(account => [Number(account.id), account]));
  const membersByProject = {};
  const memberIdsByProject = {};
  for (const row of rows || []) {
    const account = accountById.get(Number(row.account_id));
    if (!account) continue;
    const projectId = Number(row.project_id);
    if (!membersByProject[projectId]) membersByProject[projectId] = [];
    if (!memberIdsByProject[projectId]) memberIdsByProject[projectId] = [];
    membersByProject[projectId].push({
      id: account.id,
      full_name: account.full_name,
      division_id: account.division_id,
      division_name: account.division_name,
      project_role: row.project_role,
      joined_at: row.joined_at,
    });
    memberIdsByProject[projectId].push(account.id);
  }
  for (const contributor of contributors || []) {
    const projectId = Number(contributor.project_id);
    if (!membersByProject[projectId]) membersByProject[projectId] = [];
    membersByProject[projectId].push({
      id: `contributor_${contributor.id}`,
      full_name: contributor.display_name,
      project_role: 'contributor',
      is_external: true,
    });
  }
  return { membersByProject, memberIdsByProject };
}

async function createSignedFileUrl(path) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.warn('Could not create signed project file URL:', error.message);
    return '';
  }
  return data?.signedUrl || '';
}

async function loadProjectFiles(projectIds, accessByProject, viewer) {
  if (!projectIds.length) return {};
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .in('project_id', projectIds)
    .order('upload_date', { ascending: false });
  if (error) throw projectError(`Could not load project files: ${error.message}`, 500);

  const filesWithUrls = await Promise.all((data || []).map(async file => {
    const access = accessByProject.get(Number(file.project_id)) || {};
    const isUploader = Number(file.uploaded_by) === Number(viewer.id);
    return {
      ...file,
      public_url: await createSignedFileUrl(file.file_path),
      url_expires_in: SIGNED_URL_TTL_SECONDS,
      permissions: {
        can_delete: Boolean(access.isStaff || access.isLeader || isUploader),
      },
    };
  }));
  return filesWithUrls.reduce((result, file) => {
    if (!result[file.project_id]) result[file.project_id] = [];
    result[file.project_id].push(file);
    return result;
  }, {});
}

async function enrichProjects(projects, account) {
  if (!projects.length) return [];
  const ids = projects.map(project => Number(project.id));
  const { membersByProject, memberIdsByProject } = await loadProjectTeam(ids);
  const leaderIds = [...new Set(projects.map(project => project.leader_id).filter(Boolean))];
  let leaders = [];
  if (leaderIds.length) {
    const result = await supabase
      .from('accounts')
      .select('id, full_name, division_id, division_name')
      .in('id', leaderIds);
    if (result.error) throw projectError(`Could not load project leaders: ${result.error.message}`, 500);
    leaders = result.data || [];
  }
  const leaderById = new Map(leaders.map(leader => [Number(leader.id), leader]));
  const accessByProject = new Map();
  for (const project of projects) {
    const accessProject = {
      ...project,
      member_ids: memberIdsByProject[Number(project.id)] || [],
    };
    accessByProject.set(
      Number(project.id),
      getProjectAccessFlags(account, accessProject, account.division_id)
    );
  }
  const filesByProject = await loadProjectFiles(ids, accessByProject, account);
  return projects.map(project => {
    const id = Number(project.id);
    const leader = leaderById.get(Number(project.leader_id));
    const access = accessByProject.get(id);
    return {
      ...project,
      members: membersByProject[id] || [],
      leader_name: leader?.full_name || 'Unassigned',
      leader_division: leader?.division_name || '',
      files: filesByProject[id] || [],
      permissions: serializeProjectPermissions(access),
    };
  });
}

export async function getProjects(filters = {}, user) {
  const { account, query } = await buildScopedProjectQuery(user, filters);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw projectError(`Could not query projects: ${error.message}`, 500);
  return enrichProjects(data || [], account);
}

export async function getProjectById(id, user, { includeArchived = true } = {}) {
  const projectId = positiveId(id, 'project ID');
  const projects = await getProjects({
    project_id: projectId,
    include_archived: includeArchived,
  }, user);
  const project = projects[0];
  if (!project) throw projectError('Project not found', 404);
  return project;
}

export async function getProjectDirectoryStats(filters = {}, user) {
  const { account, query } = await buildScopedProjectQuery(user, filters, 'id, status, progress, group_name');
  const { data, error } = await query;
  if (error) throw projectError(`Could not load project statistics: ${error.message}`, 500);
  const projects = data || [];
  const ids = projects.map(project => project.id);
  let totalFiles = 0;
  if (ids.length) {
    const result = await supabase
      .from('project_files')
      .select('id', { count: 'exact', head: true })
      .in('project_id', ids);
    if (result.error) throw projectError(`Could not count project files: ${result.error.message}`, 500);
    totalFiles = result.count || 0;
  }
  return {
    scope: account.role === 'admin' ? 'organization' : account.role === 'supervisor' ? 'division' : 'assigned',
    total_projects: projects.length,
    completed_projects: projects.filter(project => project.status === 'completed' || project.progress === 100).length,
    in_progress_projects: projects.filter(project => project.status === 'in_progress').length,
    review_projects: projects.filter(project => project.status === 'review').length,
    total_files: totalFiles,
    total_groups: new Set(projects.map(project => project.group_name).filter(Boolean)).size,
  };
}

export async function getProjectMemberList(user, requestedDivisionId = null) {
  const account = await getCurrentAuthorizedAccount(user);
  let divisionId = null;
  if (account.role === 'admin') {
    divisionId = requestedDivisionId ? positiveId(requestedDivisionId, 'division ID') : null;
  } else {
    divisionId = positiveId(account.division_id, 'assigned division ID');
  }
  let query = supabase
    .from('accounts')
    .select('id, full_name, division_name, division_id, role, status')
    .eq('role', 'intern')
    .order('full_name', { ascending: true });
  if (divisionId) query = query.eq('division_id', divisionId);
  const { data, error } = await query;
  if (error) throw projectError(`Could not load project member list: ${error.message}`, 500);
  return (data || []).filter(member => !DISABLED_STATUSES.has(String(member.status || '').toLowerCase()));
}

async function validateTeam(projectDivisionId, leaderId, members) {
  const ids = [...new Set([positiveId(leaderId, 'leader ID'), ...memberAccountIds(members)])];
  const { data, error } = await supabase
    .from('accounts')
    .select('id, full_name, division_id, division_name, role, status')
    .in('id', ids);
  if (error) throw projectError(`Could not validate project team: ${error.message}`, 500);
  const accounts = data || [];
  if (accounts.length !== ids.length) throw projectError('Every project member must be a valid intern account');
  const invalid = accounts.find(account => account.role !== 'intern'
    || DISABLED_STATUSES.has(String(account.status || '').toLowerCase())
    || Number(account.division_id) !== Number(projectDivisionId));
  if (invalid) throw projectError('Project leaders and members must be active interns in the project division');
  return accounts;
}

async function syncProjectTeam(project, members, actorId) {
  const accounts = await validateTeam(project.division_id, project.leader_id, members);
  const external = externalContributors(members);
  const now = new Date().toISOString();
  const rows = accounts.map(account => ({
    project_id: project.id,
    account_id: account.id,
    project_role: Number(account.id) === Number(project.leader_id) ? 'leader' : 'member',
    added_by: actorId,
    joined_at: now,
    removed_at: null,
  }));

  const deleteMembers = await supabase.from('project_members').delete().eq('project_id', project.id);
  if (deleteMembers.error) throw projectError(`Could not update project members: ${deleteMembers.error.message}`, 500);
  if (rows.length) {
    const insertMembers = await supabase.from('project_members').insert(rows);
    if (insertMembers.error) throw projectError(`Could not save project members: ${insertMembers.error.message}`, 500);
  }
  const deleteContributors = await supabase.from('project_contributors').delete().eq('project_id', project.id);
  if (deleteContributors.error) throw projectError(`Could not update project contributors: ${deleteContributors.error.message}`, 500);
  if (external.length) {
    const insertContributors = await supabase.from('project_contributors').insert(
      external.map(displayName => ({ project_id: project.id, display_name: displayName, added_by: actorId }))
    );
    if (insertContributors.error) throw projectError(`Could not save project contributors: ${insertContributors.error.message}`, 500);
  }
  const legacyMembers = [
    ...accounts.map(account => ({
      id: account.id,
      full_name: account.full_name,
      division_id: account.division_id,
      division_name: account.division_name,
    })),
    ...external.map((name, index) => ({ id: `contributor_${index}`, full_name: name, is_external: true })),
  ];
  const legacyUpdate = await supabase
    .from('intern_projects')
    .update({ members: legacyMembers })
    .eq('id', project.id);
  if (legacyUpdate.error) throw projectError(`Could not synchronize project team: ${legacyUpdate.error.message}`, 500);
  return legacyMembers;
}

async function recordAudit(projectId, actor, action, changes = {}) {
  const { error } = await supabase.from('project_audit_log').insert({
    project_id: projectId,
    actor_id: actor.id,
    actor_name: actor.full_name,
    actor_role: actor.role,
    action,
    changes,
  });
  if (error) console.error('Could not write project audit event:', error.message);
}

function normalizeProjectPayload(payload = {}) {
  const status = payload.status || 'in_progress';
  if (!PROJECT_STATUSES.has(status)) throw projectError('Invalid project status');
  return {
    title: cleanText(payload.title, { required: true, max: 300, label: 'Project title' }),
    description: cleanText(payload.description, { max: 5000, label: 'Project description' }),
    group_name: cleanText(payload.group_name, { required: true, max: 300, label: 'Group name' }),
    status,
    progress: Math.min(100, Math.max(0, Number(payload.progress || 0))),
    github_repo: cleanText(payload.github_repo, { max: 1000, label: 'Repository URL' }) || null,
    demo_url: cleanText(payload.demo_url, { max: 1000, label: 'Demo URL' }) || null,
  };
}

export async function createProject(payload, creation) {
  const projectFields = normalizeProjectPayload(payload);
  if (!creation.divisionId) throw projectError('A project division is required');
  await validateTeam(creation.divisionId, creation.leaderId, payload.members);
  const now = new Date().toISOString();
  const { data: project, error } = await supabase
    .from('intern_projects')
    .insert({
      ...projectFields,
      division_id: creation.divisionId,
      leader_id: creation.leaderId,
      members: [],
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw projectError(error.message, 400);
  try {
    await syncProjectTeam(project, payload.members || [], creation.account.id);
  } catch (syncError) {
    await supabase.from('intern_projects').delete().eq('id', project.id);
    throw syncError;
  }
  await recordAudit(project.id, creation.account, 'created', { title: project.title });
  return getProjectById(project.id, creation.account);
}

export async function updateProject(projectId, payload, access) {
  const id = positiveId(projectId, 'project ID');
  const before = access.project;
  const updates = { ...payload, updated_at: new Date().toISOString() };
  if (updates.title !== undefined) updates.title = cleanText(updates.title, { required: true, max: 300, label: 'Project title' });
  if (updates.group_name !== undefined) updates.group_name = cleanText(updates.group_name, { required: true, max: 300, label: 'Group name' });
  if (updates.description !== undefined) updates.description = cleanText(updates.description, { max: 5000, label: 'Project description' });
  if (updates.status !== undefined && !PROJECT_STATUSES.has(updates.status)) throw projectError('Invalid project status');
  if (updates.progress !== undefined) updates.progress = Math.min(100, Math.max(0, Number(updates.progress)));
  if (updates.division_id !== undefined) updates.division_id = positiveId(updates.division_id, 'division ID');
  if (updates.leader_id !== undefined) updates.leader_id = positiveId(updates.leader_id, 'leader ID');
  const requestedMembers = updates.members;
  delete updates.members;

  const nextProject = { ...before, ...updates };
  if (updates.division_id !== undefined || updates.leader_id !== undefined || requestedMembers) {
    const members = requestedMembers || (await getProjectById(id, access.account)).members;
    await validateTeam(nextProject.division_id, nextProject.leader_id, members);
  }
  const { data: project, error } = await supabase
    .from('intern_projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw projectError(error.message, 400);
  if (requestedMembers || updates.division_id !== undefined || updates.leader_id !== undefined) {
    const members = requestedMembers || (await getProjectById(id, access.account)).members;
    await syncProjectTeam(project, members, access.account.id);
  }
  await recordAudit(id, access.account, 'updated', { before, updates });
  return getProjectById(id, access.account);
}

export async function setProjectArchived(projectId, archived, access, reason = '') {
  const id = positiveId(projectId, 'project ID');
  const now = new Date().toISOString();
  const updates = archived
    ? { archived_at: now, archived_by: access.account.id, archive_reason: cleanText(reason, { max: 500, label: 'Archive reason' }), updated_at: now }
    : { archived_at: null, archived_by: null, archive_reason: null, updated_at: now };
  const { data, error } = await supabase.from('intern_projects').update(updates).eq('id', id).select().single();
  if (error) throw projectError(error.message, 400);
  await recordAudit(id, access.account, archived ? 'archived' : 'restored', updates);
  return data;
}

export async function deleteProject(projectId, access) {
  const id = positiveId(projectId, 'project ID');
  await recordAudit(id, access.account, 'deleted', { title: access.project.title || null });
  const { data: files, error: fileError } = await supabase
    .from('project_files')
    .select('file_path')
    .eq('project_id', id);
  if (fileError) throw projectError(fileError.message, 500);
  if (files?.length) await supabase.storage.from(STORAGE_BUCKET).remove(files.map(file => file.file_path));
  const { error } = await supabase.from('intern_projects').delete().eq('id', id);
  if (error) throw projectError(error.message, 400);
  return { success: true };
}

export async function uploadProjectFile({ projectId, userId, uploaderName, file, fileCategory, access }) {
  if (!file) throw projectError('File upload is required');
  const id = positiveId(projectId, 'project ID');
  const extension = String(file.originalname || '').split('.').pop();
  const fileName = `${uuidv4()}.${extension}`;
  const filePath = `project-files/${id}/${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (uploadError) throw projectError(`Failed to upload file: ${uploadError.message}`, 500);
  const { data, error } = await supabase.from('project_files').insert({
    project_id: id,
    uploaded_by: userId,
    uploader_name: uploaderName || 'User',
    file_category: fileCategory || 'documentation',
    original_name: file.originalname,
    file_name: fileName,
    file_type: file.mimetype,
    file_size: file.size,
    file_path: filePath,
    upload_date: new Date().toISOString(),
  }).select().single();
  if (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
    throw projectError(error.message, 400);
  }
  await recordAudit(id, access.account, 'file_uploaded', { file_id: data.id, original_name: data.original_name });
  return { ...data, public_url: await createSignedFileUrl(filePath), url_expires_in: SIGNED_URL_TTL_SECONDS };
}

export async function deleteProjectFile(fileId, access) {
  const id = positiveId(fileId, 'file ID');
  const { data: file, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !file) throw projectError('Project file not found', 404);
  await supabase.storage.from(STORAGE_BUCKET).remove([file.file_path]);
  const deletion = await supabase.from('project_files').delete().eq('id', id);
  if (deletion.error) throw projectError(deletion.error.message, 400);
  await recordAudit(file.project_id, access.account, 'file_deleted', { file_id: id, original_name: file.original_name });
  return { success: true };
}

export async function getProjectAudit(projectId, access) {
  if (!access.canViewAudit) throw projectError('Permission denied to view project history', 403);
  const { data, error } = await supabase
    .from('project_audit_log')
    .select('*')
    .eq('project_id', positiveId(projectId, 'project ID'))
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw projectError(error.message, 500);
  return data || [];
}
