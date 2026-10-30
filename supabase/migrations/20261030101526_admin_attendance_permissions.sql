-- Admin and Superadmin share attendance control and audited DTR corrections.
-- Original QR evidence, transactional updates, and service-only execution are retained.
BEGIN;

CREATE OR REPLACE FUNCTION public.protect_controlled_scan() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  policy record;
  evidence public.attendance_scan_audit;
  date_range text[];
  scan_date date;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT * INTO evidence FROM public.attendance_scan_audit
      WHERE attendance_log_id = OLD.id ORDER BY id LIMIT 1;
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- Only the service-role RPC can authorize one specific attendance deletion.
    IF current_user = 'service_role'
      AND current_setting('app.authorized_attendance_delete', true) = OLD.id::text
      AND EXISTS (SELECT 1 FROM public.attendance_scan_audit
        WHERE id::text = current_setting('app.attendance_delete_audit', true)
          AND attendance_log_id = OLD.id AND event_type = 'attendance_deleted') THEN
      RETURN OLD;
    END IF;
    IF OLD.superadmin_controlled OR evidence.id IS NOT NULL THEN
      RAISE EXCEPTION 'Actual QR scan is protected and cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Authorization is derived from the saved assignment, never client flags.
    NEW.superadmin_controlled := false;
    NEW.dtr_time := NULL;
    NEW.time_adjusted := false;
    NEW.adjustment_mode := NULL;
    NEW.adjustment_reason := NULL;
    NEW.adjustment_approved_by := NULL;
    NEW.attendance_policy_snapshot := NULL;
    IF NEW.actual_scan_time IS NULL THEN RETURN NEW; END IF;

    SELECT p.*, a.assigned_by, a.assigned_at, account.full_name AS account_name
      INTO policy
      FROM public.account_attendance_profiles a
      JOIN public.attendance_profiles p ON p.id = a.attendance_profile_id
      JOIN public.accounts approver ON approver.id = a.assigned_by AND approver.role IN ('admin', 'superadmin')
      JOIN public.accounts account ON account.id = a.account_id AND account.role = 'intern'
      WHERE a.account_id = NEW.intern_id AND p.id = NEW.attendance_profile_id AND p.status = 'active';
    IF NOT FOUND THEN RETURN NEW; END IF;

    scan_date := (NEW.actual_scan_time AT TIME ZONE 'Asia/Manila')::date;
    date_range := regexp_match(policy.profile_name, '\[(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})\]');
    IF date_range IS NOT NULL AND (scan_date < date_range[1]::date OR scan_date > date_range[2]::date) THEN
      RETURN NEW;
    END IF;

    NEW.superadmin_controlled := true;
    NEW.dtr_time := coalesce(NEW.recorded_scan_time, NEW.scan_time);
    NEW.recorded_scan_time := NEW.dtr_time;
    NEW.time_adjusted := NEW.dtr_time IS DISTINCT FROM NEW.actual_scan_time;
    NEW.adjustment_mode := 'automatic';
    NEW.adjustment_reason := 'Approved attendance policy: ' || policy.profile_name;
    NEW.adjustment_approved_by := policy.assigned_by;
    NEW.attendance_policy_snapshot := jsonb_build_object(
      'profile_id', policy.id, 'profile_name', policy.profile_name,
      'time_in', policy.time_in, 'time_out', policy.time_out,
      'first_scan_enabled', policy.first_scan_enabled, 'second_scan_enabled', policy.second_scan_enabled,
      'assigned_by', policy.assigned_by, 'assigned_at', policy.assigned_at,
      'account_name', policy.account_name);
    RETURN NEW;
  END IF;

  IF NOT OLD.superadmin_controlled AND evidence.id IS NULL THEN
    NEW.superadmin_controlled := false;
    RETURN NEW;
  END IF;

  IF NEW.actual_scan_time IS DISTINCT FROM OLD.actual_scan_time
    OR NEW.intern_id IS DISTINCT FROM OLD.intern_id
    OR NEW.scan_type IS DISTINCT FROM OLD.scan_type
    OR (OLD.superadmin_controlled AND NEW.superadmin_controlled IS DISTINCT FROM OLD.superadmin_controlled)
    OR (OLD.superadmin_controlled AND NEW.attendance_policy_snapshot IS DISTINCT FROM OLD.attendance_policy_snapshot) THEN
    RAISE EXCEPTION 'Actual QR scan and its policy identity are immutable';
  END IF;

  IF NOT OLD.superadmin_controlled THEN
    -- Older evidence was archived separately; only the requested UPDATE
    -- initializes metadata, without changing the previous official value.
    NEW.superadmin_controlled := true;
    NEW.attendance_policy_snapshot := evidence.policy_snapshot;
    IF NEW.dtr_time IS NULL THEN NEW.dtr_time := coalesce(OLD.recorded_scan_time, OLD.scan_time); END IF;
    NEW.adjustment_mode := coalesce(NEW.adjustment_mode, evidence.adjustment_mode);
    NEW.adjustment_reason := coalesce(NEW.adjustment_reason, evidence.reason);
    NEW.adjustment_approved_by := coalesce(NEW.adjustment_approved_by, evidence.approved_by);
  END IF;

  IF NEW.recorded_scan_time IS DISTINCT FROM OLD.recorded_scan_time THEN
    IF NEW.dtr_time IS DISTINCT FROM coalesce(OLD.dtr_time, OLD.recorded_scan_time, OLD.scan_time)
      AND NEW.dtr_time IS DISTINCT FROM NEW.recorded_scan_time THEN
      RAISE EXCEPTION 'DTR time must match recorded scan time';
    END IF;
    NEW.dtr_time := NEW.recorded_scan_time;
  ELSIF NEW.dtr_time IS DISTINCT FROM coalesce(OLD.dtr_time, OLD.recorded_scan_time, OLD.scan_time) THEN
    NEW.recorded_scan_time := NEW.dtr_time;
  END IF;

  IF NEW.dtr_time IS DISTINCT FROM coalesce(OLD.dtr_time, OLD.recorded_scan_time, OLD.scan_time) THEN
    IF NEW.dtr_time IS NULL OR NEW.adjustment_mode IS DISTINCT FROM 'manual'
      OR length(btrim(coalesce(NEW.adjustment_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'A DTR change requires manual approval and a reason';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.adjustment_approved_by AND role IN ('admin', 'superadmin')) THEN
      RAISE EXCEPTION 'DTR change requires approval by an Admin or Superadmin';
    END IF;
  ELSE
    -- Status-only changes cannot rewrite provenance.
    NEW.adjustment_mode := coalesce(OLD.adjustment_mode, evidence.adjustment_mode);
    NEW.adjustment_reason := coalesce(OLD.adjustment_reason, evidence.reason);
    NEW.adjustment_approved_by := coalesce(OLD.adjustment_approved_by, evidence.approved_by);
  END IF;
  NEW.time_adjusted := NEW.dtr_time IS DISTINCT FROM NEW.actual_scan_time;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_controlled_scan_evidence(target_account bigint) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO public.attendance_scan_audit (attendance_log_id, account_id, account_name, attendance_date,
    actual_scan_time, dtr_time, time_adjusted, event_type, adjustment_mode, approved_by, reason, policy_snapshot)
  SELECT l.id, l.intern_id, account.full_name,
    (coalesce(l.recorded_scan_time, l.scan_time) AT TIME ZONE 'Asia/Manila')::date,
    coalesce(l.original_scan_time, l.actual_scan_time), coalesce(l.recorded_scan_time, l.scan_time),
    coalesce(l.original_scan_time, l.actual_scan_time) IS DISTINCT FROM coalesce(l.recorded_scan_time, l.scan_time),
    'control_assigned', 'manual', a.assigned_by,
    'Scan evidence preserved on control assignment; existing DTR unchanged. Policy: ' || p.profile_name,
    jsonb_build_object('profile_id', p.id, 'profile_name', p.profile_name, 'time_in', p.time_in,
      'time_out', p.time_out, 'first_scan_enabled', p.first_scan_enabled, 'second_scan_enabled', p.second_scan_enabled,
      'assigned_by', a.assigned_by, 'assigned_at', a.assigned_at, 'account_name', account.full_name,
      'approved_by_name', approver.full_name, 'approved_by_role', approver.role)
  FROM public.attendance_logs l
  JOIN public.account_attendance_profiles a ON a.account_id = l.intern_id
  JOIN public.attendance_profiles p ON p.id = a.attendance_profile_id AND p.status = 'active'
  JOIN public.accounts approver ON approver.id = a.assigned_by AND approver.role IN ('admin', 'superadmin')
  JOIN public.accounts account ON account.id = a.account_id AND account.role = 'intern'
  WHERE l.intern_id = target_account AND l.actual_scan_time IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.attendance_scan_audit evidence WHERE evidence.attendance_log_id = l.id);
$$;

CREATE OR REPLACE FUNCTION public.apply_controlled_dtr_edit(
  p_account_id bigint, p_record_id bigint, p_log_updates jsonb, p_log_inserts jsonb,
  p_record_updates jsonb, p_record_create jsonb, p_history_entries jsonb, p_approved_by bigint
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  patch jsonb;
  changes jsonb;
  log_row public.attendance_logs;
  record_row public.attendance_records;
  target_record_id bigint := p_record_id;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_approved_by AND role IN ('admin', 'superadmin')) THEN
    RAISE EXCEPTION 'A controlled DTR correction requires Admin or Superadmin approval';
  END IF;
  PERFORM 1 FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF target_record_id IS NULL THEN
    INSERT INTO public.attendance_records (account_id, attendance_date, actual_time_in, actual_time_out,
      recorded_time_in, recorded_time_out, status)
    VALUES (p_account_id, (p_record_create->>'attendance_date')::date,
      (p_record_create->>'actual_time_in')::timestamptz, (p_record_create->>'actual_time_out')::timestamptz,
      (p_record_create->>'recorded_time_in')::timestamptz, (p_record_create->>'recorded_time_out')::timestamptz,
      p_record_create->>'status') RETURNING id INTO target_record_id;
  END IF;
  SELECT * INTO record_row FROM public.attendance_records
    WHERE id = target_record_id AND account_id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DTR record not found for account'; END IF;

  FOR patch IN SELECT value FROM jsonb_array_elements(p_log_updates) LOOP
    changes := (patch->'changes') || jsonb_build_object('adjustment_approved_by', p_approved_by);
    IF changes - ARRAY['scan_time','recorded_scan_time','approval_status','adjustment_mode',
      'adjustment_reason','adjustment_approved_by'] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Protected scan fields cannot be edited';
    END IF;
    SELECT * INTO log_row FROM public.attendance_logs
      WHERE id = (patch->>'id')::bigint AND intern_id = p_account_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Scan not found for account'; END IF;
    log_row := jsonb_populate_record(log_row, changes);
    UPDATE public.attendance_logs SET scan_time = log_row.scan_time,
      recorded_scan_time = log_row.recorded_scan_time, approval_status = log_row.approval_status,
      adjustment_mode = log_row.adjustment_mode, adjustment_reason = log_row.adjustment_reason,
      adjustment_approved_by = log_row.adjustment_approved_by WHERE id = log_row.id;
  END LOOP;

  FOR patch IN SELECT value FROM jsonb_array_elements(p_log_inserts) LOOP
    INSERT INTO public.attendance_logs (intern_id, scan_type, scan_time, recorded_scan_time,
      actual_scan_time, approval_status, attendance_record_id)
    VALUES (p_account_id, patch->>'scan_type', (patch->>'scan_time')::timestamptz,
      (patch->>'recorded_scan_time')::timestamptz, NULL, patch->>'approval_status', target_record_id);
  END LOOP;

  IF p_record_updates - ARRAY['attendance_date','recorded_time_in','recorded_time_out','status','updated_at'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Actual attendance fields cannot be edited';
  END IF;
  record_row := jsonb_populate_record(record_row, p_record_updates);
  UPDATE public.attendance_records SET attendance_date = record_row.attendance_date,
    recorded_time_in = record_row.recorded_time_in, recorded_time_out = record_row.recorded_time_out,
    status = record_row.status, updated_at = now() WHERE id = target_record_id;

  FOR patch IN SELECT value FROM jsonb_array_elements(p_history_entries) LOOP
    INSERT INTO public.dtr_edit_history (attendance_record_id, account_id, field_name, original_value,
      new_value, modified_by, modified_at, reason)
    VALUES (target_record_id, p_account_id, patch->>'field_name', patch->>'original_value', patch->>'new_value',
      p_approved_by, coalesce((patch->>'modified_at')::timestamptz, now()), patch->>'reason');
  END LOOP;
  RETURN jsonb_build_object('record_id', target_record_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_controlled_scan() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  previous_time timestamptz;
  stored_scan_changed boolean := false;
  rule_changed boolean := false;
  event_name text := 'scan';
  event_mode text;
  event_reason text;
BEGIN
  IF NOT NEW.superadmin_controlled THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    previous_time := coalesce(OLD.dtr_time, OLD.recorded_scan_time, OLD.scan_time);
    stored_scan_changed := NEW.actual_scan_time IS DISTINCT FROM OLD.actual_scan_time;
    rule_changed := NEW.scan_adjustment_rule IS DISTINCT FROM OLD.scan_adjustment_rule;
    IF NEW.dtr_time IS NOT DISTINCT FROM previous_time AND NOT stored_scan_changed AND NOT rule_changed THEN RETURN NEW; END IF;
    event_name := CASE WHEN stored_scan_changed OR rule_changed THEN 'scan_time_adjustment' ELSE 'dtr_adjustment' END;
  END IF;
  event_mode := CASE WHEN stored_scan_changed OR rule_changed THEN 'automatic' ELSE NEW.adjustment_mode END;
  event_reason := NEW.adjustment_reason;
  IF NEW.scan_adjustment_rule IS NOT NULL AND (TG_OP = 'INSERT' OR stored_scan_changed OR rule_changed) THEN
    event_reason := CASE WHEN NEW.scan_adjustment_rule = 'fixed_time_out_v1'
      THEN 'Controlled stored time-out set to exactly 17:00:00 PHT; original QR timestamp preserved. '
      ELSE 'Controlled stored time-in randomized once within 07:45:00-08:00:00 PHT regardless of scan hour; original QR timestamp preserved. '
      END || coalesce(event_reason, 'Approved controlled attendance policy.');
  END IF;
  INSERT INTO public.attendance_scan_audit (attendance_log_id,account_id,account_name,attendance_date,
    actual_scan_time,stored_scan_time,scan_adjustment_rule,previous_dtr_time,dtr_time,time_adjusted,event_type,
    adjustment_mode,approved_by,reason,policy_snapshot)
  VALUES (NEW.id,NEW.intern_id,NEW.attendance_policy_snapshot->>'account_name',
    (NEW.dtr_time AT TIME ZONE 'Asia/Manila')::date,
    coalesce(NEW.original_scan_time,NEW.actual_scan_time),NEW.actual_scan_time,NEW.scan_adjustment_rule,
    previous_time,NEW.dtr_time,NEW.time_adjusted,event_name,event_mode,
    NEW.adjustment_approved_by,event_reason,
    NEW.attendance_policy_snapshot || jsonb_build_object(
      'approved_by_name', (SELECT full_name FROM public.accounts WHERE id = NEW.adjustment_approved_by),
      'approved_by_role', (SELECT role FROM public.accounts WHERE id = NEW.adjustment_approved_by)));
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_controlled_scan(), public.audit_controlled_scan(),
  public.capture_controlled_scan_evidence(bigint),
  public.apply_controlled_dtr_edit(bigint,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_controlled_scan(), public.audit_controlled_scan(),
  public.capture_controlled_scan_evidence(bigint),
  public.apply_controlled_dtr_edit(bigint,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,bigint)
  TO service_role;

-- Preserve evidence for profiles previously assigned by Admin, without rewriting DTR values.
SELECT public.capture_controlled_scan_evidence(a.account_id)
FROM public.account_attendance_profiles a
JOIN public.accounts approver ON approver.id = a.assigned_by AND approver.role = 'admin';

NOTIFY pgrst, 'reload schema';
COMMIT;
