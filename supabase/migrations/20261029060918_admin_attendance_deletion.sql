-- Allow individual administrator deletions without erasing QR evidence.
BEGIN;
ALTER TABLE public.attendance_scan_audit DROP CONSTRAINT attendance_scan_audit_event_type_check;
ALTER TABLE public.attendance_scan_audit ADD CONSTRAINT attendance_scan_audit_event_type_check
  CHECK (event_type IN ('scan','dtr_adjustment','control_assigned','scan_time_adjustment','attendance_deleted'));

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
      JOIN public.accounts approver ON approver.id = a.assigned_by AND approver.role = 'superadmin'
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
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.adjustment_approved_by AND role = 'superadmin') THEN
      RAISE EXCEPTION 'DTR change requires approval by a Superadmin';
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

CREATE FUNCTION public.delete_admin_attendance_entry(
  p_attendance_id bigint, p_actor_id bigint, p_rescan boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  scan public.attendance_logs;
  evidence public.attendance_scan_audit;
  day_start timestamptz;
  day_end timestamptz;
  audit_id bigint;
  actor_role text;
  actor_name text;
  account_name text;
  latest_id bigint;
  reason text;
  old_authorization text;
  old_audit text;
BEGIN
  SELECT role,full_name INTO actor_role,actor_name FROM public.accounts WHERE id = p_actor_id;
  IF current_user <> 'service_role' OR actor_role IS NULL OR actor_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'Admin access required to delete protected attendance' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO scan FROM public.attendance_logs WHERE id = p_attendance_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found' USING ERRCODE = 'P0002';
  END IF;
  day_start := ((scan.scan_time AT TIME ZONE 'Asia/Manila')::date)::timestamp AT TIME ZONE 'Asia/Manila';
  day_end := day_start + interval '1 day';
  -- Lock the mirror before deriving replacement times from the remaining scans.
  PERFORM 1 FROM public.attendance_records
    WHERE account_id = scan.intern_id AND attendance_date = (scan.scan_time AT TIME ZONE 'Asia/Manila')::date
    FOR UPDATE;
  IF p_rescan THEN
    IF scan.approval_status IS DISTINCT FROM 'rejected' THEN
      RAISE EXCEPTION 'Only rejected attendance records can be removed for rescanning' USING ERRCODE = '23514';
    END IF;
    IF (scan.scan_time AT TIME ZONE 'Asia/Manila')::date <> (now() AT TIME ZONE 'Asia/Manila')::date THEN
      RAISE EXCEPTION 'Only today''s rejected attendance can be removed for rescanning' USING ERRCODE = '23514';
    END IF;
    SELECT id INTO latest_id FROM public.attendance_logs
      WHERE intern_id = scan.intern_id AND scan_time >= day_start AND scan_time < day_end
        AND (remarks IS NULL OR remarks NOT LIKE 'OVERRIDE:%')
      ORDER BY scan_time DESC, id DESC LIMIT 1;
    IF latest_id IS DISTINCT FROM scan.id THEN
      RAISE EXCEPTION 'Only the intern''s latest attendance entry can be removed for rescanning' USING ERRCODE = '23514';
    END IF;
  END IF;
  SELECT * INTO evidence FROM public.attendance_scan_audit
    WHERE attendance_log_id = scan.id ORDER BY id LIMIT 1;
  SELECT full_name INTO account_name FROM public.accounts WHERE id = scan.intern_id;
  reason := CASE WHEN p_rescan THEN 'Rejected attendance removed by administrator to allow rescanning.'
    ELSE 'Attendance entry deleted by administrator.' END;
  INSERT INTO public.attendance_scan_audit (
    attendance_log_id, account_id, account_name, attendance_date, actual_scan_time, stored_scan_time,
    scan_adjustment_rule, previous_dtr_time, dtr_time, time_adjusted, event_type, adjustment_mode,
    approved_by, reason, policy_snapshot
  ) VALUES (
    scan.id, scan.intern_id, coalesce(account_name,evidence.account_name,scan.intern_name),
    (scan.scan_time AT TIME ZONE 'Asia/Manila')::date,
    coalesce(scan.original_scan_time,evidence.actual_scan_time,scan.actual_scan_time,scan.scan_time),
    scan.actual_scan_time, scan.scan_adjustment_rule,
    coalesce(scan.dtr_time,scan.recorded_scan_time,scan.scan_time),
    coalesce(scan.dtr_time,scan.recorded_scan_time,scan.scan_time),
    scan.time_adjusted, 'attendance_deleted', 'manual', p_actor_id, reason,
    coalesce(scan.attendance_policy_snapshot,evidence.policy_snapshot,'{}'::jsonb)
      || jsonb_build_object('deleted_by_name',actor_name,'deleted_by_role',actor_role)
  ) RETURNING id INTO audit_id;

  old_authorization := current_setting('app.authorized_attendance_delete',true);
  old_audit := current_setting('app.attendance_delete_audit',true);
  PERFORM set_config('app.authorized_attendance_delete',scan.id::text,true);
  PERFORM set_config('app.attendance_delete_audit',audit_id::text,true);
  IF to_regclass('public.attendance_photos') IS NOT NULL THEN
    DELETE FROM public.attendance_photos WHERE attendance_log_id = scan.id;
  END IF;
  DELETE FROM public.attendance_logs WHERE id = scan.id;
  PERFORM set_config('app.authorized_attendance_delete',coalesce(old_authorization,''),true);
  PERFORM set_config('app.attendance_delete_audit',coalesce(old_audit,''),true);

  UPDATE public.attendance_records r SET
    actual_time_in = (SELECT coalesce(l.original_scan_time,l.actual_scan_time,l.scan_time) FROM public.attendance_logs l
      WHERE l.intern_id = scan.intern_id AND l.scan_type = 'time_in' AND l.scan_time >= day_start AND l.scan_time < day_end
        AND (l.remarks IS NULL OR l.remarks NOT LIKE 'OVERRIDE:%') ORDER BY l.scan_time, l.id LIMIT 1),
    recorded_time_in = (SELECT coalesce(l.dtr_time,l.recorded_scan_time,l.scan_time) FROM public.attendance_logs l
      WHERE l.intern_id = scan.intern_id AND l.scan_type = 'time_in' AND l.scan_time >= day_start AND l.scan_time < day_end
        AND (l.remarks IS NULL OR l.remarks NOT LIKE 'OVERRIDE:%') ORDER BY l.scan_time, l.id LIMIT 1),
    actual_time_out = (SELECT coalesce(l.original_scan_time,l.actual_scan_time,l.scan_time) FROM public.attendance_logs l
      WHERE l.intern_id = scan.intern_id AND l.scan_type = 'time_out' AND l.scan_time >= day_start AND l.scan_time < day_end
        AND (l.remarks IS NULL OR l.remarks NOT LIKE 'OVERRIDE:%') ORDER BY l.scan_time DESC, l.id DESC LIMIT 1),
    recorded_time_out = (SELECT coalesce(l.dtr_time,l.recorded_scan_time,l.scan_time) FROM public.attendance_logs l
      WHERE l.intern_id = scan.intern_id AND l.scan_type = 'time_out' AND l.scan_time >= day_start AND l.scan_time < day_end
        AND (l.remarks IS NULL OR l.remarks NOT LIKE 'OVERRIDE:%') ORDER BY l.scan_time DESC, l.id DESC LIMIT 1),
    updated_at = now()
  WHERE r.account_id = scan.intern_id AND r.attendance_date = (scan.scan_time AT TIME ZONE 'Asia/Manila')::date;
  RETURN jsonb_build_object('removed',jsonb_build_object('id',scan.id,'intern_id',scan.intern_id,
    'scan_type',scan.scan_type,'scan_time',scan.scan_time,'approval_status',scan.approval_status),'audit_preserved',true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_admin_attendance_entry(bigint,bigint,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_admin_attendance_entry(bigint,bigint,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

