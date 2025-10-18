import os
import logging
import uuid
import json
import time
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.schemas import ReportIn, AnalyzeOut, DetectedIssue
from app.prompt_templates import build_prompt
from app.utils import fetch_image_bytes, get_weather_summary, compute_impact_and_radius
from app import es_client

# google genai SDK
from google import genai
from google.genai import types

load_dotenv()

logger = logging.getLogger("uvicorn.error")
API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if not API_KEY:
    logger.error("GEMINI_API_KEY missing. Set GEMINI_API_KEY (from Google AI Studio or Vertex). Requests will fail.")

# create client (works with AI Studio keys or Vertex auth)
client: Optional[genai.Client] = None
try:
    if API_KEY:
        client = genai.Client(api_key=API_KEY)
except Exception as e:
    logger.exception("Failed to initialize genai client: %s", e)
    client = None

app = FastAPI(title="CivicFix — Issue Identifier")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# canonical label set (bounded)
CANONICAL_LABELS: List[str] = [
    "exposed_power_cables",
    "illegal_dumping_bulky_waste",
    "illegal_hoarding",
    "waterlogging",
    "encroachment_public_space",
    "illegal_construction_small",
    "visible_pollution",
    "streetlight_out",
    "overflowing_garbage_bin",
    "broken_infrastructure",
    "public_toilet_nonfunctional",
    "sewer_blockage",
    "uncollected_household_waste",
    "unregulated_construction_activity",
    "public_health_hazard"
]


def safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def clamp_confidence(v: float) -> float:
    if v is None:
        return 0.0
    return max(0.0, min(1.0, float(v)))


def clamp_severity_score(v: float) -> float:
    if v is None:
        return 0.0
    return max(0.0, min(10.0, float(v)))


def call_gemini_with_backoff(contents: List[Any], model: str, max_attempts: int = 3, initial_delay: float = 1.0):
    """
    Call genai models.generate_content with a simple exponential backoff.
    Returns the response object or raises the final exception.
    """
    attempt = 0
    delay = initial_delay
    last_exc = None
    while attempt < max_attempts:
        attempt += 1
        try:
            config = types.GenerateContentConfig(response_mime_type="application/json")
            response = client.models.generate_content(model=model, contents=contents, config=config)
            return response
        except Exception as e:
            last_exc = e
            logger.warning("Gemini call attempt %d/%d failed: %s", attempt, max_attempts, repr(e))
            if attempt >= max_attempts:
                break
            time.sleep(delay)
            delay *= 2.0
    # final failure
    raise last_exc


