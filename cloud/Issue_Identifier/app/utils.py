import requests
from typing import Tuple, Optional, Dict, Any
import os
import math
from datetime import datetime, timezone, timedelta

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_HISTORICAL_URL = "https://archive-api.open-meteo.com/v1/archive"


def fetch_image_bytes(url: str, timeout: int = 10) -> Tuple[bytes, str]:
    """
    Fetch image from URL. Returns bytes and MIME type.
    Raises requests.HTTPError on failure.
    """
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    content_type = resp.headers.get("Content-Type", "image/jpeg")
    mime = content_type.split(";")[0].strip()
    
    # Normalize MIME type for Gemini compatibility
    # Gemini doesn't accept 'image/jpg', only 'image/jpeg'
    if mime == "image/jpg":
        mime = "image/jpeg"
    
    return resp.content, mime


def get_weather_summary(location: Dict[str, float], timestamp: str) -> Dict[str, Any]:
    """
    Query Open-Meteo for the given location and timestamp and return a compact weather object
    containing selected attributes relevant to civic issues:
    precipitation_24h_mm, temperature_c_avg, windspeed_max_ms, relative_humidity_avg, snowfall_24h_mm, weather_note.
    Uses historical API for past dates and forecast API for future dates.
    """
    lat = location.get("latitude")
    lon = location.get("longitude")

    # Parse timestamp and build a small window around it to capture last 24h
    try:
        t = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except Exception:
        t = datetime.now(timezone.utc)

    # Determine if this is a historical request (more than 5 days ago) or forecast
    now = datetime.now(timezone.utc)
    is_historical = (now - t).total_seconds() > (5 * 24 * 3600)  # More than 5 days ago
    
    # Open-Meteo expects date strings; we'll request hourly for the prior 24h
    start_dt = t - timedelta(hours=24)
    end_dt = t
    
    # Format dates for the API (historical uses different format)
    if is_historical:
        # Historical API uses date format YYYY-MM-DD
        start_date = start_dt.strftime("%Y-%m-%d")
        end_date = end_dt.strftime("%Y-%m-%d")
        api_url = OPEN_METEO_HISTORICAL_URL
    else:
        # Forecast API uses datetime format
        start_date = start_dt.strftime("%Y-%m-%dT%H:%M")
        end_date = end_dt.strftime("%Y-%m-%dT%H:%M")
        api_url = OPEN_METEO_FORECAST_URL

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(["temperature_2m", "relativehumidity_2m", "windspeed_10m", "precipitation", "snowfall"]),
        "start": start_date if is_historical else start_date,
        "end": end_date if is_historical else end_date,
        "timezone": "UTC"
    }

    try:
        r = requests.get(api_url, params=params, timeout=8)
        r.raise_for_status()
        data = r.json()
        hourly = data.get("hourly", {})
        temps = hourly.get("temperature_2m", [])
        hums = hourly.get("relativehumidity_2m", [])
        winds = hourly.get("windspeed_10m", [])
        precs = hourly.get("precipitation", [])
        snows = hourly.get("snowfall", [])

        temp_avg = sum(temps) / len(temps) if temps else None
        hum_avg = sum(hums) / len(hums) if hums else None
        wind_max = max(winds) if winds else None
        prec_24 = sum(precs) if precs else None
        snow_24 = sum(snows) if snows else None

        note_parts = []
        if prec_24 and prec_24 > 10:
            note_parts.append(f"Heavy precipitation last 24h: {round(prec_24,1)} mm")
        elif prec_24 and prec_24 > 0:
            note_parts.append(f"Light precipitation last 24h: {round(prec_24,1)} mm")
        if wind_max and wind_max > 10:
            note_parts.append(f"Max wind {round(wind_max,1)} m/s")
        weather_note = "; ".join(note_parts) if note_parts else "No significant precipitation or wind in last 24h"

        return {
            "precipitation_24h_mm": round(prec_24, 2) if prec_24 is not None else None,
            "temperature_c_avg": round(temp_avg, 2) if temp_avg is not None else None,
            "windspeed_max_ms": round(wind_max, 2) if wind_max is not None else None,
            "relative_humidity_avg": round(hum_avg, 1) if hum_avg is not None else None,
            "snowfall_24h_mm": round(snow_24, 2) if snow_24 is not None else None,
            "weather_note": weather_note
        }
    except Exception as e:
        # On failure, return empty summary (do not block main flow)
        # Log the error for debugging
        import logging
        logger = logging.getLogger("uvicorn.error")
        logger.warning(f"Weather API failed: {e}")
        return {
            "precipitation_24h_mm": None,
            "temperature_c_avg": None,
            "windspeed_max_ms": None,
            "relative_humidity_avg": None,
            "snowfall_24h_mm": None,
            "weather_note": ""
        }


def compute_impact_and_radius(
    severity_score: float,
    upvotes_total: int,
    reports_total: int,
    reported_at_iso: str,
    density_norm: float = 0.0,
) -> Tuple[float, int]:
    """
    Compute impact_score (0..100) and visibility_radius_m (meters).
    This formula balances:
    - Severity (0-10 scale)
    - Community engagement (upvotes)
    - Flagging (reports reduce score)
    - Spatial density
    - Recency (exponential decay over 14 days)
    """
    S = max(0.0, min(10.0, severity_score))
    severity_norm = S / 10.0

    U = max(0, upvotes_total)
    R = max(0, reports_total)

    upvote_score = math.log1p(U)
    report_score = math.log1p(R)

    try:
        reported_dt = datetime.fromisoformat(reported_at_iso.replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - reported_dt).total_seconds() / (3600 * 24)
    except Exception:
        age_days = 0.0
    recency = math.exp(-age_days / 14.0)  # 14-day timescale

    # Adjusted weights for proper 0-100 scaling
    # Max theoretical score with no upvotes/reports: severity(1.0)*40 + recency(1.0)*25 = 65
    # Max with high engagement: severity(1.0)*40 + log1p(100)*12 + recency*25 + density*15 = 40+60+25+15 = 140 (normalized below)
    w_s = 40.0  # severity weight
    w_u = 12.0  # upvote weight (log scaled)
    w_r = 10.0  # report penalty weight
    w_d = 15.0  # density weight
    w_t = 25.0  # recency weight

    impact_raw = (
        w_s * severity_norm
        + w_u * upvote_score
        - w_r * report_score
        + w_d * density_norm
        + w_t * recency
    )

    # Normalize to 0-100 scale
    # Typical max for new high-severity issue: 40 + 0 + 0 + 0 + 25 = 65
    # Cap at 100 for exceptional cases with high engagement
    impact_score = max(0.0, min(100.0, impact_raw * 100.0 / 65.0))

    base_radius = 100  # meters
    alpha = 0.06
    radius_m = int(base_radius * (1 + alpha * math.log1p(max(0.0, impact_score))))

    return float(round(impact_score, 2)), radius_m
