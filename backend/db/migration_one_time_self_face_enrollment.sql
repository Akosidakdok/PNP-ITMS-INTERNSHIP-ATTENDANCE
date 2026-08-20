-- Allow only newly created intern accounts to complete their initial Face ID
-- enrollment themselves. Run after migration_face_enrollment_workflow.sql.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS self_face_enrollment_available boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION complete_face_enrollment(
  p_intern_id bigint,
  p_embedding jsonb,
  p_photo text,
  p_actor_id bigint,
  p_reason text,
  p_request_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intern accounts%ROWTYPE;
  v_actor accounts%ROWTYPE;
  v_request face_renewal_requests%ROWTYPE;
  v_type text;
  v_now timestamptz := now();
  v_history_id bigint;
BEGIN
  SELECT * INTO v_intern
  FROM accounts
  WHERE id = p_intern_id AND role = 'intern'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intern account not found';
  END IF;

  SELECT * INTO v_actor
  FROM accounts
  WHERE id = p_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment actor not found';
  END IF;

  IF p_embedding IS NULL OR p_photo IS NULL THEN
    RAISE EXCEPTION 'Face embedding and enrollment photo are required';
  END IF;

  IF char_length(trim(coalesce(p_reason, ''))) < 10
     OR char_length(trim(coalesce(p_reason, ''))) > 500 THEN
    RAISE EXCEPTION 'Enrollment reason must be between 10 and 500 characters';
  END IF;

  IF p_request_id IS NULL THEN
    IF v_actor.role = 'intern' THEN
      IF v_actor.id IS DISTINCT FROM v_intern.id
         OR v_intern.status IS DISTINCT FROM 'active'
         OR v_intern.face_registered
         OR NOT v_intern.self_face_enrollment_available THEN
        RAISE EXCEPTION 'One-time self-enrollment is not available for this intern account';
      END IF;
    ELSE
      IF v_actor.role NOT IN ('admin', 'supervisor') THEN
        RAISE EXCEPTION 'Initial or direct enrollment requires authorized staff';
      END IF;

      IF v_actor.role = 'supervisor'
         AND (v_actor.division_id IS NULL OR v_actor.division_id IS DISTINCT FROM v_intern.division_id) THEN
        RAISE EXCEPTION 'Supervisor cannot enroll an intern from another division';
      END IF;

      IF v_intern.face_registered
         AND EXISTS (
           SELECT 1
           FROM face_renewal_requests
           WHERE intern_id = p_intern_id
             AND status IN ('pending', 'approved')
         ) THEN
        RAISE EXCEPTION 'Resolve the intern''s active renewal request before a direct staff replacement';
      END IF;
    END IF;
  ELSE
    SELECT * INTO v_request
    FROM face_renewal_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_request.intern_id IS DISTINCT FROM p_intern_id
       OR v_request.status <> 'approved' THEN
      RAISE EXCEPTION 'This renewal approval is invalid or has already been used';
    END IF;

    IF v_actor.id <> p_intern_id OR v_actor.role <> 'intern' THEN
      RAISE EXCEPTION 'Only the approved intern may complete this renewal';
    END IF;
  END IF;

  v_type := CASE WHEN v_intern.face_registered THEN 'renewal' ELSE 'initial' END;

  UPDATE accounts
  SET face_embedding = p_embedding,
      face_photo = p_photo,
      face_registered = true,
      face_registered_at = v_now,
      self_face_enrollment_available = false
  WHERE id = p_intern_id;

  INSERT INTO face_enrollment_history (
    intern_id,
    intern_name,
    enrollment_type,
    renewal_reason,
    request_id,
    enrolled_by,
    enrolled_by_name,
    enrolled_by_role,
    created_at
  )
  VALUES (
    v_intern.id,
    v_intern.full_name,
    v_type,
    trim(p_reason),
    p_request_id,
    v_actor.id,
    v_actor.full_name,
    v_actor.role,
    v_now
  )
  RETURNING id INTO v_history_id;

  IF p_request_id IS NOT NULL THEN
    UPDATE face_renewal_requests
    SET status = 'completed',
        completed_at = v_now,
        updated_at = v_now
    WHERE id = p_request_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_intern.id,
    'full_name', v_intern.full_name,
    'email', v_intern.email,
    'face_registered', true,
    'face_registered_at', v_now,
    'self_face_enrollment_available', false,
    'enrollment_type', v_type,
    'history_id', v_history_id,
    'request_id', p_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION complete_face_enrollment(bigint, jsonb, text, bigint, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_face_enrollment(bigint, jsonb, text, bigint, text, bigint)
  TO service_role;
