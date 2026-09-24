-- Canonicalize the denormalized division label used by account and report views.
-- Run after the divisions table has been created. The application still keeps
-- a read fallback for older deployments that expose departments instead.

create index if not exists accounts_division_id_idx
  on public.accounts (division_id);

update public.accounts as account
set division_name = division.name
from public.divisions as division
where account.division_id = division.id
  and account.division_name is distinct from division.name;
