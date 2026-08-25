-- A professional can offer long sessions. Keep a sane one-day maximum rather
-- than the former four-hour cap used by the first booking version.
alter table bookings
  drop constraint if exists bookings_duration_minutes_check;

alter table bookings
  add constraint bookings_duration_minutes_check
  check (duration_minutes between 15 and 1440);
