-- Persistent login and biometric attempt lockouts.
-- Apply this migration before deploying the matching backend code.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS login_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_failure_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS login_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS face_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS face_failure_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS face_cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS face_locked_until timestamptz;

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_login_failed_attempts_nonnegative,
  ADD CONSTRAINT accounts_login_failed_attempts_nonnegative
    CHECK (login_failed_attempts >= 0),
  DROP CONSTRAINT IF EXISTS accounts_face_failed_attempts_nonnegative,
  ADD CONSTRAINT accounts_face_failed_attempts_nonnegative
    CHECK (face_failed_attempts >= 0);

CREATE OR REPLACE FUNCTION record_login_failure(p_account_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account accounts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
  v_window_started_at timestamptz;
  v_locked_until timestamptz;
BEGIN
  SELECT * INTO v_account
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_account.login_locked_until IS NOT NULL
    AND v_account.login_locked_until > v_now THEN
    RETURN jsonb_build_object(
      'failed_attempts', v_account.login_failed_attempts,
      'locked_until', v_account.login_locked_until
    );
  END IF;

  IF v_account.login_failure_window_started_at IS NULL
    OR v_account.login_failure_window_started_at <= v_now - interval '15 minutes' THEN
    v_attempts := 1;
    v_window_started_at := v_now;
  ELSE
    v_attempts := v_account.login_failed_attempts + 1;
    v_window_started_at := v_account.login_failure_window_started_at;
  END IF;

  IF v_attempts >= 5 THEN
    v_attempts := 5;
    v_locked_until := v_now + interval '15 minutes';
  ELSE
    v_locked_until := NULL;
  END IF;

  UPDATE accounts
  SET login_failed_attempts = v_attempts,
      login_failure_window_started_at = v_window_started_at,
      login_locked_until = v_locked_until
  WHERE id = p_account_id;

  RETURN jsonb_build_object(
    'failed_attempts', v_attempts,
    'locked_until', v_locked_until
  );
END;
$$;

CREATE OR REPLACE FUNCTION complete_login_success(p_account_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account accounts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_account
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_account.login_locked_until IS NOT NULL
    AND v_account.login_locked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked_until', v_account.login_locked_until
    );
  END IF;

  UPDATE accounts
  SET login_failed_attempts = 0,
      login_failure_window_started_at = NULL,
      login_locked_until = NULL
  WHERE id = p_account_id;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

CREATE OR REPLACE FUNCTION record_face_failure(p_account_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account accounts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
  v_window_started_at timestamptz;
  v_cooldown_until timestamptz;
  v_locked_until timestamptz;
BEGIN
  SELECT * INTO v_account
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_account.face_locked_until IS NOT NULL
    AND v_account.face_locked_until > v_now THEN
    RETURN jsonb_build_object(
      'failed_attempts', v_account.face_failed_attempts,
      'cooldown_until', v_account.face_cooldown_until,
      'locked_until', v_account.face_locked_until
    );
  END IF;

  IF v_account.face_failure_window_started_at IS NULL
    OR v_account.face_failure_window_started_at <= v_now - interval '30 minutes' THEN
    v_attempts := 1;
    v_window_started_at := v_now;
  ELSE
    v_attempts := v_account.face_failed_attempts + 1;
    v_window_started_at := v_account.face_failure_window_started_at;
  END IF;

  IF v_attempts >= 10 THEN
    v_attempts := 10;
    v_locked_until := v_now + interval '15 minutes';
    v_cooldown_until := NULL;
  ELSIF v_attempts >= 5 THEN
    v_locked_until := NULL;
    v_cooldown_until := v_now + interval '30 seconds';
  ELSE
    v_locked_until := NULL;
    v_cooldown_until := NULL;
  END IF;

  UPDATE accounts
  SET face_failed_attempts = v_attempts,
      face_failure_window_started_at = v_window_started_at,
      face_cooldown_until = v_cooldown_until,
      face_locked_until = v_locked_until
  WHERE id = p_account_id;

  RETURN jsonb_build_object(
    'failed_attempts', v_attempts,
    'cooldown_until', v_cooldown_until,
    'locked_until', v_locked_until
  );
END;
$$;

CREATE OR REPLACE FUNCTION complete_face_verification_success(p_account_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account accounts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_account
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_account.face_locked_until IS NOT NULL
    AND v_account.face_locked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked_until', v_account.face_locked_until,
      'cooldown_until', NULL
    );
  END IF;

  IF v_account.face_cooldown_until IS NOT NULL
    AND v_account.face_cooldown_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked_until', NULL,
      'cooldown_until', v_account.face_cooldown_until
    );
  END IF;

  UPDATE accounts
  SET face_failed_attempts = 0,
      face_failure_window_started_at = NULL,
      face_cooldown_until = NULL,
      face_locked_until = NULL
  WHERE id = p_account_id;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE ALL ON FUNCTION record_login_failure(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_login_success(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_face_failure(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_face_verification_success(bigint) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_login_failure(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION complete_login_success(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION record_face_failure(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION complete_face_verification_success(bigint) TO service_role;
