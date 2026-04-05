/* =====================================================
   TNPOL DBMS PROJECT - COMPLETE DATABASE SCHEMA
   Compatible with Supabase PostgreSQL
===================================================== */

-- Enable UUID generation
create extension if not exists "pgcrypto";


/* =====================================================
   1. USERS TABLE
   Citizens, Police, Admin accounts
===================================================== */

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  phone text,
  password_hash text,
  role text default 'citizen',  -- citizen | police | admin
  created_at timestamptz default now()
);


/* =====================================================
   2. POLICE STATIONS
===================================================== */

create table if not exists police_stations (
  id serial primary key,
  station_name text not null,
  district text,
  address text,
  phone text,
  created_at timestamptz default now()
);


/* =====================================================
   3. COMPLAINTS (MAIN TABLE)
===================================================== */

create table if not exists complaints (
  id serial primary key,
  user_id uuid references users(id) on delete cascade,
  station_id integer references police_stations(id),

  title text not null,
  description text not null,
  category text,

  status text default 'submitted',
  priority text default 'normal',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


/* =====================================================
   4. COMPLAINT UPDATES (STATUS HISTORY)
===================================================== */

create table if not exists complaint_updates (
  id serial primary key,
  complaint_id integer references complaints(id) on delete cascade,
  updated_by uuid references users(id),

  message text,
  status text,

  created_at timestamptz default now()
);


/* =====================================================
   5. EVIDENCE FILES (UPLOADS)
===================================================== */

create table if not exists evidence_files (
  id serial primary key,
  complaint_id integer references complaints(id) on delete cascade,
  file_url text not null,
  uploaded_at timestamptz default now()
);


/* =====================================================
   INDEXES (Performance Optimization)
===================================================== */

create index if not exists idx_users_email
on users(email);

create index if not exists idx_complaints_user
on complaints(user_id);

create index if not exists idx_complaints_station
on complaints(station_id);

create index if not exists idx_updates_complaint
on complaint_updates(complaint_id);

create index if not exists idx_evidence_complaint
on evidence_files(complaint_id);


/* =====================================================
   DEFAULT SAMPLE DATA (OPTIONAL)
===================================================== */

insert into police_stations (station_name, district)
values
('T Nagar Police Station', 'Chennai'),
('Adyar Police Station', 'Chennai'),
('Tambaram Police Station', 'Chengalpattu')
on conflict do nothing;


/* =====================================================
   ENABLE ROW LEVEL SECURITY (IMPORTANT)
===================================================== */

alter table users enable row level security;
alter table complaints enable row level security;
alter table complaint_updates enable row level security;
alter table evidence_files enable row level security;


/* =====================================================
   TEMP DEVELOPMENT POLICIES (OPEN ACCESS)
   NOTE: Replace later with secure policies
===================================================== */

create policy "dev allow all users"
on users
for all
to public
using (true)
with check (true);

create policy "dev allow all complaints"
on complaints
for all
to public
using (true)
with check (true);

create policy "dev allow updates"
on complaint_updates
for all
to public
using (true)
with check (true);

create policy "dev allow evidence"
on evidence_files
for all
to public
using (true)
with check (true);


/* =====================================================
   DONE
===================================================== */

select 'TNPOL DATABASE READY' as status;