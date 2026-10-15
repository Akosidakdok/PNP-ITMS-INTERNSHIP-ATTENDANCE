-- Apply before deploying the backend session code.
CREATE TABLE IF NOT EXISTS public.account_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id bigint NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_sessions_account_id_idx ON public.account_sessions(account_id);

ALTER TABLE public.account_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_sessions TO service_role;
