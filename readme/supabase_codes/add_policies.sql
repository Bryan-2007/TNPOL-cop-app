/* =========================================================
   TNPOL FULL RLS + POLICIES SETUP
   Run this in Supabase SQL Editor
========================================================= */

/* -----------------------------
   ENABLE RLS ON ALL TABLES
----------------------------- */

alter table public.users enable row level security;
alter table public.police_stations enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_updates enable row level security;
alter table public.evidence_files enable row level security;


/* =========================================================
   USERS TABLE POLICIES
========================================================= */

drop policy if exists "Allow insert for all" on public.users;
drop policy if exists "Allow select for all" on public.users;
drop policy if exists "Allow update for all" on public.users;
drop policy if exists "Allow delete for all" on public.users;

create policy "Allow insert for all"
on public.users
for insert
to public
with check (true);

create policy "Allow select for all"
on public.users
for select
to public
using (true);

create policy "Allow update for all"
on public.users
for update
to public
using (true)
with check (true);

create policy "Allow delete for all"
on public.users
for delete
to public
using (true);


/* =========================================================
   POLICE STATIONS TABLE POLICIES
========================================================= */

drop policy if exists "Allow station insert" on public.police_stations;
drop policy if exists "Allow station select" on public.police_stations;
drop policy if exists "Allow station update" on public.police_stations;
drop policy if exists "Allow station delete" on public.police_stations;

create policy "Allow station insert"
on public.police_stations
for insert
to public
with check (true);

create policy "Allow station select"
on public.police_stations
for select
to public
using (true);

create policy "Allow station update"
on public.police_stations
for update
to public
using (true)
with check (true);

create policy "Allow station delete"
on public.police_stations
for delete
to public
using (true);


/* =========================================================
   COMPLAINTS TABLE POLICIES
========================================================= */

drop policy if exists "Allow complaint insert" on public.complaints;
drop policy if exists "Allow complaint select" on public.complaints;
drop policy if exists "Allow complaint update" on public.complaints;
drop policy if exists "Allow complaint delete" on public.complaints;

create policy "Allow complaint insert"
on public.complaints
for insert
to public
with check (true);

create policy "Allow complaint select"
on public.complaints
for select
to public
using (true);

create policy "Allow complaint update"
on public.complaints
for update
to public
using (true)
with check (true);

create policy "Allow complaint delete"
on public.complaints
for delete
to public
using (true);


/* =========================================================
   COMPLAINT UPDATES TABLE POLICIES
========================================================= */

drop policy if exists "Allow update insert" on public.complaint_updates;
drop policy if exists "Allow update select" on public.complaint_updates;
drop policy if exists "Allow update update" on public.complaint_updates;
drop policy if exists "Allow update delete" on public.complaint_updates;

create policy "Allow update insert"
on public.complaint_updates
for insert
to public
with check (true);

create policy "Allow update select"
on public.complaint_updates
for select
to public
using (true);

create policy "Allow update update"
on public.complaint_updates
for update
to public
using (true)
with check (true);

create policy "Allow update delete"
on public.complaint_updates
for delete
to public
using (true);


/* =========================================================
   EVIDENCE FILES TABLE POLICIES
========================================================= */

drop policy if exists "Allow evidence insert" on public.evidence_files;
drop policy if exists "Allow evidence select" on public.evidence_files;
drop policy if exists "Allow evidence update" on public.evidence_files;
drop policy if exists "Allow evidence delete" on public.evidence_files;

create policy "Allow evidence insert"
on public.evidence_files
for insert
to public
with check (true);

create policy "Allow evidence select"
on public.evidence_files
for select
to public
using (true);

create policy "Allow evidence update"
on public.evidence_files
for update
to public
using (true)
with check (true);

create policy "Allow evidence delete"
on public.evidence_files
for delete
to public
using (true);


/* =========================================================
   OPTIONAL SAMPLE DATA FOR POLICE STATIONS
========================================================= */

insert into public.police_stations
(station_name, district, address, phone)
values
('T Nagar Police Station', 'Chennai', 'T Nagar, Chennai', '044-10000001'),
('Adyar Police Station', 'Chennai', 'Adyar, Chennai', '044-10000002'),
('Tambaram Police Station', 'Chengalpattu', 'Tambaram, Chennai', '044-10000003')
on conflict do nothing;


/* =========================================================
   VERIFY
========================================================= */

select
  schemaname,
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;