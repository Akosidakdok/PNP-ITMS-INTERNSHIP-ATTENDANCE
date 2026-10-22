-- Repair databases where the weekly timeline table predated the revision field.
alter table public.project_weekly_timeline_reports
  add column if not exists revision integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_weekly_timeline_revision_check'
      and conrelid = 'public.project_weekly_timeline_reports'::regclass
  ) then
    alter table public.project_weekly_timeline_reports
      add constraint project_weekly_timeline_revision_check check (revision > 0);
  end if;
end
$$;
