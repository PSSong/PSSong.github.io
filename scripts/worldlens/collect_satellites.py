#!/usr/bin/env python3
"""
WorldLens satellite position collector.

Fetches TLE data from Celestrak public endpoints, computes current geodetic
positions using SGP4 propagation, and writes static/worldlens/positions.json
in the schema expected by the frontend.

Usage:
    python scripts/worldlens/collect_satellites.py
"""
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from sgp4.api import Satrec, jday

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT = REPO_ROOT / "static" / "worldlens" / "positions.json"

# Celestrak public TLE endpoints — no API key required.
# Keys are used only for log labels; order determines fetch priority.
TLE_SOURCES: dict[str, str] = {
    "stations": "https://celestrak.org/pub/TLE/stations.txt",
    "weather":  "https://celestrak.org/pub/TLE/weather.txt",
    "gps-ops":  "https://celestrak.org/pub/TLE/gps-ops.txt",
    "glonass":  "https://celestrak.org/pub/TLE/glonass-ops.txt",
    "galileo":  "https://celestrak.org/pub/TLE/galileo.txt",
    "beidou":   "https://celestrak.org/pub/TLE/beidou.txt",
    "geo":      "https://celestrak.org/pub/TLE/geo.txt",
    "science":  "https://celestrak.org/pub/TLE/science.txt",
    "military": "https://celestrak.org/pub/TLE/military.txt",
}

MAX_PER_CATEGORY = 60
MAX_TOTAL        = 500

# ── Country classification by name keyword ─────────────────────────────────

_NAME_COUNTRY: dict[str, str] = {
    # Russia
    "COSMOS":    "RU", "GLONASS":   "RU", "YAMAL":     "RU",
    "EXPRESS":   "RU", "RESURS":    "RU", "MERIDIAN":  "RU",
    "EKS":       "RU", "LOTOS":     "RU",
    # USA
    "GPS":       "US", "NAVSTAR":   "US", "STARLINK":  "US",
    "GOES":      "US", "NOAA":      "US", "LANDSAT":   "US",
    "TERRA":     "US", "AQUA":      "US", "IRIDIUM":   "US",
    "GLOBALSTAR":"US", "ORBCOMM":   "US", "WGS":       "US",
    "MILSTAR":   "US", "AEHF":      "US", "MUOS":      "US",
    "SBIRS":     "US", "DSP":       "US",
    # Europe
    "GALILEO":   "EU", "METEOSAT":  "EU", "EUTELSAT":  "EU",
    "ENVISAT":   "EU", "SENTINEL":  "EU", "MSG":       "EU",
    "ESEO":      "EU",
    # China
    "BEIDOU":    "CN", "COMPASS":   "CN", "FENGYUN":   "CN",
    "YAOGAN":    "CN", "CHINASAT":  "CN", "APSTAR":    "CN",
    "TIANGONG":  "CN", "TIANHE":    "CN", "SHIYAN":    "CN",
    # Japan
    "QZSS":      "JP", "MICHIBIKI": "JP", "HIMAWARI":  "JP",
    "ALOS":      "JP",
    # India
    "IRNSS":     "IN", "NAVIC":     "IN", "CARTOSAT":  "IN",
    "INSAT":     "IN", "GSAT":      "IN",
    # Multinational
    "ISS":          "MULTINATIONAL",
    "ZARYA":        "MULTINATIONAL",
    "NAUKA":        "MULTINATIONAL",
    # International
    "INTELSAT":  "INTL", "SES":      "LU", "ONEWEB":   "INTL",
}

_MILITARY_HINTS = frozenset([
    "WGS", "MILSTAR", "AEHF", "MUOS", "SBIRS", "DSP",
    "YAOGAN", "SHIYAN", "EKS", "LOTOS",
])


def classify_satellite(name: str) -> tuple[str, str]:
    name_up = name.upper()
    country = "UNKNOWN"
    for keyword, cty in _NAME_COUNTRY.items():
        if keyword in name_up:
            country = cty
            break
    cls = "military" if any(h in name_up for h in _MILITARY_HINTS) else "civilian"
    return cls, country


# ── TLE fetch & parse ──────────────────────────────────────────────────────

