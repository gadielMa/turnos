alter table public.soypobre_requests
  add column if not exists country text not null default 'Argentina',
  add column if not exists province text,
  add column if not exists locality text;

create table if not exists public.soypobre_donors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  country text not null default 'Argentina',
  province text,
  locality text,
  ranking_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.soypobre_donations (
  id uuid primary key default gen_random_uuid(),
  donor_user_id uuid not null references public.soypobre_donors(user_id) on delete cascade,
  recipient_id uuid not null references public.soypobre_requests(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  receipt_url text not null,
  receipt_public_id text,
  status text not null default 'reported' check (status in ('reported', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists soypobre_donations_donor_idx on public.soypobre_donations (donor_user_id, created_at desc);
create index if not exists soypobre_donations_recipient_idx on public.soypobre_donations (recipient_id, created_at desc);

alter table public.soypobre_donors enable row level security;
alter table public.soypobre_donations enable row level security;
revoke all on public.soypobre_donors, public.soypobre_donations from anon, authenticated;
