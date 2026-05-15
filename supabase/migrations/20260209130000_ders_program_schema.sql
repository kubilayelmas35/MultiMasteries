-- Ders programı (Wix CMS yerine Postgres)
-- Oturum ve PIN mantığı Edge Function + service role ile; tablolarda RLS açık, politika yok (anon erişemez).

create extension if not exists "pgcrypto";

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  login_code text not null unique,
  pin text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  staff_id uuid not null references public.staff (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  login_code text not null unique,
  pin text not null,
  grade int not null check (grade between 9 and 12),
  track text not null,
  school_year text not null default '',
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.student_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  student_id uuid not null references public.students (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.teacher_students (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'pending', 'revoked')),
  created_date date not null default (timezone('utc', now()))::date,
  unique (staff_id, student_id)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text,
  title text not null unique,
  color text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  grade int not null check (grade between 9 and 12),
  track text not null,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  default_minutes int not null default 45,
  unique (grade, track, subject_id, title)
);

create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  week_start date not null,
  title text not null default 'Haftalık plan',
  status text not null default 'draft',
  updated_at timestamptz not null default now(),
  unique (staff_id, student_id, week_start)
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans (id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 7),
  slot_order int not null default 1,
  start_time text not null default '',
  duration_minutes int not null default 45,
  subject_id uuid references public.subjects (id) on delete set null,
  topic_snapshot text not null default '',
  topic_ids_snapshot text not null default '',
  teacher_note text not null default '',
  importance text not null default 'normal',
  has_test boolean not null default false
);

create table public.study_logs (
  id uuid primary key default gen_random_uuid(),
  plan_item_id uuid not null references public.plan_items (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  work_date date not null,
  kanban_status text,
  mood text not null default '',
  student_note text not null default '',
  correct int not null default 0,
  wrong int not null default 0,
  blank int not null default 0,
  test_duration_minutes int not null default 0,
  actual_minutes int not null default 0,
  updated_at timestamptz not null default now(),
  unique (plan_item_id, student_id, work_date)
);

create index idx_student_sessions_token on public.student_sessions (session_token);
create index idx_staff_sessions_token on public.staff_sessions (session_token);
create index idx_students_login on public.students (login_code);
create index idx_staff_login on public.staff (login_code);
create index idx_teacher_students_staff on public.teacher_students (staff_id, status);
create index idx_teacher_students_student on public.teacher_students (student_id, status);
create index idx_weekly_plans_lookup on public.weekly_plans (student_id, status, week_start);
create index idx_plan_items_plan on public.plan_items (weekly_plan_id);
create index idx_topics_filter on public.topics (grade, track, subject_id);

alter table public.staff enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.students enable row level security;
alter table public.student_sessions enable row level security;
alter table public.teacher_students enable row level security;
alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.plan_items enable row level security;
alter table public.study_logs enable row level security;
