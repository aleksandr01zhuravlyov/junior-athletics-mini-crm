-- Memberships module
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run (uses "if not exists" / "create or replace" / drop ... if exists).
-- Requires the existing tables: public.students, public.trainings, public.attendance
-- (run supabase/trainings_attendance.sql first).
--
-- HOW IT WORKS
--   memberships         one row per purchased membership (full history, never overwritten)
--   membership_charges  ledger: "this attendance row used one session of this membership".
--                       attendance_id is the PRIMARY KEY, so one attendance row can be
--                       charged at most once -> no double deduction, ever.
--   attendance trigger  Present  -> charge one session (only if not charged yet)
--                       Absent / row deleted -> give the session back
--   "expired" is NOT stored: the app shows a membership as expired whenever
--   expiration_date is in the past (see public.membership_effective_status).

-- 1. MEMBERSHIPS
create table if not exists public.memberships (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students (id) on delete cascade,
  membership_type    text not null
                     check (membership_type in
                       ('monthly_unlimited', 'monthly_1x', 'flex_5', 'flex_10', 'custom')),
  start_date         date not null,
  expiration_date    date not null,
  sessions_purchased integer,            -- NULL for monthly types (no counter)
  sessions_remaining integer,            -- NULL for monthly types (no counter)
  price              numeric(10, 2) not null default 0 check (price >= 0),
  status             text not null default 'active'
                     check (status in ('active', 'expired', 'used_up', 'cancelled')),
  created_at         timestamptz not null default now(),
  check (expiration_date >= start_date),
  -- counter columns are both set or both empty
  check ((sessions_purchased is null) = (sessions_remaining is null)),
  check (sessions_purchased is null or sessions_purchased > 0),
  -- sessions can never go below 0 (or above what was purchased)
  check (sessions_remaining is null
         or (sessions_remaining >= 0 and sessions_remaining <= sessions_purchased)),
  -- monthly types have no counter; flex types must have one; custom may have one
  check (membership_type not in ('monthly_unlimited', 'monthly_1x') or sessions_purchased is null),
  check (membership_type not in ('flex_5', 'flex_10') or sessions_purchased is not null)
);

create index if not exists memberships_student_idx
  on public.memberships (student_id, start_date desc);

