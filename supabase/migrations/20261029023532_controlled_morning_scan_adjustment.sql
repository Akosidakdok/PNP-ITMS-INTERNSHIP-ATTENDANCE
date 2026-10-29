-- Follow-up requested rule: cap stored controlled morning scan values at 08:00,
-- retaining the real QR instant in immutable original_scan_time and audit rows.
-- Apply after 20261029014221_superadmin_scan_audit.sql.
BEGIN;

ALTER TABLE public.attendance_logs
  ADD COLUMN original_scan_time timestamptz,
  ADD COLUMN scan_time_adjusted boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance_scan_audit ADD COLUMN stored_scan_time timestamptz;
ALTER TABLE public.attendance_scan_audit DROP CONSTRAINT attendance_scan_audit_event_type_check;
ALTER TABLE public.attendance_scan_audit ADD CONSTRAINT attendance_scan_audit_event_type_check
  CHECK (event_type IN ('scan','dtr_adjustment','control_assigned','scan_time_adjustment'));

CREATE FUNCTION public.adjust_controlled_morning_scan() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  original_instant timestamptz;
  original_local timestamp;
  date_range text[];
  policy_effective boolean := true;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.original_scan_time IS NOT NULL
    AND NEW.original_scan_time IS DISTINCT FROM OLD.original_scan_time THEN
    RAISE EXCEPTION 'Original QR scan timestamp is immutable';
  END IF;
  IF NOT NEW.superadmin_controlled OR NEW.actual_scan_time IS NULL THEN
    IF TG_OP = 'INSERT' THEN NEW.original_scan_time := NULL; END IF;
    NEW.scan_time_adjusted := false;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    original_instant := NEW.actual_scan_time;
  ELSE
    SELECT actual_scan_time INTO original_instant FROM public.attendance_scan_audit
      WHERE attendance_log_id = OLD.id ORDER BY id LIMIT 1;
    original_instant := coalesce(OLD.original_scan_time, original_instant, OLD.actual_scan_time);
  END IF;
  NEW.original_scan_time := original_instant;
  original_local := original_instant AT TIME ZONE 'Asia/Manila';
  date_range := regexp_match(NEW.attendance_policy_snapshot->>'profile_name', '\[(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})\]');
  IF date_range IS NOT NULL THEN
    policy_effective := original_local::date BETWEEN date_range[1]::date AND date_range[2]::date;
  END IF;
  IF NEW.scan_type = 'time_in'
    AND coalesce((NEW.attendance_policy_snapshot->>'first_scan_enabled')::boolean, false)
    AND policy_effective
    AND original_local::time > TIME '08:00' AND original_local::time < TIME '12:00' THEN
    NEW.actual_scan_time := (original_local::date + TIME '08:00') AT TIME ZONE 'Asia/Manila';
  END IF;
  NEW.scan_time_adjusted := NEW.actual_scan_time IS DISTINCT FROM original_instant;
  NEW.time_adjusted := NEW.dtr_time IS DISTINCT FROM original_instant OR NEW.scan_time_adjusted;
  RETURN NEW;
END;
$$;

-- PostgreSQL runs same-event triggers by name. Authorization/protection runs
-- first; this narrow automatic transform runs afterwards and before auditing.
CREATE TRIGGER zz_adjust_controlled_morning_scan BEFORE INSERT OR UPDATE ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.adjust_controlled_morning_scan();
REVOKE EXECUTE ON FUNCTION public.adjust_controlled_morning_scan() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_controlled_morning_scan() TO service_role;

CREATE OR REPLACE FUNCTION public.audit_controlled_scan() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  previous_time timestamptz;
  stored_scan_changed boolean := false;
  event_name text := 'scan';
  event_mode text;
  event_reason text;
BEGIN
  IF NOT NEW.superadmin_controlled THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    previous_time := coalesce(OLD.dtr_time, OLD.recorded_scan_time, OLD.scan_time);
    stored_scan_changed := NEW.actual_scan_time IS DISTINCT FROM OLD.actual_scan_time;
    IF NEW.dtr_time IS NOT DISTINCT FROM previous_time AND NOT stored_scan_changed THEN RETURN NEW; END IF;
    event_name := CASE WHEN stored_scan_changed THEN 'scan_time_adjustment' ELSE 'dtr_adjustment' END;
  END IF;
  event_mode := CASE WHEN stored_scan_changed THEN 'automatic' ELSE NEW.adjustment_mode END;
  event_reason := NEW.adjustment_reason;
  IF NEW.scan_time_adjusted AND (TG_OP = 'INSERT' OR stored_scan_changed) THEN
    event_reason := 'Controlled morning stored scan capped at 08:00 PHT; original QR timestamp preserved. ' || event_reason;
  END IF;
  INSERT INTO public.attendance_scan_audit (attendance_log_id,account_id,account_name,attendance_date,
    actual_scan_time,stored_scan_time,previous_dtr_time,dtr_time,time_adjusted,event_type,
    adjustment_mode,approved_by,reason,policy_snapshot)
  VALUES (NEW.id,NEW.intern_id,NEW.attendance_policy_snapshot->>'account_name',
    (NEW.dtr_time AT TIME ZONE 'Asia/Manila')::date,
    coalesce(NEW.original_scan_time,NEW.actual_scan_time),NEW.actual_scan_time,
    previous_time,NEW.dtr_time,NEW.time_adjusted,event_name,event_mode,
    NEW.adjustment_approved_by,event_reason,NEW.attendance_policy_snapshot);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_control_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Archive the real values before applying the newly requested stored cap.
  PERFORM public.capture_controlled_scan_evidence(NEW.account_id);
  UPDATE public.attendance_logs l SET actual_scan_time = l.actual_scan_time
    WHERE l.intern_id = NEW.account_id AND l.actual_scan_time IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.attendance_scan_audit a WHERE a.attendance_log_id = l.id);
  RETURN NEW;
END;
$$;

-- The earlier migration has already archived these originals. Update only the
-- stored scan representation; leave scan_time, recorded_scan_time and DTRs as is.
UPDATE public.attendance_logs l SET actual_scan_time = l.actual_scan_time
  WHERE l.actual_scan_time IS NOT NULL AND (l.superadmin_controlled
    OR EXISTS (SELECT 1 FROM public.attendance_scan_audit a WHERE a.attendance_log_id = l.id));

COMMIT;