def fetch_tle_triples(url: str) -> list[tuple[str, str, str]]:
    """Return list of (name, line1, line2) from a Celestrak TLE file."""
    resp = requests.get(
        url,
        timeout=30,
        headers={"User-Agent": "WorldLens/1.0 (+https://github.com/PSSong/pssong-blog)"},
    )
    resp.raise_for_status()
    lines = [ln.rstrip() for ln in resp.text.splitlines() if ln.strip()]
    result = []
    i = 0
    while i + 2 < len(lines):
        name = lines[i].strip()
        l1   = lines[i + 1]
        l2   = lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 "):
            result.append((name, l1, l2))
            i += 3
        else:
            i += 1
    return result


# ── SGP4 propagation ───────────────────────────────────────────────────────

def _gmst_rad(jd_total: float) -> float:
    """Greenwich Mean Sidereal Time in radians (±0.1° accuracy for visualization)."""
    d = jd_total - 2451545.0
    deg = (280.46061837 + 360.98564736629 * d) % 360
    return math.radians(deg)


def _teme_to_geodetic(r_km: tuple[float, float, float],
                      jd_total: float) -> tuple[float, float, float]:
    """
    Convert TEME position (km) to (lat_deg, lon_deg, alt_km).
    Uses spherical Earth approximation — adequate for a visualization tool.
    """
    x, y, z = r_km
    theta = _gmst_rad(jd_total)
    xe =  x * math.cos(theta) + y * math.sin(theta)
    ye = -x * math.sin(theta) + y * math.cos(theta)
    ze = z
    lon = math.degrees(math.atan2(ye, xe))
    p   = math.sqrt(xe**2 + ye**2)
    lat = math.degrees(math.atan2(ze, p))          # geocentric
    alt = math.sqrt(xe**2 + ye**2 + ze**2) - 6371.0
    return lat, lon, alt


def compute_position(name: str, l1: str, l2: str,
                     now: datetime) -> dict | None:
    """Propagate TLE to current UTC; return position dict or None on error."""
    try:
        sat = Satrec.twoline2rv(l1, l2)
        jd_int, jd_frac = jday(
            now.year, now.month, now.day,
            now.hour, now.minute,
            now.second + now.microsecond / 1e6,
        )
        e, r, _ = sat.sgp4(jd_int, jd_frac)
        if e != 0:
            return None
        if any(math.isnan(v) or math.isinf(v) for v in r):
            return None
        lat, lon, alt = _teme_to_geodetic(r, jd_int + jd_frac)
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180) or alt < 0:
            return None
        norad_id = int(l2[2:7])
        cls, country = classify_satellite(name)
        return {
            "norad_id":       norad_id,
            "name":           name,
            "lat":            round(lat, 4),
            "lon":            round(lon, 4),
            "alt_km":         round(alt, 1),
            "country":        country,
            "classification": cls,
            "source":         "celestrak",
            "timestamp":      now.isoformat(),
            "confidence":     1.0,
        }
    except Exception:
        return None


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    t0  = time.monotonic()
    now = datetime.now(timezone.utc)

    all_sats:   list[dict] = []
    seen_norad: set[int]   = set()

    for category, url in TLE_SOURCES.items():
        if len(all_sats) >= MAX_TOTAL:
            break
        try:
            triples = fetch_tle_triples(url)
        except Exception as exc:
            print(f"  [WARN] {category}: fetch failed — {exc}")
            continue

        count = 0
        for name, l1, l2 in triples:
            if count >= MAX_PER_CATEGORY or len(all_sats) >= MAX_TOTAL:
                break
            try:
                norad_id = int(l2[2:7])
            except ValueError:
                continue
            if norad_id in seen_norad:
                continue
            pos = compute_position(name, l1, l2, now)
            if pos:
                all_sats.append(pos)
                seen_norad.add(norad_id)
                count += 1

        print(f"  {category}: {count} satellites collected")

    elapsed = time.monotonic() - t0

    output = {
        "version":      "1.0",
        "generated_at": now.isoformat(),
        "elapsed_sec":  round(elapsed, 2),
        "stats": {
            "aircraft":   0,
            "vessels":    0,
            "satellites": len(all_sats),
            "typhoons":   0,
            "ports":      87,
        },
        "aircraft":   [],
        "vessels":    [],
        "satellites": all_sats,
        "typhoons":   [],
        "ports":      {"$ref": "/worldlens/static/ports.json"},
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"\nWrote {len(all_sats)} satellites → {OUTPUT.relative_to(REPO_ROOT)}")
    print(f"Elapsed: {elapsed:.2f}s")


if __name__ == "__main__":
    main()
