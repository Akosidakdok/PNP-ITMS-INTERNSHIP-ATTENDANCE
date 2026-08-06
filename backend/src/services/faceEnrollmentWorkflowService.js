import { supabase } from '../supabaseClient.js';

const OPEN_REQUEST_STATUSES = ['pending', 'approved'];
const RESOLVED_REQUEST_STATUSES = ['rejected', 'completed'];
const VALID_REVIEW_ACTIONS = new Set(['approve', 'reject']);
const REQUEST_FIELDS = 'id, intern_id, intern_name, reason, status, reviewed_by, reviewer_name, review_remarks, reviewed_at, completed_at, dismissed_at, dismissed_by, dismissed_by_name, created_at, updated_at';
const HISTORY_FIELDS = 'id, intern_id, intern_name, enrollment_type, renewal_reason, request_id, enrolled_by, enrolled_by_name, enrolled_by_role, created_at';

function cleanReason(reason, label = 'Renewal reason') {
  const value = String(reason || '').trim();
  if (value.length < 10 || value.length > 500) {
    throw new Error(`${label} must be between 10 and 500 characters`);
  }
  return value;
}

function validId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Valid ${label} is required`);
  }
  return id;
}

async function getInternForStaff(internId, staffUser) {
  const { data: intern, error } = await supabase
    .from('accounts')
    .select('id, full_name, role, division_id, face_registered')
    .eq('id', validId(internId, 'intern ID'))
    .eq('role', 'intern')
    .single();

  if (error || !intern) {
    throw new Error('Intern account not found');
  }

  if (staffUser.role === 'supervisor') {
    const staffDivisionId = Number(staffUser.division_id || staffUser.department_id);
    if (!staffDivisionId || Number(intern.division_id) !== staffDivisionId) {
      const scopeError = new Error('Cannot manage face enrollment outside your assigned division');
      scopeError.statusCode = 403;
      throw scopeError;
    }
  }

  return intern;
}

async function getCurrentStaff(staffUser) {
  const { data: staff, error } = await supabase
    .from('accounts')
    .select('id, full_name, role, division_id')
    .eq('id', validId(staffUser?.id, 'staff user ID'))
    .in('role', ['admin', 'supervisor'])
    .single();

  if (error || !staff) {
    const accessError = new Error('Authorized staff account not found');
    accessError.statusCode = 403;
    throw accessError;
  }
  return staff;
}

export async function createRenewalRequest(internId, reason) {
  const id = validId(internId, 'intern ID');
  const clean = cleanReason(reason);

  const { data: intern, error: internError } = await supabase
    .from('accounts')
    .select('id, full_name, face_registered, status')
    .eq('id', id)
    .eq('role', 'intern')
    .single();

  if (internError || !intern) {
    throw new Error('Intern account not found');
  }
  if (!intern.face_registered) {
    throw new Error('Initial face enrollment must be completed by authorized staff before renewal can be requested');
  }
  if (intern.status !== 'active') {
    throw new Error('Only active intern accounts may request face renewal');
  }

  const { data: existing } = await supabase
    .from('face_renewal_requests')
    .select(REQUEST_FIELDS)
    .eq('intern_id', id)
    .in('status', OPEN_REQUEST_STATUSES)
    .maybeSingle();

  if (existing) {
    const duplicateError = new Error(
      existing.status === 'approved'
        ? 'Your renewal request is already approved and ready for face update'
        : 'You already have a pending face renewal request'
    );
    duplicateError.statusCode = 409;
    throw duplicateError;
  }

  const { data, error } = await supabase
    .from('face_renewal_requests')
    .insert({
      intern_id: id,
      intern_name: intern.full_name,
      reason: clean,
    })
    .select(REQUEST_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') {
      const duplicateError = new Error('You already have an active face renewal request');
      duplicateError.statusCode = 409;
      throw duplicateError;
    }
    throw error;
  }
  return data;
}

export async function getInternFaceWorkflow(internId) {
  const id = validId(internId, 'intern ID');
  const [{ data: requests, error: requestsError }, { data: history, error: historyError }] = await Promise.all([
    supabase
      .from('face_renewal_requests')
      .select(REQUEST_FIELDS)
      .eq('intern_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('face_enrollment_history')
      .select(HISTORY_FIELDS)
      .eq('intern_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (requestsError) throw requestsError;
  if (historyError) throw historyError;

  return {
    active_request: (requests || []).find(request => OPEN_REQUEST_STATUSES.includes(request.status)) || null,
    requests: requests || [],
    history: history || [],
  };
}

export async function getRenewalRequestsForStaff(staffUser, { status = 'all', includeDismissed = false } = {}) {
  const currentStaff = await getCurrentStaff(staffUser);
  let internQuery = supabase
    .from('accounts')
    .select('id, full_name, division_id, division_name')
    .eq('role', 'intern');

  if (currentStaff.role === 'supervisor') {
    const divisionId = Number(currentStaff.division_id);
    if (!divisionId) return [];
    internQuery = internQuery.eq('division_id', divisionId);
  }

  const { data: interns, error: internError } = await internQuery;
  if (internError) throw internError;
  if (!interns?.length) return [];

  let requestQuery = supabase
    .from('face_renewal_requests')
    .select(REQUEST_FIELDS)
    .in('intern_id', interns.map(intern => intern.id))
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
      throw new Error('Invalid renewal request status');
    }
    requestQuery = requestQuery.eq('status', status);
  }
  if (!includeDismissed) {
    requestQuery = requestQuery.is('dismissed_at', null);
  }

  const { data: requests, error: requestError } = await requestQuery;
  if (requestError) throw requestError;
  const internById = new Map(interns.map(intern => [Number(intern.id), intern]));

  return (requests || []).map(request => ({
    ...request,
    intern: internById.get(Number(request.intern_id)) || null,
  }));
}

export async function setRenewalRequestDismissed(requestId, dismissed, staffUser) {
  const currentStaff = await getCurrentStaff(staffUser);
  const id = validId(requestId, 'request ID');
  const { data: request, error: requestError } = await supabase
    .from('face_renewal_requests')
    .select(REQUEST_FIELDS)
    .eq('id', id)
    .single();

  if (requestError || !request || !request.intern_id) {
    throw new Error('Renewal request not found');
  }
  if (!RESOLVED_REQUEST_STATUSES.includes(request.status)) {
    const stateError = new Error('Only rejected or completed requests can be cleared');
    stateError.statusCode = 409;
    throw stateError;
  }

  await getInternForStaff(request.intern_id, currentStaff);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('face_renewal_requests')
    .update({
      dismissed_at: dismissed ? now : null,
      dismissed_by: dismissed ? currentStaff.id : null,
      dismissed_by_name: dismissed ? currentStaff.full_name : null,
      updated_at: now,
    })
    .eq('id', id)
    .in('status', RESOLVED_REQUEST_STATUSES)
    .select(REQUEST_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function dismissResolvedRenewalRequests(staffUser) {
  const currentStaff = await getCurrentStaff(staffUser);
  let internQuery = supabase
    .from('accounts')
    .select('id')
    .eq('role', 'intern');

  if (currentStaff.role === 'supervisor') {
    const divisionId = Number(currentStaff.division_id);
    if (!divisionId) return 0;
    internQuery = internQuery.eq('division_id', divisionId);
  }

  const { data: interns, error: internError } = await internQuery;
  if (internError) throw internError;
  const internIds = (interns || []).map(intern => intern.id);
  if (!internIds.length) return 0;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('face_renewal_requests')
    .update({
      dismissed_at: now,
      dismissed_by: currentStaff.id,
      dismissed_by_name: currentStaff.full_name,
      updated_at: now,
    })
    .in('intern_id', internIds)
    .in('status', RESOLVED_REQUEST_STATUSES)
    .is('dismissed_at', null)
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

export async function reviewRenewalRequest(requestId, action, remarks, staffUser) {
  const currentStaff = await getCurrentStaff(staffUser);
  const id = validId(requestId, 'request ID');
  if (!VALID_REVIEW_ACTIONS.has(action)) {
    throw new Error('Review action must be approve or reject');
  }

  const cleanRemarks = String(remarks || '').trim();
  if (action === 'reject' && cleanRemarks.length < 3) {
    throw new Error('A rejection explanation is required');
  }
  if (cleanRemarks.length > 500) {
    throw new Error('Review remarks must be 500 characters or fewer');
  }

  const { data: request, error: requestError } = await supabase
    .from('face_renewal_requests')
    .select(REQUEST_FIELDS)
    .eq('id', id)
    .single();

  if (requestError || !request || !request.intern_id) {
    throw new Error('Renewal request not found');
  }
  if (request.status !== 'pending') {
    const stateError = new Error('Only pending renewal requests can be reviewed');
    stateError.statusCode = 409;
    throw stateError;
  }

  await getInternForStaff(request.intern_id, currentStaff);

  const now = new Date().toISOString();
  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  const { data, error } = await supabase
    .from('face_renewal_requests')
    .update({
      status: nextStatus,
      reviewed_by: currentStaff.id,
      reviewer_name: currentStaff.full_name,
      review_remarks: cleanRemarks || null,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select(REQUEST_FIELDS)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      const stateError = new Error('This request was already reviewed');
      stateError.statusCode = 409;
      throw stateError;
    }
    throw error;
  }

  const notification = action === 'approve'
    ? {
        title: 'Face renewal approved',
        message: 'Your request was approved. Open My Profile to update your Face ID.',
      }
    : {
        title: 'Face renewal request rejected',
        message: cleanRemarks || 'Your Face ID renewal request was not approved.',
      };

  const { error: notificationError } = await supabase.from('notifications').insert({
    user_id: request.intern_id,
    ...notification,
  });
  if (notificationError) {
    console.error('Could not create face renewal notification:', notificationError.message);
  }

  return data;
}

export async function getEnrollmentHistoryForStaff(staffUser, internId = null) {
  const currentStaff = await getCurrentStaff(staffUser);
  let allowedInternIds;
  if (currentStaff.role === 'supervisor') {
    const divisionId = Number(currentStaff.division_id);
    if (!divisionId) return [];
    const { data: interns, error } = await supabase
      .from('accounts')
      .select('id')
      .eq('role', 'intern')
      .eq('division_id', divisionId);
    if (error) throw error;
    allowedInternIds = (interns || []).map(intern => intern.id);
    if (!allowedInternIds.length) return [];
  }

  let query = supabase
    .from('face_enrollment_history')
    .select(HISTORY_FIELDS)
    .order('created_at', { ascending: false })
    .limit(100);

  if (internId) {
    const id = validId(internId, 'intern ID');
    if (allowedInternIds && !allowedInternIds.map(Number).includes(id)) {
      const scopeError = new Error('Cannot view enrollment history outside your assigned division');
      scopeError.statusCode = 403;
      throw scopeError;
    }
    query = query.eq('intern_id', id);
  } else if (allowedInternIds) {
    query = query.in('intern_id', allowedInternIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export { cleanReason as validateEnrollmentReason };
