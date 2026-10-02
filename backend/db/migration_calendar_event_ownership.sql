-- Align direct Supabase calendar writes with the Express API's ownership rule.

drop policy if exists "Allow admins full access" on public.calendar_events;
drop policy if exists "Staff can create calendar events" on public.calendar_events;
drop policy if exists "Staff can update calendar events" on public.calendar_events;
drop policy if exists "Staff can delete calendar events" on public.calendar_events;

create policy "Staff can create calendar events"
on public.calendar_events for insert to authenticated
with check (
  exists (
    select 1 from public.accounts me
    where me.email = auth.email()
      and me.role in ('superadmin', 'admin', 'supervisor')
      and coalesce(lower(me.status), 'active') not in ('inactive', 'disabled', 'archived')
      and calendar_events.created_by = me.id
  )
);

create policy "Staff can update calendar events"
on public.calendar_events for update to authenticated
using (
  exists (
    select 1 from public.accounts me
    where me.email = auth.email()
      and coalesce(lower(me.status), 'active') not in ('inactive', 'disabled', 'archived')
      and (me.role in ('superadmin', 'admin') or (me.role = 'supervisor' and calendar_events.created_by = me.id))
  )
)
with check (
  exists (
    select 1 from public.accounts me
    where me.email = auth.email()
      and coalesce(lower(me.status), 'active') not in ('inactive', 'disabled', 'archived')
      and (me.role in ('superadmin', 'admin') or (me.role = 'supervisor' and calendar_events.created_by = me.id))
  )
);

create policy "Staff can delete calendar events"
on public.calendar_events for delete to authenticated
using (
  exists (
    select 1 from public.accounts me
    where me.email = auth.email()
      and coalesce(lower(me.status), 'active') not in ('inactive', 'disabled', 'archived')
      and (me.role in ('superadmin', 'admin') or (me.role = 'supervisor' and calendar_events.created_by = me.id))
  )
);
