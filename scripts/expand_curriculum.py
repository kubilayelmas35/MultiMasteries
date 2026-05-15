# -*- coding: utf-8 -*-
"""MEB 9-12 müfredat konu listelerini genişletir -> data/curriculum/Topics_*.csv"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data" / "curriculum"


def write_csv(path: Path, grade: int, track: str, rows: list[tuple[str, str, int, int]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["grade", "track", "Subject", "title", "sortOrder", "defaultMinutes"])
        for subj, title, so, dm in rows:
            w.writerow([grade, track, subj, title, so, dm])


def topics(subject: str, titles: list[str], dm: int = 45) -> list[tuple[str, str, int, int]]:
    return [(subject, t, (i + 1) * 10, dm) for i, t in enumerate(titles)]


# --- 9. sınıf LGS ---
T09_TR = [
    "Sözcükte anlam", "Cümlede anlam", "Paragraf (ana düşünce)", "Paragraf (yardımcı düşünce)",
    "Paragraf (anlatım biçimleri)", "Deyim ve atasözü", "Söz sanatları", "Yazım kuralları",
    "Noktalama işaretleri", "Fiilimsiler", "Cümlenin ögeleri", "Anlatım bozuklukları",
    "Sözel mantık / görsel okuma",
]
T09_MAT = [
    "Doğal sayılar", "Tam sayılar", "Rasyonel sayılar", "Üslü ifadeler", "Köklü ifadeler",
    "Çarpanlar ve katlar", "EBOB-EKOK", "Oran orantı", "Yüzde problemleri", "Cebirsel ifadeler",
    "Özdeşlikler", "Denklem çözme", "Doğrusal denklemler", "Eşitsizlikler", "Üçgenler",
    "Eşlik ve benzerlik", "Çember ve daire", "Veri analizi", "Olasılık (temel)", "Koordinat sistemi",
]
T09_FEN = [
    "Mevsimler ve iklim", "DNA ve genetik", "Basit makineler", "Kuvvet ve hareket", "Newton yasaları",
    "İş ve enerji", "Madde ve ısı", "Basınç", "Sıvı basıncı", "Elektrik yükleri", "Elektrik devreleri",
    "Mıknatıs ve manyetizma", "Ses ve özellikleri", "Işık ve gölge", "Aynalar ve mercekler",
]
T09_INK = [
    "Tarih ve zaman", "İnsanlığın ilk dönemleri", "İlk Türk devletleri", "İslamiyet öncesi Türk",
    "İlk Türk-İslam devletleri", "Selçuklu Türkiyesi", "Osmanlı kuruluş", "Osmanlı yükselme",
    "Kültür ve medeniyet", "Atatürk ve çağdaşlaşma (giriş)",
]
T09_DIN = ["İnanç", "İbadet", "Hz. Muhammed", "Kur'an", "Ahlak", "Hz. örnekleri", "Din ve hayat"]
T09_ING = [
    "Greetings", "Personal information", "Daily routines", "Simple present", "Present continuous",
    "Past simple", "Future (going to)", "Countable/uncountable", "Comparatives", "Directions",
    "Phone conversations", "Reading strategies",
]

# --- 10. sınıf LGS ---
T10_TR = [
    "Paragraf çıkarım", "Paragraf tamamlama", "Cümle tamamlama", "Anlatım bozuklukları",
    "Sözcük türleri", "Fiil çatıları", "Cümle türleri", "Yazım-noktalama tekrar",
    "Şiir türleri", "Edebi sanatlar", "Metin türleri",
]
T10_MAT = [
    "Fonksiyonlar", "Doğrusal fonksiyonlar", "Eşitsizlikler", "Üçgenler", "Benzerlik",
    "Dönüşüm geometrisi", "Çember", "Katı cisimler", "Olasılık", "İstatistik", "Veri yorumlama",
    "Kareköklü ifadeler", "Polinomlar (giriş)",
]
T10_FEN = [
    "Kimyasal tepkimeler", "Asit-baz", "Periyodik tablo", "Kuvvet ve enerji", "Elektrik",
    "Manyetizma", "Optik", "Üreme ve embriyo", "Kalıtım", "Ekosistem", "Enerji dönüşümleri",
]
T10_INK = [
    "Osmanlı kültür", "Aydınlanma", "Osmanlı reformları", "I. Dünya Savaşı", "Mondros",
    "Kurtuluş hazırlık", "Kongreler", "Cepheler", "Lozan", "Cumhuriyet inkılapları", "Atatürk ilkeleri",
]
T10_DIN = ["Kur'an yorumu", "Hz. Muhammed hayatı", "İslam düşüncesi", "Ahlaki değerler", "Din ve bilim"]
T10_ING = ["Modal verbs", "If clauses", "Passive voice", "Reported speech", "Relative clauses", "Phrasal verbs"]

# --- 11-12 ortak TYT Türkçe paragraf ---
TYT_TR = [
    "Paragraf ana düşünce", "Paragraf yardımcı düşünce", "Paragraf tamamlama", "Cümle tamamlama",
    "Anlatım bozuklukları", "Sözcükte anlam", "Cümlede anlam", "Yazım kuralları", "Noktalama",
    "Sözel mantık", "Görsel okuma", "Anlatım teknikleri",
]
TYT_MAT = [
    "Temel kavramlar", "Sayılar", "Bölünebilme", "Rasyonel sayılar", "Üslü", "Köklü",
    "Çarpanlara ayırma", "Oran orantı", "Problemler", "Kümeler", "Fonksiyonlar", "Polinomlar",
    "İkinci derece denklemler", "Permütasyon", "Kombinasyon", "Olasılık", "Veri",
]
TYT_FEN = [
    "Fizik hareket", "Fizik kuvvet", "Fizik enerji", "Kimya madde", "Kimya atom",
    "Kimya periyodik", "Kimya bağlar", "Biyoloji hücre", "Biyoloji sistemler", "Biyoloji ekoloji",
]

def build_lgs(grade: int) -> list[tuple[str, str, int, int]]:
    if grade == 9:
        return (
            topics("Türkçe", T09_TR)
            + topics("Matematik", T09_MAT)
            + topics("Fen Bilimleri", T09_FEN)
            + topics("T.C. İnkılap Tarihi ve Atatürkçülük", T09_INK)
            + topics("Din Kültürü ve Ahlak Bilgisi", T09_DIN, 40)
            + topics("İngilizce", T09_ING, 40)
        )
    return (
        topics("Türkçe", T10_TR)
        + topics("Matematik", T10_MAT)
        + topics("Fen Bilimleri", T10_FEN)
        + topics("T.C. İnkılap Tarihi ve Atatürkçülük", T10_INK)
        + topics("Din Kültürü ve Ahlak Bilgisi", T10_DIN, 40)
        + topics("İngilizce", T10_ING, 40)
    )


def build_sayisal(grade: int) -> list[tuple[str, str, int, int]]:
    mat = [
        "Trigonometri", "Logaritma", "Diziler", "Limit", "Türev tanım", "Türev uygulamaları",
        "İntegral", "Belirli integral", "Karmaşık sayılar", "Permütasyon kombinasyon", "Olasılık",
        "Fonksiyonler tekrar", "Polinomlar", "İkinci derece", "Eşitsizlikler", "Parabol",
    ]
    geo = [
        "Üçgenler", "Dörtgenler", "Çokgenler", "Çember", "Analitik geometri doğru",
        "Analitik geometri çember", "Katı cisimler", "Trigonometrik fonksiyonlar", "Dönüşümler",
    ]
    fiz = [
        "Vektörler", "Newton", "İş güç enerji", "Momentum", "Elektrostatik", "Elektrik akımı",
        "Manyetizma", "İndüksiyon", "Alternatif akım", "Dalgalar", "Optik", "Modern fizik giriş",
    ]
    kim = [
        "Kimyasal hesap", "Gazlar", "Çözeltiler", "Asit baz", "Tepkime hızı", "Kimyasal denge",
        "Elektrokimya", "Organik kimya temel", "Organik reaksiyonlar", "Karbon kimyası",
    ]
    bio = [
        "Sinir sistemi", "Endokrin", "Duyu organları", "Destek hareket", "Sindirim", "Solunum",
        "Dolaşım", "Boşaltım", "Üreme", "Komünite ekolojisi", "Popülasyon ekolojisi", "Biyoteknoloji",
    ]
    return (
        topics("Matematik", mat, 50)
        + topics("Geometri", geo, 50)
        + topics("Fizik", fiz, 50)
        + topics("Kimya", kim, 50)
        + topics("Biyoloji", bio, 50)
        + topics("Türkçe", TYT_TR[:8], 40)
    )


def build_sozel(grade: int) -> list[tuple[str, str, int, int]]:
    edeb = [
        "Güzel sanatlar", "Şiir türleri", "Nazım biçimleri", "Divan edebiyatı", "Halk edebiyatı",
        "Tanzimat", "Servet Fünun", "Fecr-i Ati", "Milli edebiyat", "Cumhuriyet şiiri",
        "Cumhuriyet romanı", "Tiyatro", "Deneme", "Edebi akımlar", "Metin çözümleme",
    ]
    tar = [
        "Tarih bilimi", "İlk çağ", "İlk Türk devletleri", "İslam tarihi", "Selçuklu",
        "Osmanlı kuruluş", "Osmanlı yükselme", "Osmanlı duraklama", "Osmanlı gerileme",
        "Islahatlar", "Trablus Balkan", "I. Dünya Savaşı", "Kurtuluş Savaşı", "Atatürk dönemi",
        "II. Dünya Savaşı", "Soğuk savaş", "Küreselleşme",
    ]
    cog = [
        "Harita", "İklim", "Yer şekilleri", "Nüfus", "Yerleşme", "Ekonomik faaliyetler",
        "Türkiye fiziki", "Türkiye beşeri", "Bölgeler", "Çevre", "Doğal afetler", "Küresel ortam",
    ]
    fel = [
        "Felsefeye giriş", "Bilgi felsefesi", "Varlık felsefesi", "Ahlak felsefesi",
        "Siyaset felsefesi", "Sanat felsefesi", "Din felsefesi", "Bilim felsefesi",
    ]
    return (
        topics("Türk Dili ve Edebiyatı", edeb, 50)
        + topics("Tarih", tar, 45)
        + topics("Coğrafya", cog, 45)
        + topics("Felsefe", fel, 40)
        + topics("Türkçe", TYT_TR[:8], 40)
    )


def build_esit(grade: int) -> list[tuple[str, str, int, int]]:
    mat = [
        "Fonksiyonlar", "Polinomlar", "İkinci derece", "Permütasyon", "Olasılık", "Logaritma",
        "Trigonometri", "Diziler", "Limit", "Türev", "İntegral", "Problemler",
    ]
    edeb = [
        "Şiir", "Roman", "Hikâye", "Tiyatro", "Edebi sanatlar", "Cumhuriyet edebiyatı",
        "Dünya edebiyatı", "Metin türleri",
    ]
    tar = ["Osmanlı tarihi", "Kurtuluş Savaşı", "Atatürk inkılapları", "Çağdaş Türk tarihi", "XX. yüzyıl"]
    cog = ["Fiziki coğrafya", "Beşeri coğrafya", "Türkiye coğrafyası", "Ekonomik coğrafya", "Çevre"]
    return (
        topics("Matematik", mat, 50)
        + topics("Türk Dili ve Edebiyatı", edeb, 50)
        + topics("Tarih", tar, 45)
        + topics("Coğrafya", cog, 45)
        + topics("Türkçe", TYT_TR[:8], 40)
    )


def build_dil(grade: int) -> list[tuple[str, str, int, int]]:
    return (
        topics("Türkçe ve Edebiyat", [
            "Paragraf", "Dil bilgisi", "Anlatım", "Sözcük türleri", "Yazım", "Metin türleri",
        ], 45)
        + topics("İngilizce", [
            "Grammar review", "Reading", "Writing", "Listening", "Speaking", "Use of English",
            "Translation", "Essay", "Vocabulary", "Exam strategies",
        ], 45)
        + topics("Dil ve Anlatım", [
            "Söz varlığı", "Söz türleri", "Anlatım biçimleri", "Yazılı anlatım", "Sözlü anlatım",
        ], 45)
    )


def build_tyt(grade: int) -> list[tuple[str, str, int, int]]:
    return (
        topics("Türkçe", TYT_TR, 40)
        + topics("Matematik", TYT_MAT, 45)
        + topics("Fen Bilimleri", TYT_FEN, 45)
    )


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for g in (9, 10):
        write_csv(ROOT / f"Topics_{g:02d}_lgs.csv", g, "lgs", build_lgs(g))
    builders = {
        "sayisal": build_sayisal,
        "sozel": build_sozel,
        "esit": build_esit,
        "dil": build_dil,
        "tyt": build_tyt,
    }
    for g in (11, 12):
        for track, fn in builders.items():
            write_csv(ROOT / f"Topics_{g:02d}_{track}.csv", g, track, fn(g))
    total = sum(1 for _ in ROOT.glob("Topics_*.csv"))
    print("Wrote", total, "curriculum files under", ROOT)


if __name__ == "__main__":
    main()
