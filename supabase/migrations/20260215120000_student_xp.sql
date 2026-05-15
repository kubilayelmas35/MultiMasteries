-- Öğrenci ilerleme (XP + karakter aşaması)
alter table public.students
  add column if not exists xp int not null default 0,
  add column if not exists character_stage int not null default 0;
