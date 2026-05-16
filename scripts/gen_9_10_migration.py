# -*- coding: utf-8 -*-
"""9-10 lgs müfredat + sınav istatistikleri için incremental migration üretir."""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "supabase" / "migrations" / "20260217120100_upsert_9_10_curriculum.sql"


def esc(s: str) -> str:
    return s.replace("'", "''")


def main() -> None:
    lines = [
        "-- 9-10 lise ortak müfredat yenileme + TYT/AYT soru sayıları",
        "delete from public.topics where grade in (9, 10) and track = 'lgs';",
        "",
    ]
    cur = ROOT / "data" / "curriculum"
    for path in sorted(cur.glob("Topics_0[9]_lgs.csv")) + sorted(cur.glob("Topics_10_lgs.csv")):
        with path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                grade = int(row["grade"])
                track = esc(row["track"].strip())
                subj = esc(row["Subject"].strip())
                title = esc(row["title"].strip())
                so = int(row["sortOrder"])
                dm = int(row["defaultMinutes"])
                et = int(row.get("examTyt") or 0)
                ea = int(row.get("examAyt") or 0)
                lines.append(
                    "insert into public.topics (grade, track, subject_id, title, sort_order, default_minutes, exam_tyt, exam_ayt) "
                    f"select {grade}, '{track}', s.id, '{title}', {so}, {dm}, {et}, {ea} "
                    f"from public.subjects s where s.title = '{subj}';"
                )
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Wrote", OUT, "lines", len(lines))


if __name__ == "__main__":
    main()