-- 2. CHARGES LEDGER (written only by the trigger below)
create table if not exists public.membership_charges (
  attendance_id uuid primary key references public.attendance (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index if not exists membership_charges_membership_idx
  on public.membership_charges (membership_id);

-- 3. STATUS HELPERS
-- Effective status = what the app should display today.
create or replace function public.membership_effective_status(p_status text, p_expiration date)
returns text language sql stable as $$
  select case
    when p_status = 'active' and p_expiration < current_date then 'expired'
    else p_status
  end
$$;

-- Keeps the stored counter and status consistent on every insert/update:
--   new membership starts with all purchased sessions remaining,
--   0 left -> used_up, sessions given back -> active again. 'cancelled' is never changed here.
create or replace function public.memberships_normalize()
returns trigger language plpgsql as $$
begin
  if new.sessions_purchased is not null and new.sessions_remaining is null then
    new.sessions_remaining := new.sessions_purchased;
  end if;

  if new.sessions_remaining is not null then
    if new.status = 'active' and new.sessions_remaining = 0 then
      new.status := 'used_up';
    elsif new.status = 'used_up' and new.sessions_remaining > 0 then
      new.status := 'active';
    end if;
  elsif new.status = 'used_up' then
    new.status := 'active';   -- no counter, so it cannot be used up
  end if;
  return new;
end $$;

drop trigger if exists memberships_normalize_trg on public.memberships;
create trigger memberships_normalize_trg
  before insert or update on public.memberships
  for each row execute function public.memberships_normalize();

-- 4. ATTENDANCE -> MEMBERSHIP SESSIONS
-- SECURITY DEFINER so the ledger needs no write access for app users.
-- AFTER trigger (not BEFORE): an upsert that turns into an UPDATE must not be charged as an INSERT.
create or replace function public.attendance_sync_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_membership uuid;
  v_date       date;
  v_rows       integer;
begin
  -- Give back the session if this attendance row was charged (row deleted, or not Present any more).
  if tg_op = 'DELETE' then
    delete from public.membership_charges where attendance_id = old.id
    returning membership_id into v_membership;
  elsif new.status <> 'present' then
    delete from public.membership_charges where attendance_id = new.id
    returning membership_id into v_membership;
  end if;

  if tg_op = 'DELETE' or new.status <> 'present' then
    if v_membership is not null then
      update public.memberships
         set sessions_remaining = least(sessions_purchased, sessions_remaining + 1)
       where id = v_membership;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Present: already charged? then nothing to do (Present twice never deducts twice).
  if exists (select 1 from public.membership_charges where attendance_id = new.id) then
    return new;
  end if;

  select training_date into v_date from public.trainings where id = new.training_id;

  -- Usable membership on the training date: active, not cancelled/used up, has sessions.
  -- Soonest expiring first. FOR UPDATE serialises concurrent charges on the same membership.
  select id into v_membership
    from public.memberships
   where student_id = new.student_id
     and status = 'active'
     and sessions_remaining > 0
     and start_date <= v_date
     and expiration_date >= v_date
   order by expiration_date, created_at
   limit 1
   for update;

  if v_membership is null then
    return new;   -- monthly or no pack: nothing to deduct
  end if;

  -- The primary key on attendance_id is the double-deduction guard.
  insert into public.membership_charges (attendance_id, membership_id)
  values (new.id, v_membership)
  on conflict (attendance_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    update public.memberships
       set sessions_remaining = sessions_remaining - 1
     where id = v_membership and sessions_remaining > 0;
    if not found then   -- cannot happen (row is locked), but never go below 0
      delete from public.membership_charges where attendance_id = new.id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists attendance_sync_membership_ins on public.attendance;
create trigger attendance_sync_membership_ins
  after insert on public.attendance
  for each row execute function public.attendance_sync_membership();

drop trigger if exists attendance_sync_membership_upd on public.attendance;
create trigger attendance_sync_membership_upd
  after update of status on public.attendance
  for each row execute function public.attendance_sync_membership();

-- BEFORE DELETE so the refund also runs when a training/student delete cascades to attendance.
drop trigger if exists attendance_sync_membership_del on public.attendance;
create trigger attendance_sync_membership_del
  before delete on public.attendance
  for each row execute function public.attendance_sync_membership();

-- 5. ROW LEVEL SECURITY: only logged-in staff. No DELETE policy on memberships = history is kept
--    (cancel a membership instead). The ledger is read-only for the app.
alter table public.memberships        enable row level security;
alter table public.membership_charges enable row level security;

drop policy if exists "Authenticated users read memberships" on public.memberships;
create policy "Authenticated users read memberships"
  on public.memberships for select to authenticated using (true);

drop policy if exists "Authenticated users add memberships" on public.memberships;
create policy "Authenticated users add memberships"
  on public.memberships for insert to authenticated with check (true);

drop policy if exists "Authenticated users update memberships" on public.memberships;
create policy "Authenticated users update memberships"
  on public.memberships for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users read membership charges" on public.membership_charges;
create policy "Authenticated users read membership charges"
  on public.membership_charges for select to authenticated using (true);

-- 6. OLD STUDENT COLUMNS
-- The Students form no longer writes students.membership_type / sessions_remaining
-- (memberships replaces them). Make sure they cannot block adding a student.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'students' and column_name = 'membership_type') then
    alter table public.students alter column membership_type drop not null;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'students' and column_name = 'sessions_remaining') then
    alter table public.students alter column sessions_remaining drop not null;
  end if;
end $$;
