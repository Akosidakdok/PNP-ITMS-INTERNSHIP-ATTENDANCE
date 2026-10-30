-- Delete a selected DTR date through the existing audited per-scan deletion path.
-- Requires the controlled attendance migrations, including administrator scan deletion.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_admin_dtr_attendance(
  p_account_id bigint, p_date date, p_actor_id bigint, p_reason text, p_target text DEFAULT 'all'
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  record_row public.attendance_records;
  scan public.attendance_logs;
  day_start timestamptz;
  day_end timestamptz;
  actor_role text;
  deleted_ids bigint[] := ARRAY[]::bigint[];
  deleted_record boolean := false;
  original_details text;
BEGIN
  SELECT role INTO actor_role FROM public.accounts WHERE id = p_actor_id;
  IF current_user <> 'service_role' OR actor_role IS NULL OR actor_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'Admin access required to delete DTR attendance' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL OR p_target IS NULL OR p_target NOT IN ('attendance','override','all') THEN
    RAISE EXCEPTION 'A valid date and deletion target are required' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason,''))) = 0 THEN
    RAISE EXCEPTION 'A modification reason is required for DTR deletion' USING ERRCODE = '22023';
  END IF;
  -- Serialize DTR delete/reset transactions for the same account.
  PERFORM 1 FROM public.accounts WHERE id = p_account_id AND role = 'intern' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intern account not found' USING ERRCODE = 'P0002'; END IF;

  day_start := p_date::timestamp AT TIME ZONE 'Asia/Manila';
  day_end := (p_date + 1)::timestamp AT TIME ZONE 'Asia/Manila';
  SELECT * INTO record_row FROM public.attendance_records
    WHERE account_id = p_account_id AND attendance_date = p_date FOR UPDATE;
  original_details := p_date::text || ': ' || coalesce(to_jsonb(record_row)::text, 'No daily mirror');

  FOR scan IN
    SELECT l.* FROM public.attendance_logs l
    WHERE l.intern_id = p_account_id
      AND ((l.scan_time >= day_start AND l.scan_time < day_end)
        OR (record_row.id IS NOT NULL AND l.attendance_record_id = record_row.id))
      AND (p_target <> 'override' OR upper(btrim(coalesce(l.remarks,''))) LIKE 'OVERRIDE:%')
    ORDER BY l.id FOR UPDATE
  LOOP
    -- The inner function writes immutable original QR evidence and the deleting actor
    -- before removing a scan/photo. Any failure rolls back this entire date.
    PERFORM public.delete_admin_attendance_entry(scan.id,p_actor_id,false);
    deleted_ids := array_append(deleted_ids,scan.id);
  END LOOP;

  IF p_target IN ('attendance','all')
    OR (p_target = 'override' AND record_row.actual_time_in IS NULL AND record_row.actual_time_out IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.attendance_logs l WHERE l.intern_id = p_account_id
        AND ((l.scan_time >= day_start AND l.scan_time < day_end) OR l.attendance_record_id = record_row.id)
        AND upper(btrim(coalesce(l.remarks,''))) NOT LIKE 'OVERRIDE:%')) THEN
    -- The existing foreign key cascades edit history; detach it before deleting the mirror.
    UPDATE public.dtr_edit_history SET attendance_record_id = NULL
      WHERE attendance_record_id IN (SELECT id FROM public.attendance_records
        WHERE account_id = p_account_id AND attendance_date = p_date);
    DELETE FROM public.attendance_records WHERE account_id = p_account_id AND attendance_date = p_date;
    deleted_record := FOUND;
  END IF;

  INSERT INTO public.dtr_edit_history (attendance_record_id,account_id,field_name,original_value,
    new_value,modified_by,modified_at,reason)
  VALUES (NULL,p_account_id,CASE WHEN p_target='override' THEN 'Schedule Override' ELSE 'Attendance Record' END,
    original_details || '; ' || cardinality(deleted_ids)::text || ' scan log(s) removed',
    'Deleted / Cleared; original QR evidence retained in audit history',p_actor_id,now(),btrim(p_reason));

  RETURN jsonb_build_object('success',true,'internId',p_account_id,'date',p_date,'target',p_target,
    'deletedLogsCount',cardinality(deleted_ids),'deletedRecord',deleted_record,
    'deleted_log_ids',to_jsonb(deleted_ids),'audit_preserved',true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_admin_dtr_attendance(bigint,date,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_admin_dtr_attendance(bigint,date,bigint,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
