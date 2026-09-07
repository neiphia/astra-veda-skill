#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Round 0 本地排盘校验引擎 — Vedic Chart Calculator (Swiss Ephemeris).

用途：用本地 Swiss Ephemeris 计算关键度数（上升、行星、D9、Vimshottari Dasha、
Jaimini Karaka、Arudha、行运），与 Gemini 从 PDF 读取的值交叉核对。
Sandhi 边界度数（0-1° / 29-30°）不一致时以本引擎为准。

依赖：pip install pyswisseph

用法：
  python3 scripts/vedic_engine.py --example
  python3 scripts/vedic_engine.py --year 1990 --month 1 --day 1 --hour 12 --tz 0 --lat 51.5 --lon -0.13
  python3 scripts/vedic_engine.py --year 1990 --month 1 --day 1 --hour 12 --tz 0 --lat 51.5 --lon -0.13 --round0 events.json
"""

import swisseph as swe
import json
import sys
import argparse
import math

swe.set_ephe_path()
swe.set_sid_mode(swe.SIDM_LAHIRI)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SIGNS = [
    "白羊", "金牛", "双子", "巨蟹", "狮子", "处女",
    "天秤", "天蝎", "射手", "摩羯", "水瓶", "双鱼",
]
SIGNS_EN = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

EXALT = {
    "Sun": 0, "Moon": 1, "Mars": 9, "Mercury": 5,
    "Jupiter": 3, "Venus": 11, "Saturn": 6,
}
DEBIL = {
    "Sun": 6, "Moon": 7, "Mars": 3, "Mercury": 11,
    "Jupiter": 9, "Venus": 5, "Saturn": 0,
}
OWN = {
    "Sun": [4], "Moon": [3], "Mars": [0, 7], "Mercury": [2, 5],
    "Jupiter": [8, 11], "Venus": [1, 6], "Saturn": [9, 10],
}
SIGN_LORD = {
    0: "Mars", 1: "Venus", 2: "Mercury", 3: "Moon",
    4: "Sun", 5: "Mercury", 6: "Venus", 7: "Mars",
    8: "Jupiter", 9: "Saturn", 10: "Saturn", 11: "Jupiter",
}

PLANET_IDS = [
    ("Sun", swe.SUN),
    ("Moon", swe.MOON),
    ("Mars", swe.MARS),
    ("Mercury", swe.MERCURY),
    ("Jupiter", swe.JUPITER),
    ("Venus", swe.VENUS),
    ("Saturn", swe.SATURN),
    ("Rahu", swe.MEAN_NODE),
]

MD_YEARS = {
    "Ketu": 7, "Venus": 20, "Sun": 6, "Moon": 10,
    "Mars": 7, "Rahu": 18, "Jupiter": 16, "Saturn": 19, "Mercury": 17,
}
DASHA_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"]
DAY_PER_YEAR = 365.25

NAK_LORDS = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def utc_jd(birth, y=None, m=None, d=None, h=None):
    """Julian day for a given datetime in UTC."""
    y = y if y is not None else birth["year"]
    m = m if m is not None else birth["month"]
    d = d if d is not None else birth["day"]
    h_local = h if h is not None else birth["hour"]
    return swe.julday(y, m, d, h_local - birth["tz"])


def jd_to_date(jd_val):
    y, m, d, h = swe.revjul(jd_val)
    return f"{y}-{m:02d}-{d:02d}"


def sign_of(lon):
    return int(lon // 30) % 12


def deg_in_sign(lon):
    return lon % 30


def calc_planet(jd_val, pid):
    flags = swe.FLG_SIDEREAL | swe.FLG_SWIEPH
    res = swe.calc_ut(jd_val, pid, flags)
    lon = res[0][0] % 360
    speed = res[0][3]
    retro = speed < 0
    return lon, retro


def dignity(name, sign):
    """Compute planetary dignity for a given sign index."""
    if name == "Ketu":
        return "中性"
    if name in EXALT and sign == EXALT[name]:
        return "耀升Exalted"
    if name in OWN and sign in OWN[name]:
        return "入庙Own"
    if name in DEBIL and sign == DEBIL[name]:
        return "落陷Debilitated"
    return "中性"


def nakshatra(lon):
    idx = int((lon * 27) // 360) % 27
    lord = NAK_LORDS[idx % 9]
    start_deg = idx * (360 / 27)
    pos_in_nak = lon - start_deg
    span = 360 / 27
    return idx, lord, pos_in_nak, span


def navamsa_sign(lon):
    sign = int(lon // 30) % 12
    pos = lon % 30
    nak9 = int(pos / (30 / 9))
    if sign in (0, 3, 6, 9):
        start = 0
    elif sign in (1, 4, 7, 10):
        start = 4
    else:
        start = 8
    return (start + nak9) % 12


def lord_of_house(asc_sign, house_num):
    sign = (asc_sign + house_num - 1) % 12
    return SIGN_LORD[sign], sign


def arudha(house_num, asc_sign, planet_lon):
    """Calculate Arudha for a given house (1-indexed), with 1st/7th exception +10."""
    house_sign = (asc_sign + house_num - 1) % 12
    lord = SIGN_LORD[house_sign]
    if lord in planet_lon:
        ls = sign_of(planet_lon[lord])
    else:
        # Ketu
        ketu_lon = (planet_lon["Rahu"] + 180) % 360
        ls = sign_of(ketu_lon)
    d = (ls - house_sign) % 12
    if d == 0:
        d = 12
    ar = (ls + d) % 12
    # exception: if ar == house_sign or 7th from it, add 10
    if ar == house_sign or ar == (house_sign + 6) % 12:
        ar = (ar + 10) % 12
    return ar


# ---------------------------------------------------------------------------
# Core computation functions
# ---------------------------------------------------------------------------
def compute_chart(birth: dict) -> dict:
    """
    Compute D1, D9, Vimshottari Dasha, Jaimini Karaka, Lord table,
    conjunctions, exchanges, and Pancha Mahapurusha.
    """
    jd_birth = utc_jd(birth)

    # --- Ascendant ---
    houses = swe.houses(jd_birth, birth["lat"], birth["lon"], b"W")
    asc_lon = houses[1][0] % 360
    asc_sign = sign_of(asc_lon)
    ayanamsa = swe.get_ayanamsa_ut(jd_birth)

    # --- Planets ---
    planet_lon = {}
    planet_retro = {}
    for name, pid in PLANET_IDS:
        lon, retro = calc_planet(jd_birth, pid)
        planet_lon[name] = lon
        planet_retro[name] = retro

    ketu_lon = (planet_lon["Rahu"] + 180) % 360

    # --- D1 table ---
    d1_planets = []
    for name, pid in PLANET_IDS:
        lon = planet_lon[name]
        s = sign_of(lon)
        house = (s - asc_sign) % 12 + 1
        d = dignity(name, s)
        nak = nakshatra(lon)
        d1_planets.append({
            "name": name,
            "longitude": round(lon, 4),
            "sign": SIGNS[s],
            "sign_en": SIGNS_EN[s],
            "degree_in_sign": round(lon % 30, 4),
            "house": house,
            "retrograde": planet_retro[name],
            "dignity": d,
            "nakshatra": {"index": nak[0] + 1, "lord": nak[1], "position_in": round(nak[2], 4), "span": round(nak[3], 4)},
        })
    # Ketu
    ks = sign_of(ketu_lon)
    khouse = (ks - asc_sign) % 12 + 1
    d1_planets.append({
        "name": "Ketu",
        "longitude": round(ketu_lon, 4),
        "sign": SIGNS[ks],
        "sign_en": SIGNS_EN[ks],
        "degree_in_sign": round(ketu_lon % 30, 4),
        "house": khouse,
        "retrograde": planet_retro.get("Ketu", False),
        "dignity": dignity("Ketu", ks),
        "nakshatra": None,
    })

    # --- D9 (Navamsa) ---
    d9_asc_sign = navamsa_sign(asc_lon)
    d9_planets = []
    for name, pid in PLANET_IDS:
        lon = planet_lon[name]
        d9s = navamsa_sign(lon)
        d9h = (d9s - d9_asc_sign) % 12 + 1
        d1s = sign_of(lon)
        vargottama = d9s == d1s
        # KEY FIX: D9 dignity uses D9 sign, not D1 sign
        d9_dig = dignity(name, d9s)
        d9_planets.append({
            "name": name,
            "d9_sign": SIGNS[d9s],
            "d9_sign_en": SIGNS_EN[d9s],
            "d9_house": d9h,
            "d9_dignity": d9_dig,
            "vargottama": vargottama,
        })
    # Ketu D9
    kd9s = navamsa_sign(ketu_lon)
    d9_planets.append({
        "name": "Ketu",
        "d9_sign": SIGNS[kd9s],
        "d9_sign_en": SIGNS_EN[kd9s],
        "d9_house": (kd9s - d9_asc_sign) % 12 + 1,
        "d9_dignity": dignity("Ketu", kd9s),
        "vargottama": kd9s == ks,
    })

    # --- Vimshottari Dasha ---
    moon_lon = planet_lon["Moon"]
    nak = nakshatra(moon_lon)
    start_lord = nak[1]
    elapsed = nak[2] / nak[3]
    balance = 1 - elapsed
    si = DASHA_ORDER.index(start_lord)
    seq = DASHA_ORDER[si:] + DASHA_ORDER[:si]

    md_periods = []
    cur_jd = jd_birth
    for i, lord in enumerate(seq):
        dur_years = balance * MD_YEARS[lord] if i == 0 else MD_YEARS[lord]
        start_jd = cur_jd
        end_jd = cur_jd + dur_years * DAY_PER_YEAR
        md_periods.append({
            "lord": lord,
            "start": jd_to_date(start_jd),
            "end": jd_to_date(end_jd),
            "duration_years": round(dur_years, 2),
        })
        cur_jd = end_jd

    # Current MD/AD
    now_jd = utc_jd(birth, y=birth.get("now_year", 2026), m=birth.get("now_month", 9), d=birth.get("now_day", 7))
    current_md = None
    current_ad = None
    next_ad = None
    next_md = None
    for i, md in enumerate(md_periods):
        s_jd = utc_jd_for_str(birth, md["start"])
        e_jd = utc_jd_for_str(birth, md["end"])
        if s_jd <= now_jd < e_jd:
            current_md = md["lord"]
            # AD within this MD
            md_lord = md["lord"]
            adi = DASHA_ORDER.index(md_lord)
            ad_seq = DASHA_ORDER[adi:] + DASHA_ORDER[:adi]
            aj = s_jd
            for j, al in enumerate(ad_seq):
                ad_years = (MD_YEARS[md_lord] * MD_YEARS[al]) / 120.0
                ae = aj + ad_years * DAY_PER_YEAR
                if aj <= now_jd < ae:
                    current_ad = f"{md_lord}-{al}"
                    current_ad_start = jd_to_date(aj)
                    current_ad_end = jd_to_date(ae)
                    if j + 1 < len(ad_seq):
                        next_ad = f"{md_lord}-{ad_seq[j + 1]}"
                    break
                aj = ae
            if i + 1 < len(md_periods):
                next_md = md_periods[i + 1]["lord"]
            break

    # --- Jaimini Karaka (in-sign degree 0-30, Rahu/Ketu excluded) ---
    karaka_list = []
    for name, pid in PLANET_IDS:
        if name == "Rahu":
            continue
        deg = planet_lon[name] % 30
        karaka_list.append((name, deg, planet_lon[name]))
    karaka_list.sort(key=lambda x: -x[1])
    karaka_names = [
        "Atmakaraka(AK)", "Amatyakaraka(AmK)", "Bhratrikaraka(BK)", "Matrikaraka(MK)",
        "Pitrikaraka(PiK)", "Putrakaraka(PK)", "Gnatikaraka(GK)", "Darakaraka(DK)",
    ]
    karakas = []
    for i, (name, deg, lon) in enumerate(karaka_list):
        karakas.append({
            "role": karaka_names[i],
            "planet": name,
            "degree_in_sign": round(deg, 4),
            "d9_sign": SIGNS[navamsa_sign(lon)],
        })

    # --- Lord table ---
    lord_table = []
    # order: 1,2,3,5,7,9,10,11,8,12,6,4
    for h in [1, 2, 3, 5, 7, 9, 10, 11, 8, 12, 6, 4]:
        lord, sign = lord_of_house(asc_sign, h)
        if lord in planet_lon:
            ls = sign_of(planet_lon[lord])
            lh = (ls - asc_sign) % 12 + 1
        else:
            ls = sign_of(ketu_lon)
            lh = (ls - asc_sign) % 12 + 1
        lord_table.append({
            "house": h,
            "lord": lord,
            "lord_sign": SIGNS[sign],
            "flies_to_house": lh,
            "flies_to_sign": SIGNS[ls],
        })

    # --- Conjunctions (<10 deg, same sign) ---
    conjunctions = []
    names7 = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu"]
    for i, a in enumerate(names7):
        for b in names7[i + 1:]:
            if sign_of(planet_lon[a]) == sign_of(planet_lon[b]):
                diff = abs(planet_lon[a] - planet_lon[b])
                if diff > 180:
                    diff = 360 - diff
                if diff < 10:
                    conjunctions.append({
                        "planet_a": a,
                        "planet_b": b,
                        "sign": SIGNS[sign_of(planet_lon[a])],
                        "orb": round(diff, 1),
                    })

    # --- Parivartana (exchanges) ---
    exchanges = []
    for a in names7:
        for b in names7:
            if a >= b:
                continue
            sa = sign_of(planet_lon[a])
            sb = sign_of(planet_lon[b])
            if SIGN_LORD[sa] == b and SIGN_LORD[sb] == a and a != b:
                exchanges.append({
                    "planet_a": a,
                    "planet_b": b,
                    "sign_a": SIGNS[sa],
                    "sign_b": SIGNS[sb],
                })

    # --- Pancha Mahapurusha ---
    PM = {"Mars": "Ruchaka", "Mercury": "Bhadra", "Jupiter": "Hamsa", "Venus": "Malavya", "Saturn": "Sasa"}
    mahapurusha = []
    for name, yoga in PM.items():
        s = sign_of(planet_lon[name])
        h = (s - asc_sign) % 12 + 1
        d = dignity(name, s)
        present = h in (1, 4, 7, 10) and ("Own" in d or "Exalted" in d)
        mahapurusha.append({
            "yoga": yoga,
            "planet": name,
            "house": h,
            "sign": SIGNS[s],
            "dignity": d,
            "present": present,
        })

    return {
        "ascendant": {
            "longitude": round(asc_lon, 4),
            "sign": SIGNS[asc_sign],
            "sign_en": SIGNS_EN[asc_sign],
            "degree_in_sign": round(asc_lon % 30, 4),
            "ayanamsa": round(ayanamsa, 4),
            "whole_sign_house_1": SIGNS[asc_sign],
        },
        "d1_planets": d1_planets,
        "d9_ascendant": {"sign": SIGNS[d9_asc_sign], "sign_en": SIGNS_EN[d9_asc_sign]},
        "d9_planets": d9_planets,
        "dasha": {
            "moon_nakshatra": {"index": nak[0] + 1, "lord": nak[1], "elapsed_pct": round(elapsed * 100, 1), "balance_pct": round(balance * 100, 1)},
            "md_sequence": md_periods,
            "current_md": current_md,
            "current_ad": current_ad,
            "current_ad_start": current_ad_start if current_ad else None,
            "current_ad_end": current_ad_end if current_ad else None,
            "next_ad": next_ad,
            "next_md": next_md,
        },
        "karakas": karakas,
        "lord_table": lord_table,
        "conjunctions": conjunctions,
        "exchanges": exchanges,
        "mahapurusha": mahapurusha,
    }


def compute_history(birth: dict) -> dict:
    """
    Compute Arudha (AL/UL/A7/A10), full Antardasha table for all MDs,
    yearly transits (1995-2026), Saturn return, Jupiter return.
    """
    jd_birth = utc_jd(birth)
    houses = swe.houses(jd_birth, birth["lat"], birth["lon"], b"W")
    asc_lon = houses[1][0] % 360
    asc_sign = sign_of(asc_lon)

    # Planets
    planet_lon = {}
    for name, pid in PLANET_IDS:
        lon, _ = calc_planet(jd_birth, pid)
        planet_lon[name] = lon

    # --- Arudha ---
    al_sign = arudha(1, asc_sign, planet_lon)
    ul_sign = arudha(12, asc_sign, planet_lon)
    a7_sign = arudha(7, asc_sign, planet_lon)
    a10_sign = arudha(10, asc_sign, planet_lon)

    arudha_data = {
        "AL": {"house": al_sign + 1, "sign": SIGNS[al_sign], "lord": SIGN_LORD[al_sign]},
        "UL": {"house": ul_sign + 1, "sign": SIGNS[ul_sign], "lord": SIGN_LORD[ul_sign]},
        "A7": {"house": a7_sign + 1, "sign": SIGNS[a7_sign], "lord": SIGN_LORD[a7_sign]},
        "A10": {"house": a10_sign + 1, "sign": SIGNS[a10_sign], "lord": SIGN_LORD[a10_sign]},
    }

    # --- Full Antardasha table for all MDs ---
    moon_lon = planet_lon["Moon"]
    nak = nakshatra(moon_lon)
    start_lord = nak[1]
    elapsed = nak[2] / nak[3]
    balance = 1 - elapsed
    si = DASHA_ORDER.index(start_lord)
    seq = DASHA_ORDER[si:] + DASHA_ORDER[:si]

    ad_table = []
    cur_jd = jd_birth
    for i, md_lord in enumerate(seq):
        md_years = MD_YEARS[md_lord]
        md_dur = balance * md_years if i == 0 else md_years
        md_start = cur_jd
        md_end = cur_jd + md_dur * DAY_PER_YEAR

        adi = DASHA_ORDER.index(md_lord)
        ad_seq = DASHA_ORDER[adi:] + DASHA_ORDER[:adi]
        aj = md_start
        ad_entries = []
        for al in ad_seq:
            ad_years = (md_years * MD_YEARS[al]) / 120.0
            ae = aj + ad_years * DAY_PER_YEAR
            ad_entries.append({
                "ad_lord": al,
                "start": jd_to_date(aj),
                "end": jd_to_date(ae),
            })
            aj = ae
        ad_table.append({
            "md_lord": md_lord,
            "start": jd_to_date(md_start),
            "end": jd_to_date(md_end),
            "antardashas": ad_entries,
        })
        cur_jd = md_end

    # --- Yearly transits (birth_year to birth_year + 31) ---
    transits = []
    start_y = birth["year"]
    for y in range(start_y, start_y + 32):
        tjd = utc_jd(birth, y=y, m=7, d=1, h=12)
        sl = sign_of(calc_planet(tjd, swe.SATURN)[0])
        jl = sign_of(calc_planet(tjd, swe.JUPITER)[0])
        rl = sign_of(calc_planet(tjd, swe.MEAN_NODE)[0])
        kl = (rl + 6) % 12
        transits.append({
            "year": y,
            "saturn": {"sign": SIGNS[sl], "house_from_asc": (sl - asc_sign) % 12 + 1},
            "jupiter": {"sign": SIGNS[jl], "house_from_asc": (jl - asc_sign) % 12 + 1},
            "rahu": {"sign": SIGNS[rl], "house_from_asc": (rl - asc_sign) % 12 + 1},
            "ketu": {"sign": SIGNS[kl], "house_from_asc": (kl - asc_sign) % 12 + 1},
        })

    # --- Saturn return ---
    natal_sat = planet_lon["Saturn"]
    saturn_return = []
    for y in range(start_y + 27, start_y + 33):
        for m in range(1, 13):
            tjd = utc_jd(birth, y=y, m=m, d=1, h=12)
            ts = calc_planet(tjd, swe.SATURN)[0]
            if sign_of(ts) == sign_of(natal_sat) and abs(ts - natal_sat) < 2:
                saturn_return.append({
                    "date": f"{y}-{m:02d}",
                    "transit_saturn_deg": round(ts, 2),
                })

    # --- Jupiter return (every ~12 years) ---
    natal_jup = planet_lon["Jupiter"]
    jupiter_returns = []
    for y in range(start_y + 10, start_y + 37):
        found = False
        for m in range(1, 13):
            tjd = utc_jd(birth, y=y, m=m, d=15, h=12)
            ts = calc_planet(tjd, swe.JUPITER)[0]
            if sign_of(ts) == sign_of(natal_jup) and abs(ts - natal_jup) < 3:
                jupiter_returns.append({
                    "date": f"{y}-{m:02d}",
                    "transit_jupiter_deg": round(ts, 2),
                    "age": y - start_y,
                })
                found = True
                break
            if found:
                break

    return {
        "arudha": arudha_data,
        "full_ad_table": ad_table,
        "yearly_transits": transits,
        "saturn_return": saturn_return,
        "jupiter_returns": jupiter_returns,
    }


def round0(birth: dict, events: list) -> dict:
    """
    Calibration: for each event, compute MD/AD and yearly transits,
    then produce a calibration report.
    """
    chart = compute_chart(birth)
    history = compute_history(birth)

    # Build a quick lookup: year -> transit
    transit_by_year = {t["year"]: t for t in history["yearly_transits"]}

    # Build MD/AD lookup: find which period a given year falls in
    def find_md_ad(year):
        jd_evt = utc_jd(birth, y=year, m=7, d=1, h=12)
        for md in history["full_ad_table"]:
            md_s = utc_jd_for_str(birth, md["start"])
            md_e = utc_jd_for_str(birth, md["end"])
            if md_s <= jd_evt < md_e:
                for ad in md["antardashas"]:
                    ad_s = utc_jd_for_str(birth, ad["start"])
                    ad_e = utc_jd_for_str(birth, ad["end"])
                    if ad_s <= jd_evt < ad_e:
                        return md["md_lord"], ad["ad_lord"]
        return None, None

    # Sandhi check
    asc_deg = chart["ascendant"]["degree_in_sign"]
    sandhi_asc = asc_deg < 1.0 or asc_deg > 29.0
    moon_deg = None
    for p in chart["d1_planets"]:
        if p["name"] == "Moon":
            moon_deg = p["degree_in_sign"]
            break
    sandhi_moon = moon_deg is not None and (moon_deg < 1.0 or moon_deg > 29.0)

    credibility = "高"
    reasons = []
    if sandhi_asc:
        credibility = "中"
        reasons.append(f"上升度数 {asc_deg:.2f}° 处于 Sandhi 边界，±15min 可能切换星座")
    if sandhi_moon:
        credibility = "低" if sandhi_asc else "中"
        reasons.append(f"月亮度数 {moon_deg:.2f}° 处于 Sandhi 边界，大运起始星可能变化")

    event_reports = []
    for evt in events:
        year = evt["year"]
        desc = evt.get("desc", "")
        md, ad = find_md_ad(year)
        tr = transit_by_year.get(year, {})
        event_reports.append({
            "year": year,
            "description": desc,
            "md": md,
            "ad": ad,
            "transits": {
                "saturn": tr.get("saturn", {}).get("house_from_asc"),
                "jupiter": tr.get("jupiter", {}).get("house_from_asc"),
                "rahu": tr.get("rahu", {}).get("house_from_asc"),
                "ketu": tr.get("ketu", {}).get("house_from_asc"),
            },
            "match_notes": "",  # placeholder for Gemini to fill
        })

    return {
        "credibility": {
            "rating": credibility,
            "reasons": reasons if reasons else ["上升和月亮均不在 Sandhi 边界，时间可信度高"],
        },
        "events": event_reports,
        "correction_notes": "",  # placeholder for Gemini to fill
    }


def utc_jd_for_str(birth, date_str):
    """Parse 'YYYY-MM-DD' and return Julian day."""
    parts = date_str.split("-")
    y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
    return utc_jd(birth, y=y, m=m, d=d, h=12)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Round 0 Vedic Chart Engine — Swiss Ephemeris local calculation"
    )
    parser.add_argument("--year", type=int, help="Birth year")
    parser.add_argument("--month", type=int, help="Birth month")
    parser.add_argument("--day", type=int, help="Birth day")
    parser.add_argument("--hour", type=float, default=12.0, help="Birth hour (local time, decimal)")
    parser.add_argument("--tz", type=float, default=0.0, help="Timezone offset from UTC (e.g. 8 for CST)")
    parser.add_argument("--lat", type=float, default=51.5, help="Latitude")
    parser.add_argument("--lon", type=float, default=-0.13, help="Longitude")
    parser.add_argument("--example", action="store_true", help="Use fictional example birth data")
    parser.add_argument("--round0", type=str, default=None, help="Path to events.json for calibration")
    parser.add_argument("--now-year", type=int, default=2026, help="Current year for dasha calculation")
    parser.add_argument("--now-month", type=int, default=9, help="Current month")
    parser.add_argument("--now-day", type=int, default=7, help="Current day")

    args = parser.parse_args()

    if args.example:
        birth = {
            "year": 1990, "month": 1, "day": 1,
            "hour": 12.0, "tz": 0.0,
            "lat": 51.5, "lon": -0.13,
            "now_year": 2026, "now_month": 9, "now_day": 7,
        }
    else:
        birth = {
            "year": args.year, "month": args.month, "day": args.day,
            "hour": args.hour, "tz": args.tz,
            "lat": args.lat, "lon": args.lon,
            "now_year": args.now_year, "now_month": args.now_month, "now_day": args.now_day,
        }

    chart = compute_chart(birth)
    history = compute_history(birth)

    output = {
        "birth": {
            "year": birth["year"], "month": birth["month"], "day": birth["day"],
            "hour": birth["hour"], "tz": birth["tz"],
            "lat": birth["lat"], "lon": birth["lon"],
        },
        "chart": chart,
        "history": history,
    }

    if args.round0:
        with open(args.round0, "r") as f:
            events = json.load(f)
        r0 = round0(birth, events)
        output["round0"] = r0

    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()