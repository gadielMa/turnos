alter table public.soypobre_requests
  add column if not exists name text;

alter table public.soypobre_requests
  drop constraint if exists soypobre_requests_name_check;

alter table public.soypobre_requests
  add constraint soypobre_requests_name_check
  check (name is null or char_length(name) <= 100);
