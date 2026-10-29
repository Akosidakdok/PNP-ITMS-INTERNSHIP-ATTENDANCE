-- Randomize eligible controlled morning scan representations once per record.
-- Apply after 20261029023532_controlled_morning_scan_adjustment.sql.
-- Real QR timestamps, official DTR values, and calculations remain unchanged.
BEGIN;
ALTER TABLE public.attendance_logs ADD COLUMN scan_adjustment_rule text;
ALTER TABLE public.attendance_scan_audit ADD COLUMN scan_adjustment_rule text;

-- 901 equally spaced whole-second values, including 07:45:00 and 08:00:00.
CREATE FUNCTION public.controlled_morning_random_time(p_original timestamptz, p_sample double precision)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_original IS NULL OR p_sample IS NULL OR NOT (p_sample >= 0 AND p_sample < 1) THEN
    RAISE EXCEPTION 'A scan instant and random sample in [0,1) are required';
  END IF;
  RETURN (((p_original AT TIME ZONE 'Asia/Manila')::date + TIME '07:45')
    + floor(p_sample * 901)::integer * INTERVAL '1 second') AT TIME ZONE 'Asia/Manila';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.controlled_morning_random_time(timestamptz,double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.controlled_morning_random_time(timestamptz,double precision) TO service_role;

CREATE OR REPLACE FUNCTION public.adjust_controlled_morning_scan() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  original_instant timestamptz;
  original_local timestamp;
  date_range text[];
  policy_effective boolean := true;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.scan_adjustment_rule IS NOT NULL
    AND NEW.scan_adjustment_rule IS DISTINCT FROM OLD.scan_adjustment_rule THEN
    RAISE EXCEPTION 'Stored scan adjustment rule is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.original_scan_time IS NOT NULL
    AND NEW.original_scan_time IS DISTINCT FROM OLD.original_scan_time THEN
    RAISE EXCEPTION 'Original QR scan timestamp is immutable';
  END IF;
  IF NOT NEW.superadmin_controlled OR NEW.actual_scan_time IS NULL THEN
    IF TG_OP = 'INSERT' THEN NEW.original_scan_time := NULL; END IF;
    NEW.scan_adjustment_rule := CASE WHEN TG_OP = 'UPDATE' THEN OLD.scan_adjustment_rule ELSE NULL END;
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
  NEW.scan_adjustment_rule := NULL;
  IF NEW.scan_type = 'time_in'
    AND coalesce((NEW.attendance_policy_snapshot->>'first_scan_enabled')::boolean, false)
    AND policy_effective
    AND original_local::time > TIME '08:00' AND original_local::time < TIME '12:00' THEN
    IF TG_OP = 'UPDATE' AND OLD.scan_adjustment_rule = 'randomized_morning_v1' THEN
      NEW.actual_scan_time := OLD.actual_scan_time;
    ELSE
      NEW.actual_scan_time := public.controlled_morning_random_time(original_instant, random());
    END IF;
    NEW.scan_adjustment_rule := 'randomized_morning_v1';
  END IF;
  NEW.scan_time_adjusted := NEW.actual_scan_time IS DISTINCT FROM original_instant;
  NEW.time_adjusted := NEW.dtr_time IS DISTINCT FROM original_instant OR NEW.scan_time_adjusted;
  RETURN NEW;
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
  IF NEW.scan_time_adjusted AND (TG_OP = 'INSERT' OR stored_scan_changed OR rule_changed) THEN
    event_reason := 'Controlled morning stored scan randomized once within 07:45:00-08:00:00 PHT; original QR timestamp preserved. ' || event_reason;
  END IF;
  INSERT INTO public.attendance_scan_audit (attendance_log_id,account_id,account_name,attendance_date,
    actual_scan_time,stored_scan_time,scan_adjustment_rule,previous_dtr_time,dtr_time,time_adjusted,event_type,
    adjustment_mode,approved_by,reason,policy_snapshot)
  VALUES (NEW.id,NEW.intern_id,NEW.attendance_policy_snapshot->>'account_name',
    (NEW.dtr_time AT TIME ZONE 'Asia/Manila')::date,
    coalesce(NEW.original_scan_time,NEW.actual_scan_time),NEW.actual_scan_time,NEW.scan_adjustment_rule,
    previous_time,NEW.dtr_time,NEW.time_adjusted,event_name,event_mode,
    NEW.adjustment_approved_by,event_reason,NEW.attendance_policy_snapshot);
  RETURN NEW;
END;
$$;

-- One-time conversion of previously fixed 08:00 adjusted entries. The existing
-- guards run first; the authorized trigger chooses and audits the stored value.
UPDATE public.attendance_logs l SET actual_scan_time = l.actual_scan_time
WHERE l.original_scan_time IS NOT NULL AND l.scan_adjustment_rule IS NULL
  AND l.superadmin_controlled;
COMMIT;
