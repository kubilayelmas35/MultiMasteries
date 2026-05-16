# -*- coding: utf-8 -*-
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "supabase" / "migrations" / "20260217120200_exam_stats_all_grades.sql"


def esc(s: str) -> str:
    return s.replace("'", "''")


def main() -> None:
    lines = ["-- TYT/AYT soru sayılarını tüm müfredat konularına uygula", ""]
    for path in sorted((ROOT / "data" / "curriculum").glob("Topics_*.csv")):
        with path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                g = int(row["grade"])
                track = esc(row["track"].strip())
                subj = esc(row["Subject"].strip())
                title = esc(row["title"].strip())
                et = int(row.get("examTyt") or 0)
                ea = int(row.get("examAyt") or 0)
                lines.append(
                    "update public.topics t set exam_tyt = " + str(et) + ", exam_ayt = " + str(ea) +
                    " from public.subjects s where t.subject_id = s.id and s.title = '" + subj +
                    "' and t.grade = " + str(g) + " and t.track = '" + track +
                    "' and t.title = '" + title + "';"
                )
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Wrote", OUT, len(lines), "lines")


if __name__ == "__main__":
    main()
