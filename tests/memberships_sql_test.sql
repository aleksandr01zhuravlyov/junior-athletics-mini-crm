-- Membership SQL flow tests. Run against a THROWAWAY database (never your real Supabase):
--   tests/run_sql_tests.sh
-- Stubs the existing tables, loads supabase/memberships.sql, then asserts behaviour.
\set ON_ERROR_STOP on
create role authenticated nologin;   -- exists in Supabase; stub for a plain Postgres
create table public.students  (id uuid primary key default gen_random_uuid(), first_name text,
                               membership_type text not null default 'x', sessions_remaining int not null default 0);
\i supabase/trainings_attendance.sql
\i supabase/memberships.sql
-- run it twice: a re-run must be safe
\i supabase/memberships.sql

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;

create function pg_temp.remaining(m uuid) returns int language sql as
  $$ select sessions_remaining from public.memberships where id = m $$;
create function pg_temp.mstatus(m uuid) returns text language sql as
  $$ select status from public.memberships where id = m $$;
create function pg_temp.charges(m uuid) returns bigint language sql as
  $$ select count(*) from public.membership_charges where membership_id = m $$;

-- upsert exactly like the app does (supabase-js .upsert onConflict training_id,student_id)
create function pg_temp.mark(t uuid, s uuid, st text) returns void language sql as $$
  insert into public.attendance (training_id, student_id, status) values (t, s, st)
  on conflict (training_id, student_id) do update
    set training_id = excluded.training_id, student_id = excluded.student_id, status = excluded.status
$$;

do $$
declare
  s uuid; s2 uuid; flex uuid; unl uuid; t1 uuid; t2 uuid; t3 uuid; old_flex uuid; m2 uuid; a1 uuid;
