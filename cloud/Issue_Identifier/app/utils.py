import requests
from typing import Tuple, Dict, Any
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger("uvicorn.error")

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
    return resp.content, mime


def get_weather_summary(location: Dict[str, float], timestamp: str) -> Dict[str, Any]:
    """
    Query Open-Meteo Historical API for the given location and timestamp.
    Returns last 24h weather data relevant to civic issues.
    
    This data is used ONLY as context for Gemini and is NOT stored in Elasticsearch.
    
    Relevant weather attributes for civic issues:
    - precipitation_24h_mm: Affects flooding, drainage, potholes
    - temperature_c_avg: Affects asphalt/concrete integrity
    - windspeed_max_ms: Affects fallen trees, debris
    - relative_humidity_avg: Affects mold, waste decomposition
    """
    lat = location.get("latitude")
    lon = location.get("longitude")

    # Parse timestamp and get 24h window ending at that time
    try:
        t = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except Exception:
        t = datetime.now(timezone.utc)

    # Get last 24 hours of data
    start_dt = t - timedelta(hours=24)
    end_dt = t
    
    # Historical API uses date format YYYY-MM-DD
    start_date = start_dt.strftime("%Y-%m-%d")
    end_date = end_dt.strftime("%Y-%m-%d")

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join([
            "temperature_2m",
            "relative_humidity_2m",
            "wind_speed_10m",
            "precipitation"
        ]),
        "start_date": start_date,
        "end_date": end_date,
        "timezone": "UTC"
    }

    try:
        r = requests.get(OPEN_METEO_HISTORICAL_URL, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        
        hourly = data.get("hourly", {})
        temps = hourly.get("temperature_2m", [])
        hums = hourly.get("relative_humidity_2m", [])
        winds = hourly.get("wind_speed_10m", [])
        precs = hourly.get("precipitation", [])

        # Calculate aggregates
        temp_avg = sum(temps) / len(temps) if temps else None
        hum_avg = sum(hums) / len(hums) if hums else None
        wind_max = max(winds) if winds else None
        prec_24 = sum(precs) if precs else None

        # Build contextual note for Gemini
        note_parts = []
        if prec_24 and prec_24 > 20:
            note_parts.append(f"Heavy rain (24h: {round(prec_24,1)}mm) increases flood/drainage/pothole risks")
        elif prec_24 and prec_24 > 5:
            note_parts.append(f"Moderate rain (24h: {round(prec_24,1)}mm) may affect drainage and potholes")
        elif prec_24 and prec_24 > 0:
            note_parts.append(f"Light rain (24h: {round(prec_24,1)}mm)")
        
        if wind_max and wind_max > 15:
            note_parts.append(f"High winds ({round(wind_max,1)}m/s) increase fallen tree/debris risks")
        elif wind_max and wind_max > 10:
            note_parts.append(f"Moderate winds ({round(wind_max,1)}m/s)")
        
        if temp_avg and temp_avg > 35:
            note_parts.append(f"High temperature ({round(temp_avg,1)}°C) affects asphalt integrity")
        elif temp_avg and temp_avg < 5:
            note_parts.append(f"Low temperature ({round(temp_avg,1)}°C) increases pothole formation")
        
        weather_note = "; ".join(note_parts) if note_parts else "Normal weather conditions (no significant impact)"

        return {
            "precipitation_24h_mm": round(prec_24, 2) if prec_24 is not None else 0.0,
            "temperature_c_avg": round(temp_avg, 2) if temp_avg is not None else None,
            "windspeed_max_ms": round(wind_max, 2) if wind_max is not None else None,
            "relative_humidity_avg": round(hum_avg, 1) if hum_avg is not None else None,
            "weather_note": weather_note
        }
    except Exception as e:
        # On failure, return neutral weather (don't block main flow)
        logger.warning(f"Weather API failed: {e}")
        return {
            "precipitation_24h_mm": 0.0,
            "temperature_c_avg": None,
            "windspeed_max_ms": None,
            "relative_humidity_avg": None,
            "weather_note": "Weather data unavailable"
        }
