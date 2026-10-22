create table if not exists public.project_weekly_timeline_reports (
  project_id bigint primary key references public.intern_projects(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  weeks jsonb not null,
  revision integer not null default 1,
  updated_by bigint references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_weekly_timeline_date_range_check check (start_date <= end_date),
  constraint project_weekly_timeline_revision_check check (revision > 0),
  constraint project_weekly_timeline_weeks_array_check check (
    case
      when jsonb_typeof(weeks) = 'array' then jsonb_array_length(weeks) = 10
      else false
    end
  )
);

comment on table public.project_weekly_timeline_reports is
  'One shared 10-week timeline report per project, stored separately from uploaded project files.';

alter table public.project_weekly_timeline_reports enable row level security;
revoke all on table public.project_weekly_timeline_reports from PUBLIC, anon, authenticated, service_role;
grant select, insert, update on table public.project_weekly_timeline_reports to service_role;
