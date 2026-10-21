import { supabase } from '../supabaseClient.js';
import { getVerifiedProjectAccess } from '../authorization.js';
import {
  getWeeklyTimelinePermissions,
  normalizeWeeklyTimelineReport,
} from '../utils/projectWeeklyTimeline.js';

function timelineError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function authorize(user, projectId, action) {
  const access = await getVerifiedProjectAccess(user, projectId);
  const permissions = getWeeklyTimelinePermissions(access);
  const permission = action === 'edit' ? permissions.canEdit
    : action === 'export' ? permissions.canExport
      : permissions.canRead;
  if (!permission) {
    throw timelineError(
      action === 'edit' ? 'Only assigned project interns can update the weekly timeline'
        : action === 'export' ? 'Only admins can export the weekly timeline'
          : 'You do not have access to this project weekly timeline',
      403
    );
  }
  return access;
}

async function loadReport(projectId) {
  const { data, error } = await supabase
    .from('project_weekly_timeline_reports')
    .select('project_id, start_date, end_date, weeks, revision, updated_by, created_at, updated_at')
    .eq('project_id', Number(projectId))
    .maybeSingle();
  if (error) throw timelineError(`Could not load weekly timeline: ${error.message}`, 500);
  return data || null;
}

export async function getProjectWeeklyTimeline(projectId, user, { forExport = false } = {}) {
  const access = await authorize(user, projectId, forExport ? 'export' : 'read');
  const report = await loadReport(projectId);
  if (!report) return null;
  return {
    ...report,
    project: {
      id: access.project.id,
      title: access.project.title,
    },
    permissions: getWeeklyTimelinePermissions(access),
  };
}

export async function saveProjectWeeklyTimeline(projectId, user, input) {
  const access = await authorize(user, projectId, 'edit');
  const report = normalizeWeeklyTimelineReport(input);
  const expectedRevision = Number(input?.expected_revision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw timelineError('Weekly timeline revision is required. Reload the report and try again.', 400);
  }

  const table = supabase.from('project_weekly_timeline_reports');
  const values = {
    ...report,
    updated_by: access.account.id,
    updated_at: new Date().toISOString(),
  };
  let result;
  if (expectedRevision === 0) {
    result = await table
      .insert({ project_id: Number(projectId), ...values, revision: 1 })
      .select('project_id, start_date, end_date, weeks, revision, updated_by, created_at, updated_at')
      .single();
    if (result.error?.code === '23505') {
      throw timelineError('Another intern saved this report first. Reload it before saving again.', 409);
    }
  } else {
    result = await table
      .update({ ...values, revision: expectedRevision + 1 })
      .eq('project_id', Number(projectId))
      .eq('revision', expectedRevision)
      .select('project_id, start_date, end_date, weeks, revision, updated_by, created_at, updated_at')
      .maybeSingle();
    if (!result.error && !result.data) {
      throw timelineError('Another intern updated this report. Reload it before saving again.', 409);
    }
  }
  const { data, error } = result;
  if (error) throw timelineError(`Could not save weekly timeline: ${error.message}`, 500);
  return {
    ...data,
    project: { id: access.project.id, title: access.project.title },
    permissions: getWeeklyTimelinePermissions(access),
  };
}
