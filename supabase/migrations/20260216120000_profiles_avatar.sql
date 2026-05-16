-- Profil fotoğrafı (data URL veya harici URL metin olarak)
alter table public.staff
  add column if not exists avatar_url text not null default '';

alter table public.students
  add column if not exists avatar_url text not null default '';
