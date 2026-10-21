alter table public.intern_projects
  add column project_start_date date,
  add column project_target_date date,
  add constraint intern_projects_schedule_dates_check check (
    project_start_date is null
    or project_target_date is null
    or project_start_date <= project_target_date
  );
