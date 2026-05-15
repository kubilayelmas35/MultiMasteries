# -*- coding: utf-8 -*-
"""CSV -> supabase seed SQL (subjects + topics)."""
from __future__ import annotations

import csv
import sys
from pathlib import Path


def esc(s: str) -> str:
    return s.replace("'", "''")


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out = root / "supabase" / "migrations" / "20260209130100_seed_curriculum.sql"
    data = root / "data"
    subj_csv = data / "Subjects_master.csv"
    cur_dir = data / "curriculum"

    lines: list[str] = []
    lines.append("delete from public.topics;")
    lines.append("delete from public.subjects;")
    lines.append("")

    with subj_csv.open(encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            code = esc(row["code"].strip())
            title = esc(row["title"].strip())
            color = esc(row.get("color", "").strip())
            so = int(row["sortOrder"])
            lines.append(
                f"insert into public.subjects (code, title, color, sort_order) "
                f"values ('{code}', '{title}', '{color}', {so});"
            )

    lines.append("")

    for path in sorted(cur_dir.glob("Topics_*.csv")):
        with path.open(encoding="utf-8") as f:
            r = csv.DictReader(f)
            for row in r:
                grade = int(row["grade"])
                track = esc(row["track"].strip())
                subj = esc(row["Subject"].strip())
                title = esc(row["title"].strip())
                so = int(row["sortOrder"])
                dm = int(row["defaultMinutes"])
                lines.append(
                    "insert into public.topics (grade, track, subject_id, title, sort_order, default_minutes) "
                    f"select {grade}, '{track}', s.id, '{title}', {so}, {dm} "
                    f"from public.subjects s where s.title = '{subj}';"
                )

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Wrote", out, "lines", len(lines), file=sys.stderr)


if __name__ == "__main__":
    main()