begin
  insert into public.students (first_name) values ('Ann') returning id into s;
  insert into public.students (first_name) values ('Bob') returning id into s2;
  insert into public.trainings (training_date, start_time, end_time, name) values
    (current_date, '17:00', '18:00', 'T1') returning id into t1;
  insert into public.trainings (training_date, start_time, end_time, name) values
    (current_date + 1, '17:00', '18:00', 'T2') returning id into t2;
  insert into public.trainings (training_date, start_time, end_time, name) values
    (current_date + 2, '17:00', '18:00', 'T3') returning id into t3;

  -- 1. flex starts with all sessions; monthly has no counter
  insert into public.memberships (student_id, membership_type, start_date, expiration_date, sessions_purchased, price)
    values (s, 'flex_5', current_date - 5, current_date + 60, 5, 100) returning id into flex;
  perform pg_temp.assert(pg_temp.remaining(flex) = 5, 'flex starts at 5');
  insert into public.memberships (student_id, membership_type, start_date, expiration_date, price)
    values (s2, 'monthly_unlimited', current_date - 5, current_date + 25, 80) returning id into unl;
  perform pg_temp.assert((select sessions_remaining is null from public.memberships where id = unl), 'unlimited: no counter');

  -- 2. Present subtracts one
  perform pg_temp.mark(t1, s, 'present');
  perform pg_temp.assert(pg_temp.remaining(flex) = 4, 'present -> 4');

  -- 3. Present twice (as upsert, and as plain repeat) does NOT subtract twice
  perform pg_temp.mark(t1, s, 'present');
  perform pg_temp.mark(t1, s, 'present');
  perform pg_temp.assert(pg_temp.remaining(flex) = 4, 'present x3 still 4');
  perform pg_temp.assert(pg_temp.charges(flex) = 1, 'one ledger row');

  -- 4. Present -> Absent returns the session; Absent twice gives nothing extra
  perform pg_temp.mark(t1, s, 'absent');
  perform pg_temp.assert(pg_temp.remaining(flex) = 5, 'absent -> 5');
  perform pg_temp.mark(t1, s, 'absent');
  perform pg_temp.assert(pg_temp.remaining(flex) = 5, 'absent twice still 5 (never above purchased)');
  perform pg_temp.assert(pg_temp.charges(flex) = 0, 'ledger empty');

  -- 5. Absent -> Present charges again
  perform pg_temp.mark(t1, s, 'present');
  perform pg_temp.assert(pg_temp.remaining(flex) = 4, 'absent->present -> 4');

  -- 6. Absent as first mark never charges
  perform pg_temp.mark(t2, s, 'absent');
  perform pg_temp.assert(pg_temp.remaining(flex) = 4, 'first mark absent: no charge');

  -- 7. monthly unlimited: Present changes nothing, no error
  perform pg_temp.mark(t1, s2, 'present');
  perform pg_temp.assert((select sessions_remaining is null from public.memberships where id = unl), 'unlimited untouched');
  perform pg_temp.assert(pg_temp.charges(unl) = 0, 'no ledger for unlimited');

  -- 8. deleting a present attendance row (e.g. training deleted) refunds
  delete from public.trainings where id = t1;
  perform pg_temp.assert(pg_temp.remaining(flex) = 5, 'training deleted -> refunded');

  -- 9. use everything up: status flips to used_up, never below 0, extra Present is free
  insert into public.trainings (training_date, start_time, end_time, name)
    select current_date + g, '10:00', '11:00', 'X' || g from generate_series(10, 16) g;
  for t1 in select id from public.trainings where name like 'X%' order by training_date loop
    perform pg_temp.mark(t1, s, 'present');
  end loop;
  perform pg_temp.assert(pg_temp.remaining(flex) = 0, 'never below 0 (7 presents, 5 sessions)');
  perform pg_temp.assert(pg_temp.mstatus(flex) = 'used_up', 'used_up at 0');
  perform pg_temp.assert(pg_temp.charges(flex) = 5, '5 charged, 2 uncharged');

  -- 10. refund of a charged one reactivates it
  select a.id into a1 from public.attendance a join public.membership_charges c on c.attendance_id = a.id
   where a.student_id = s limit 1;
  update public.attendance set status = 'absent' where id = a1;
  perform pg_temp.assert(pg_temp.remaining(flex) = 1 and pg_temp.mstatus(flex) = 'active', 'refund -> active again');

  -- 11. direct write that would violate the counter is rejected by the constraint
  begin
    update public.memberships set sessions_remaining = -1 where id = flex;
    raise exception 'ASSERTION FAILED: negative sessions accepted';
  exception when check_violation then null; end;

  -- 12. expired / not-yet-started / cancelled memberships are never charged
  insert into public.students (first_name) values ('Cy') returning id into s;
  insert into public.memberships (student_id, membership_type, start_date, expiration_date, sessions_purchased)
    values (s, 'flex_10', current_date - 90, current_date - 1, 10) returning id into old_flex;
  insert into public.trainings (training_date, start_time, end_time, name)
    values (current_date, '09:00', '10:00', 'today') returning id into t3;
  perform pg_temp.mark(t3, s, 'present');
  perform pg_temp.assert(pg_temp.remaining(old_flex) = 10, 'expired membership not charged');
  perform pg_temp.assert(public.membership_effective_status('active', current_date - 1) = 'expired', 'effective expired');
  perform pg_temp.assert(public.membership_effective_status('active', current_date) = 'active', 'active on last day');
  perform pg_temp.assert(public.membership_effective_status('cancelled', current_date - 1) = 'cancelled', 'cancelled stays');

  -- 13. full history: a second membership; the soonest-expiring valid one is charged first
  insert into public.memberships (student_id, membership_type, start_date, expiration_date, sessions_purchased)
    values (s, 'flex_5', current_date - 2, current_date + 30, 5) returning id into m2;
  perform pg_temp.mark(t3, s, 'present');
  perform pg_temp.assert(pg_temp.remaining(m2) = 4 and pg_temp.remaining(old_flex) = 10, 'new pack charged, old untouched');
  perform pg_temp.assert((select count(*) from public.memberships where student_id = s) = 2, 'history kept');
  -- cancelled -> not charged
  update public.memberships set status = 'cancelled' where id = m2;
  insert into public.trainings (training_date, start_time, end_time, name)
    values (current_date, '11:00', '12:00', 'today2') returning id into t2;
  perform pg_temp.mark(t2, s, 'present');
  perform pg_temp.assert(pg_temp.remaining(m2) = 4, 'cancelled not charged');
  -- refund still goes to the membership that was charged (even though cancelled)
  perform pg_temp.mark(t3, s, 'absent');
  perform pg_temp.assert(pg_temp.remaining(m2) = 5 and pg_temp.mstatus(m2) = 'cancelled', 'refund to charged membership');

  -- 14. constraints: monthly with counter rejected, flex without counter rejected
  begin
    insert into public.memberships (student_id, membership_type, start_date, expiration_date, sessions_purchased)
      values (s, 'monthly_1x', current_date, current_date + 30, 4);
    raise exception 'ASSERTION FAILED: monthly with counter accepted';
  exception when check_violation then null; end;
  begin
    insert into public.memberships (student_id, membership_type, start_date, expiration_date)
      values (s, 'flex_10', current_date, current_date + 30);
    raise exception 'ASSERTION FAILED: flex without counter accepted';
  exception when check_violation then null; end;

  -- 15. deleting a student cascades cleanly
  delete from public.students where id = s;
  raise notice 'ALL MEMBERSHIP SQL TESTS PASSED';
end $$;
