# -*- coding: utf-8 -*-
"""Konu CSV'lerine ÖSYM TYT/AYT (2023-2024 ortalama) soru ağırlığı ekler."""
from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data" / "curriculum"

# TYT/AYT son oturumlarda tipik soru payları (konu anahtar kelime -> soru adedi)
# Kaynak: ÖSYM TYT/AYT test yapıları + yayın evi konu dağılım özetleri (2023-2024)
RULES: list[tuple[tuple[str, ...], int, int]] = [
    # Türkçe / Edebiyat — TYT 40 soru
    (("paragraf",), 3, 0),
    (("cümle", "anlam"), 2, 0),
    (("sözcük", "anlam"), 2, 0),
    (("yazım", "noktalama"), 2, 0),
    (("anlatım bozuk",), 2, 0),
    (("sözel mantık", "görsel"), 2, 0),
    (("fiil", "cümle", "sözcük tür"), 1, 0),
    (("şiir", "edebi", "edebiyat", "divan", "tanzimat", "roman", "hikâye", "tiyatro"), 0, 2),
    # Matematik — TYT 40, AYT Mat 40
    (("problem",), 3, 2),
    (("fonksiyon",), 2, 3),
    (("denklem", "eşitsizlik"), 2, 2),
    (("üçgen", "geometri", "çember", "analitik", "dörtgen", "katı cisim"), 2, 3),
    (("olasılık", "permütasyon", "kombinasyon", "istatistik", "veri"), 2, 2),
    (("limit", "türev", "integral", "logaritma", "dizi", "trigonometri"), 0, 3),
    (("polinom", "ikinci derece", "parabol"), 1, 2),
    (("üslü", "köklü", "rasyonel", "sayı"), 1, 1),
    # Fen — TYT Fen 20 (Fizik 7, Kimya 7, Biyoloji 6)
    (("fizik", "kuvvet", "hareket", "enerji", "elektrik", "manyetizma", "optik", "dalga", "basınç", "ısı"), 2, 1),
    (("kimya", "asit", "baz", "tepkime", "mol", "gaz", "organik", "periyodik", "atom"), 2, 2),
    (("biyoloji", "hücre", "kalıtım", "ekosistem", "sistem", "dna", "üreme", "bitki", "hayvan"), 2, 2),
    (("fen bilimleri",), 2, 0),
    # Sosyal — TYT Sosyal 20
    (("tarih", "inkılap", "osmanlı", "kurtuluş", "atatürk", "cumhuriyet", "savaş"), 1, 2),
    (("coğrafya", "harita", "iklim", "nüfus", "yerleşme"), 1, 2),
    (("felsefe",), 1, 2),
    (("din ", "hz.", "kur'an", "ibadet", "ahlak"), 1, 1),
    # İngilizce — TYT dil yok; YDT ayrı
    (("ingilizce", "grammar", "reading", "vocabulary"), 0, 0),
]

DEFAULT_TYT_BY_SUBJECT: dict[str, int] = {
    "Türkçe": 1,
    "Matematik": 1,
    "Geometri": 1,
    "Fen Bilimleri": 1,
    "Fizik": 1,
    "Kimya": 1,
    "Biyoloji": 1,
    "T.C. İnkılap Tarihi ve Atatürkçülük": 1,
    "Tarih": 1,
    "Coğrafya": 1,
    "Felsefe": 1,
    "Din Kültürü ve Ahlak Bilgisi": 1,
}

DEFAULT_AYT_BY_SUBJECT: dict[str, int] = {
    "Matematik": 1,
    "Geometri": 1,
    "Fizik": 1,
    "Kimya": 1,
    "Biyoloji": 1,
    "Türk Dili ve Edebiyatı": 1,
    "Tarih": 1,
    "Coğrafya": 1,
    "Felsefe": 1,
}


def match_rule(title: str) -> tuple[int, int]:
    t = title.lower()
    tyt = ayt = 0
    for keys, r_tyt, r_ayt in RULES:
        if all(k in t for k in keys):
            tyt = max(tyt, r_tyt)
            ayt = max(ayt, r_ayt)
    return tyt, ayt


def apply_row(subject: str, title: str, grade: int, track: str) -> tuple[int, int]:
    tyt, ayt = match_rule(title)
    if tyt == 0 and grade >= 10 and track in ("tyt", "lgs", "hepsi"):
        tyt = DEFAULT_TYT_BY_SUBJECT.get(subject, 0)
    if ayt == 0 and grade >= 11 and track in ("sayisal", "sozel", "esit", "dil"):
        ayt = DEFAULT_AYT_BY_SUBJECT.get(subject, 0)
    if ayt == 0 and grade >= 11 and track == "sayisal":
        if subject in ("Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji"):
            ayt = max(ayt, 1)
    return tyt, ayt


def main() -> None:
    for path in sorted(ROOT.glob("Topics_*.csv")):
        rows: list[dict[str, str]] = []
        with path.open(encoding="utf-8", newline="") as f:
            r = csv.DictReader(f)
            fieldnames = list(r.fieldnames or [])
            for col in ("examTyt", "examAyt"):
                if col not in fieldnames:
                    fieldnames.append(col)
            for row in r:
                grade = int(row["grade"])
                track = row["track"].strip()
                subj = row["Subject"].strip()
                title = row["title"].strip()
                tyt, ayt = apply_row(subj, title, grade, track)
                row["examTyt"] = str(tyt)
                row["examAyt"] = str(ayt)
                rows.append(row)
        with path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        print("Updated", path.name, len(rows), "topics")


if __name__ == "__main__":
    main()
