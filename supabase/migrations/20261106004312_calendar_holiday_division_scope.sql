-- A null scope applies program-wide. Keep retired division IDs scoped so a
-- division removal cannot turn an old local holiday into a program-wide one.
ALTER TABLE public.calendar_events
  ADD COLUMN holiday_division_id bigint
    CHECK (holiday_division_id IS NULL OR holiday_division_id > 0);

NOTIFY pgrst, 'reload schema';