@app.post("/analyze/", response_model=AnalyzeOut)
def analyze(report: ReportIn):
    """
    Full analyze flow (real Gemini):
     1. fetch image bytes
     2. get local evidence + weather snapshot
     3. build strict prompt
     4. call Gemini (image+prompt when possible)
     5. robustly parse JSON and validate items
     6. compute impact + radius and index doc to ES
    """
    # 1. fetch image
    try:
        image_bytes, mime_type = fetch_image_bytes(report.image_url)
    except Exception as e:
        logger.exception("fetch_image_bytes failed")
        raise HTTPException(status_code=400, detail=f"Could not fetch image: {e}")

    # 2. evidence & weather
    try:
        issues_evidence = es_client.hybrid_retrieve_issues(report.location.dict(), report.user_selected_labels, days=180, size=5)
    except Exception:
        logger.exception("Failed to retrieve issue evidence; continuing with empty list")
        issues_evidence = []
    try:
        fixes_evidence = es_client.hybrid_retrieve_fixes(size=5)
    except Exception:
        logger.exception("Failed to retrieve fixes evidence; continuing with empty list")
        fixes_evidence = []

    weather_obj = get_weather_summary(report.location.dict(), report.timestamp)
    weather_summary_str = (
        f"precip24mm={weather_obj.get('precipitation_24h_mm')}, "
        f"temp_avg={weather_obj.get('temperature_c_avg')}, "
        f"wind_max={weather_obj.get('windspeed_max_ms')}, "
        f"rh_avg={weather_obj.get('relative_humidity_avg')}"
    )

    # 3. build prompt
    prompt_str = build_prompt(
        description=report.description,
        location=report.location.dict(),
        timestamp=report.timestamp,
        user_selected_labels=report.user_selected_labels,
        issues_evidence=issues_evidence,
        fixes_evidence=fixes_evidence,
        weather_summary=weather_summary_str,
        canonical_labels=CANONICAL_LABELS
    )

    # 4. call Gemini (image+prompt preferred)
    if client is None:
        logger.error("genai client not initialized (GEMINI_API_KEY missing/invalid)")
        raise HTTPException(status_code=500, detail="GenAI client not initialized; ensure GEMINI_API_KEY is set")

    contents: List[Any] = []
    try:
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        contents = [image_part, prompt_str]
    except Exception:
        logger.warning("Failed to build image part for Gemini; using prompt-only fallback.")
        contents = [prompt_str]

    debug_dump_path = os.path.join(os.getcwd(), "model_response_debug.json")
    try:
        response = call_gemini_with_backoff(contents, GEMINI_MODEL, max_attempts=4, initial_delay=1.0)
    except Exception as e:
        # dump error for debugging
        dump = {"exception": repr(e)}
        try:
            with open(debug_dump_path, "w", encoding="utf-8") as fh:
                json.dump(dump, fh, indent=2)
        except Exception:
            logger.exception("Failed to write debug dump")
        logger.exception("Gemini final call failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Model call failed; see {debug_dump_path}")

    # 5. robust parse
    parsed: Optional[Dict[str, Any]] = None
    try:
        if hasattr(response, "parsed") and response.parsed is not None:
            parsed = response.parsed
        else:
            # Try to extract from candidates[0].content.parts[0].text
            raw_candidate = None
            if hasattr(response, "candidates") and response.candidates:
                first_candidate = response.candidates[0]
                if hasattr(first_candidate, "content") and first_candidate.content:
                    if hasattr(first_candidate.content, "parts") and first_candidate.content.parts:
                        first_part = first_candidate.content.parts[0]
                        if hasattr(first_part, "text"):
                            raw_candidate = first_part.text
            
            # Fallback to old logic if above fails
            if not raw_candidate:
                outputs = getattr(response, "output", None)
                if outputs and isinstance(outputs, (list, tuple)) and len(outputs) > 0:
                    first = outputs[0]
                    if isinstance(first, dict):
                        raw_candidate = first.get("content") or first.get("text") or json.dumps(first)
                    else:
                        raw_candidate = str(first)
                else:
                    raw_candidate = str(response)

            if isinstance(raw_candidate, (bytes, bytearray)):
                raw_candidate = raw_candidate.decode("utf-8", errors="ignore")
            raw_candidate = (raw_candidate or "").strip()
            if not raw_candidate:
                dump_obj = {
                    "response_repr": repr(response),
                    "response_str": str(response),
                    "response_dir": [a for a in dir(response) if not a.startswith("_")][:200],
                    "outputs": outputs
                }
                with open(debug_dump_path, "w", encoding="utf-8") as fh:
                    json.dump(dump_obj, fh, indent=2, default=str)
                logger.error("Gemini returned empty raw content; debug dumped to %s", debug_dump_path)
                raise HTTPException(status_code=502, detail=f"Model returned empty response. See {debug_dump_path}")

            parsed = json.loads(raw_candidate)
    except HTTPException:
        raise
    except Exception as e:
        dump_obj = {
            "exception": repr(e),
            "raw_candidate": raw_candidate if 'raw_candidate' in locals() else None,
            "response_repr": repr(response),
            "outputs": getattr(response, "output", None)
        }
        try:
            with open(debug_dump_path, "w", encoding="utf-8") as fh:
                json.dump(dump_obj, fh, indent=2, default=str)
        except Exception:
            logger.exception("Failed to write debug dump file")
        logger.exception("Failed to parse model response; dumped debug to %s", debug_dump_path)
        raise HTTPException(status_code=502, detail=f"Model returned unparsable response. See {debug_dump_path}")

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=500, detail="Model did not return a JSON object")

    if parsed.get("no_issues_found"):
        return AnalyzeOut(
            issue_id=None,
            detected_issues=[],
            auto_review=False,
            no_issues_found=True,
            location=report.location,
            timestamp=report.timestamp
        )

    # 6. validate detected_issues list
    raw_detected = parsed.get("detected_issues") or []
    if not isinstance(raw_detected, list):
        # try tolerant conversion if it's a single dict
        if isinstance(raw_detected, dict):
            raw_detected = [raw_detected]
        else:
            raw_detected = []

    retained: List[DetectedIssue] = []
    label_confidences: Dict[str, float] = {}
    seen_types = set()

    for item in raw_detected:
        if not isinstance(item, dict):
            logger.warning("Skipping non-dict detected item: %r", item)
            continue
        typ = (item.get("type") or "").strip().lower()
        if not typ:
            logger.warning("Skipping detected item missing type: %r", item)
            continue

        # Only allow canonical labels or lowercase strings (but we still accept non-canonical)
        typ = typ.replace(" ", "_")  # normalize spaces if any

        conf = clamp_confidence(safe_float(item.get("confidence"), 0.0))
        if conf < 0.6:
            logger.debug("Dropping label %s due to low confidence %.3f", typ, conf)
            continue

        if typ in seen_types:
            logger.debug("Dropping duplicate label %s", typ)
            continue
        seen_types.add(typ)

        severity = item.get("severity", "medium")
        if severity not in ("low", "medium", "high"):
            severity = "medium"

        severity_score = clamp_severity_score(safe_float(item.get("severity_score"), 5.0))
        future_impact = (item.get("future_impact") or "").strip()
        predicted_fix = (item.get("predicted_fix") or "").strip()
        predicted_fix_confidence = clamp_confidence(safe_float(item.get("predicted_fix_confidence"), 0.0))
        auto_review_flag = True if conf < 0.85 else False
        reason_for_flag = item.get("reason_for_flag")

        di = DetectedIssue(
            type=typ,
            confidence=conf,
            severity=severity,
            severity_score=severity_score,
            future_impact=future_impact,
            predicted_fix=predicted_fix,
            predicted_fix_confidence=predicted_fix_confidence,
            auto_review_flag=auto_review_flag,
            reason_for_flag=reason_for_flag
        )
        retained.append(di)
        label_confidences[typ] = conf

    if len(retained) == 0:
        return AnalyzeOut(
            issue_id=None,
            detected_issues=[],
            auto_review=False,
            no_issues_found=True,
            location=report.location,
            timestamp=report.timestamp
        )

    # 7. aggregate + compute impact & store
    issue_id = str(uuid.uuid4())
    doc_severity_score = max((d.severity_score for d in retained), default=0.0)
    fate_risk_co2 = safe_float(parsed.get("fate_risk_co2"), 0.0)

    upvotes_total = 0
    reports_total = 0
    impact_score, visibility_radius_m = compute_impact_and_radius(
        severity_score=doc_severity_score,
        upvotes_total=upvotes_total,
        reports_total=reports_total,
        reported_at_iso=report.timestamp,
        density_norm=0.0
    )

    es_doc = {
        "issue_id": issue_id,
        "reported_by": report.reported_by or "anonymous",
        "uploader_display_name": None,
        "source": report.source or "citizen",
        "status": "open",
        "locked_by": None,
        "locked_at": None,
        "verified_by": None,
        "verified_at": None,
        "closed_by": None,
        "closed_at": None,
        "reported_at": report.timestamp,
        "created_at": report.timestamp,
        "updated_at": report.timestamp,
        "location": {"lat": report.location.latitude, "lon": report.location.longitude},
        "description": report.description,
        "text_embedding": None,
        "auto_caption": parsed.get("auto_caption"),
        "user_selected_labels": report.user_selected_labels,
        "photo_url": report.image_url,
        "detected_issues": [d.dict() for d in retained],
        "issue_types": list(seen_types),
        "label_confidences": label_confidences,
        "severity_score": doc_severity_score,
        "fate_risk_co2": fate_risk_co2,
        "co2_kg_saved": 0.0,
        "predicted_fix": retained[0].predicted_fix if retained else "",
        "predicted_fix_confidence": max((d.predicted_fix_confidence for d in retained), default=0.0),
        "evidence_ids": parsed.get("sources", []),
        "auto_review_flag": any(d.auto_review_flag for d in retained),
        "human_verified": False,
        "reviewed_by": None,
        "reviewed_at": None,
        "upvotes": {"open": 0, "verified": 0, "closed": 0},
        "reports": {"open": 0, "verified": 0, "closed": 0},
        "impact_score": impact_score,
        "visibility_radius_m": visibility_radius_m,
        "weather": weather_obj
    }

    try:
        es_client.index_issue(issue_id, es_doc)
    except Exception:
        logger.exception("Failed to index issue into Elasticsearch")
        raise HTTPException(status_code=500, detail="Failed to index issue into search store")

    return AnalyzeOut(
        issue_id=issue_id,
        detected_issues=retained,
        auto_review=es_doc["auto_review_flag"],
        no_issues_found=False,
        location=report.location,
        timestamp=report.timestamp
    )
