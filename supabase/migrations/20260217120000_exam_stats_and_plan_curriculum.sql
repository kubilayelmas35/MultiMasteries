-- TYT/AYT soru sayıları (konu bazlı) + planda müfredat sınıf/bölüm
alter table public.topics
  add column if not exists exam_tyt int not null default 0,
  add column if not exists exam_ayt int not null default 0;

alter table public.plan_items
  add column if not exists curriculum_grade int check (curriculum_grade is null or curriculum_grade between 9 and 12),
  add column if not exists curriculum_track text not null default '';

create index if not exists idx_topics_exam on public.topics (grade, track) where exam_tyt > 0 or exam_ayt > 0;
