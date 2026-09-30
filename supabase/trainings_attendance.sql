-- Trainings + Attendance module
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run (uses "if not exists" / drop policy if exists).
-- Requires the existing public.students table (id uuid primary key).

-- 1. TRAININGS: one row per training session on a real calendar date
create table if not exists public.trainings (
  id            uuid primary key default gen_random_uuid(),
  training_date date not null,
  start_time    time not null,
  end_time      time not null,
  name          text not null,                       -- training name / group
  coach         text not null default '',
  location      text not null default '',
  status        text not null default 'scheduled'
                check (status in ('scheduled', 'completed', 'cancelled')),
  created_at    timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists trainings_date_idx
  on public.trainings (training_date, start_time);

-- 2. ATTENDANCE: one row per (student, training) pair
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  status      text not null check (status in ('present', 'absent')),
  created_at  timestamptz not null default now(),
  unique (training_id, student_id)   -- a student can be marked only once per training
);

-- unique (training_id, student_id) already indexes lookups by training_id;
-- this index makes "attendance history of one student" fast.
create index if not exists attendance_student_idx
  on public.attendance (student_id);

-- 3. ROW LEVEL SECURITY: only logged-in staff can touch these tables
alter table public.trainings  enable row level security;
alter table public.attendance enable row level security;

drop policy if exists "Authenticated users manage trainings" on public.trainings;
create policy "Authenticated users manage trainings"
  on public.trainings for all to authenticated
  using (true) with check (true);

drop policy if exists "Authenticated users manage attendance" on public.attendance;
create policy "Authenticated users manage attendance"
  on public.attendance for all to authenticated
  using (true) with check (true);
