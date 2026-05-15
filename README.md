# MultiMasteries — Ders programı (Supabase + GitHub)

**Wix yok:** veri PostgreSQL (Supabase), API Supabase Edge Function (`ders-api`), arayüz statik HTML (GitHub Pages veya herhangi bir hosting).

## Supabase projesi

| | |
|---|---|
| Proje ref | `greqjbcfphmvjpfumkcy` |
| URL | `https://greqjbcfphmvjpfumkcy.supabase.co` |
| API | `POST …/functions/v1/ders-api` — gövde: `{ "action": "studentlogin", … }` |

## 1) Veritabanı

Repoda:

- `supabase/migrations/20260209130000_ders_program_schema.sql` — tablolar + RLS (anon policy yok)
- `supabase/migrations/20260209130100_seed_curriculum.sql` — dersler + konular (tam seed)
- `supabase/migrations/20260209130200_seed_topics_only.sql` — yalnızca konu INSERT’leri

Kurulum: Dashboard → **SQL Editor** → şema migration’ı, ardından seed dosyası (veya MCP ile zaten uygulandıysa atlayın).

Konu listesini CSV’den yeniden üretmek:

```bash
python scripts/gen_seed_sql.py
```

## 2) Edge Function `ders-api`

Kaynak: `supabase/functions/ders-api/index.ts`

- **verify_jwt: false** (tarayıcı `anon` anahtarı ile çağırır; PIN + service role Edge’de)
- CLI: `supabase functions deploy ders-api --no-verify-jwt`

`action` değerleri: `studentlogin`, `studentregister`, `studenttoday`, `studentsavelog`, `stafflogin`, `staffstudents`, `stafftopics`, `staffweeklyget`, `staffweeklysave`, …

## 3) Örnek kullanıcılar

`supabase/seed/sample_users.sql` — öğretmen / öğrenci / `teacher_students` (ör. `OGRETMEN1` / `OGRENCI1`).

## 4) Web arayüzü (GitHub Pages)

1. `docs/config.example.js` → `docs/config.js` kopyalayın.
2. `config.js` içine Supabase **anon** (veya publishable) anahtarını yazın (Dashboard → Project Settings → API).
3. Repo → **Settings → Pages** → Source: **Deploy from branch** → Branch `main`, folder **`/docs`**.

Yerel test: `docs/index.html` dosyasını bir statik sunucu ile açın (`config.js` aynı klasörde olmalı).

Alternatif: `apps/web/supabase-embed.html` (tek dosya; anahtarı dosya içindeki sabitlere yazın).

## 5) GitHub’a push

```powershell
cd MultiMasteries
git init
git remote add origin https://github.com/kubilayelmas35/MultiMasteries.git
git add .
git commit -m "Ders programi: Supabase schema, seed, Edge API, GitHub Pages UI"
git push -u origin main
```

`docs/config.js` ve `.env` commit edilmez (`.gitignore`).

## Mimari

- Tablolarda **RLS açık**, anon policy yok; tarayıcı doğrudan tabloya yazamaz.
- Edge Function **service role** ile yazar; oturum PIN + `student_sessions` / `staff_sessions` ile doğrulanır.
