-- Restrict direct Supabase project mutations. The Express API performs the
-- same checks with the current database account and service-role client.

drop policy if exists "Allow all authenticated users to manage projects"
on public.intern_projects;
drop policy if exists "Authorized users can create projects"
on public.intern_projects;
drop policy if exists "Authorized users can update projects"
on public.intern_projects;
drop policy if exists "Authorized users can delete projects"
on public.intern_projects;

create policy "Authorized users can create projects"
on public.intern_projects for insert to authenticated
with check (
  exists (
    select 1 from public.accounts me
    where me.email = auth.email()
      and coalesce(lower(me.status), 'active') not in ('inactive', 'disabled', 'archived')
      and (
        me.role = 'admin'
        or (me.role = 'supervisor' and intern_projects.division_id = me.division_id)
        or (
          me.role = 'intern'
          and intern_projects.leader_id = me.id
          and intern_projects.division_id is not distinct from me.division_id
        )
      )
  )
);

create policy "Authorized users can update projects"
on public.intern_projects for update to authenticated
using (
  exists (
    select 1 from public.accounts me
    where me.email = auth.email()
      and coalesce(lower(me.status), 'active') not in ('inactive', 'disabled', 'archived')
      and (
        me.role = 'admin'
        or (me.role = 'supervisor' and intern_projects.division_id = me.division_id)
        or (me.role = 'intern' and intern_projects.leader_id = me.id)
      )
  )
)
with check (
  exists (
    select 1 from public.accounts me
    where me.email = auth.email()
      and coalesce(lower(me.status), 'active') not in ('inactive', 'disabled', 'archived')
      and (
        me.role = 'admin'
        or (me.role = 'supervisor' and intern_projects.division_id = me.division_id)
        or (me.role = 'intern' and intern_projects.leader_id = me.id)
      )
  )
);

create policy "Authorized users can delete projects"
on public.intern_projects for delete to authenticated
using (
  exists (
    select 1 from public.accounts me
    where me.email = auth.email()
      and coalesce(lower(me.status), 'active') not in ('inactive', 'disabled', 'archived')
      and (
        me.role = 'admin'
        or (me.role = 'supervisor' and intern_projects.division_id = me.division_id)
        or (me.role = 'intern' and intern_projects.leader_id = me.id)
      )
  )
);

drop policy if exists "Allow all authenticated users to manage project files"
on public.project_files;
drop policy if exists "Authorized users can upload project files"
on public.project_files;
drop policy if exists "Authorized users can delete project files"
on public.project_files;

create policy "Authorized users can upload project files"
on public.project_files for insert to authenticated
with check (
  exists (
    select 1
    from public.accounts me
    join public.intern_projects project on project.id = project_files.project_id
    where me.email = auth.email()
      and project_files.uploaded_by = me.id
      and coalesce(lower(me.status), 'active') not in ('inactive', 'disabled', 'archived')
      and (
        me.role = 'admin'
        or (me.role = 'supervisor' and project.division_id = me.division_id)
        or (
          me.role = 'intern'
          and (
            project.leader_id = me.id
            or exists (
              select 1 from jsonb_array_elements(coalesce(project.members, '[]'::jsonb)) member
              where member->>'id' = me.id::text
            )
          )
        )
      )
  )
);

create policy "Authorized users can delete project files"
on public.project_files for delete to authenticated
using (
  exists (
    select 1
    from public.accounts me
    join public.intern_projects project on project.id = project_files.project_id
    where me.email = auth.email()
      and coalesce(lower(me.status), 'active') not in ('inactive', 'disabled', 'archived')
      and (
        me.role = 'admin'
        or (me.role = 'supervisor' and project.division_id = me.division_id)
        or (
          me.role = 'intern'
          and (project.leader_id = me.id or project_files.uploaded_by = me.id)
        )
      )
  )
);
