-- Requires backend/db/migration_superadmin_attendance_control.sql.
-- Additive only: deliberately do not backfill or rewrite any existing DTR.
BEGIN;

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS superadmin_controlled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dtr_time timestamptz,
  ADD COLUMN IF NOT EXISTS time_adjusted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adjustment_reason text,
  ADD COLUMN IF NOT EXISTS adjustment_mode text CHECK (adjustment_mode IN ('automatic', 'manual')),
  ADD COLUMN IF NOT EXISTS adjustment_approved_by bigint,
  ADD COLUMN IF NOT EXISTS attendance_policy_snapshot jsonb;

-- No cascading foreign keys: scan evidence must outlive account/profile changes.
CREATE TABLE public.attendance_scan_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attendance_log_id bigint NOT NULL,
  account_id bigint NOT NULL,
  account_name text,
  attendance_date date NOT NULL,
  actual_scan_time timestamptz NOT NULL,
  previous_dtr_time timestamptz,
  dtr_time timestamptz NOT NULL,
  time_adjusted boolean NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('scan', 'dtr_adjustment', 'control_assigned')),
  adjustment_mode text NOT NULL CHECK (adjustment_mode IN ('automatic', 'manual')),
  approved_by bigint NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  policy_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_scan_audit_account_date ON public.attendance_scan_audit(account_id, attendance_date, id DESC);
CREATE INDEX attendance_scan_audit_log_history ON public.attendance_scan_audit(attendance_log_id, id);
ALTER TABLE public.attendance_scan_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_scan_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.attendance_scan_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.attendance_scan_audit_id_seq TO service_role;

CREATE FUNCTION public.protect_controlled_scan() RETURNS trigger
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

CREATE FUNCTION public.audit_controlled_scan() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE previous_time timestamptz;
BEGIN
  IF NOT NEW.superadmin_controlled THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    previous_time := coalesce(OLD.dtr_time, OLD.recorded_scan_time, OLD.scan_time);
    IF NEW.dtr_time IS NOT DISTINCT FROM previous_time THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.attendance_scan_audit (
    attendance_log_id, account_id, account_name, attendance_date, actual_scan_time,
    previous_dtr_time, dtr_time, time_adjusted, event_type, adjustment_mode, approved_by, reason, policy_snapshot
  ) VALUES (
    NEW.id, NEW.intern_id, NEW.attendance_policy_snapshot->>'account_name',
    (NEW.dtr_time AT TIME ZONE 'Asia/Manila')::date, NEW.actual_scan_time,
    previous_time, NEW.dtr_time, NEW.time_adjusted,
    CASE WHEN TG_OP = 'INSERT' THEN 'scan' ELSE 'dtr_adjustment' END,
    NEW.adjustment_mode, NEW.adjustment_approved_by, NEW.adjustment_reason, NEW.attendance_policy_snapshot
  );
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.reject_scan_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Permanent scan audit records are immutable'; END;
$$;

CREATE FUNCTION public.protect_scan_truncation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.attendance_logs l WHERE l.superadmin_controlled
    OR EXISTS (SELECT 1 FROM public.attendance_scan_audit a WHERE a.attendance_log_id = l.id)) THEN
    RAISE EXCEPTION 'Actual QR scans are protected and cannot be truncated';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER protect_controlled_scan BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.protect_controlled_scan();
CREATE TRIGGER audit_controlled_scan AFTER INSERT OR UPDATE ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_controlled_scan();
CREATE TRIGGER protect_scan_truncation BEFORE TRUNCATE ON public.attendance_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.protect_scan_truncation();
CREATE TRIGGER immutable_scan_audit BEFORE UPDATE OR DELETE ON public.attendance_scan_audit
  FOR EACH ROW EXECUTE FUNCTION public.reject_scan_audit_mutation();
CREATE TRIGGER immutable_scan_audit_truncate BEFORE TRUNCATE ON public.attendance_scan_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_scan_audit_mutation();

-- Preserve prior evidence on enrollment, without UPDATEs to any old DTR/log.
CREATE FUNCTION public.capture_controlled_scan_evidence(target_account bigint) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO public.attendance_scan_audit (attendance_log_id, account_id, account_name, attendance_date,
    actual_scan_time, dtr_time, time_adjusted, event_type, adjustment_mode, approved_by, reason, policy_snapshot)
  SELECT l.id, l.intern_id, account.full_name,
    (coalesce(l.recorded_scan_time, l.scan_time) AT TIME ZONE 'Asia/Manila')::date,
    l.actual_scan_time, coalesce(l.recorded_scan_time, l.scan_time),
    l.actual_scan_time IS DISTINCT FROM coalesce(l.recorded_scan_time, l.scan_time),
    'control_assigned', 'manual', a.assigned_by,
    'Scan evidence preserved on control assignment; existing DTR unchanged. Policy: ' || p.profile_name,
    jsonb_build_object('profile_id', p.id, 'profile_name', p.profile_name, 'time_in', p.time_in,
      'time_out', p.time_out, 'first_scan_enabled', p.first_scan_enabled, 'second_scan_enabled', p.second_scan_enabled,
      'assigned_by', a.assigned_by, 'assigned_at', a.assigned_at, 'account_name', account.full_name)
  FROM public.attendance_logs l
  JOIN public.account_attendance_profiles a ON a.account_id = l.intern_id
  JOIN public.attendance_profiles p ON p.id = a.attendance_profile_id AND p.status = 'active'
  JOIN public.accounts approver ON approver.id = a.assigned_by AND approver.role = 'superadmin'
  JOIN public.accounts account ON account.id = a.account_id AND account.role = 'intern'
  WHERE l.intern_id = target_account AND l.actual_scan_time IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.attendance_scan_audit evidence WHERE evidence.attendance_log_id = l.id);
$$;
CREATE FUNCTION public.capture_control_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN PERFORM public.capture_controlled_scan_evidence(NEW.account_id); RETURN NEW; END;
$$;
CREATE TRIGGER capture_control_assignment AFTER INSERT OR UPDATE ON public.account_attendance_profiles
  FOR EACH ROW EXECUTE FUNCTION public.capture_control_assignment();
SELECT public.capture_controlled_scan_evidence(account_id) FROM public.account_attendance_profiles;
REVOKE EXECUTE ON FUNCTION public.capture_controlled_scan_evidence(bigint), public.capture_control_assignment()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_controlled_scan_evidence(bigint), public.capture_control_assignment() TO service_role;

-- One RPC/transaction for a controlled correction, including both scans,
-- immutable audit snapshots, the DTR mirror, and the existing edit history.
CREATE FUNCTION public.apply_controlled_dtr_edit(
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
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_approved_by AND role = 'superadmin') THEN
    RAISE EXCEPTION 'A controlled DTR correction requires Superadmin approval';
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
REVOKE EXECUTE ON FUNCTION public.apply_controlled_dtr_edit(bigint,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_controlled_dtr_edit(bigint,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,bigint) TO service_role;

REVOKE EXECUTE ON FUNCTION public.protect_controlled_scan(), public.audit_controlled_scan(),
  public.reject_scan_audit_mutation(), public.protect_scan_truncation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_controlled_scan(), public.audit_controlled_scan(),
  public.reject_scan_audit_mutation(), public.protect_scan_truncation() TO service_role;

COMMIT;
