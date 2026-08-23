create extension if not exists btree_gist;

alter table public.bookings
  add column if not exists duration_minutes smallint not null default 30
    check (duration_minutes between 15 and 240);

-- Impide reservas que se crucen, aun cuando sus horas de inicio sean distintas.
alter table public.bookings
  drop constraint if exists bookings_no_overlapping_slots;

alter table public.bookings
  add constraint bookings_no_overlapping_slots
  exclude using gist (
    business_id with =,
    tsrange(
      booking_date + booking_time,
      booking_date + booking_time + make_interval(mins => duration_minutes),
      '[)'
    ) with &&
  )
  where (status in ('pending', 'confirmed'));
