-- Örnek öğretmen + öğrenci + bağlantı (UUID'ler çalışma anında üretilir; tek seferlik çalıştırın.)
-- Giriş kodlarını ve PIN'leri kendi değerlerinizle değiştirin.

insert into public.staff (title, login_code, pin, active)
values ('Örnek Öğretmen', 'OGRETMEN1', 'PIN12345', true)
on conflict (login_code) do nothing;

insert into public.students (title, login_code, pin, grade, track, school_year, active)
values ('Örnek Öğrenci', 'OGRENCI1', 'PIN12345', 11, 'sayisal', '2025-2026', true)
on conflict (login_code) do nothing;

insert into public.teacher_students (staff_id, student_id, status)
select s.id, st.id, 'active'
from public.staff s
cross join public.students st
where s.login_code = 'OGRETMEN1' and st.login_code = 'OGRENCI1'
on conflict (staff_id, student_id) do nothing;
