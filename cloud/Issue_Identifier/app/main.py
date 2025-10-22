import os
import logging
import uuid
import json
import time
import re
from typing import List, Optional, Any, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.schemas import ReportIn, AnalyzeOut, DetectedIssue
from app.prompt_templates import build_prompt
from app.utils import fetch_image_bytes, get_weather_summary
from app import es_client

# google genai SDK
from google import genai
from google.genai import types

# Explicitly load .env file (not .env.example)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'), override=True)

logger = logging.getLogger("uvicorn.error")
API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")

if not API_KEY:
    logger.error("GEMINI_API_KEY missing. Set GEMINI_API_KEY (from Google AI Studio or Vertex). Requests will fail.")


def repair_json(text: str) -> str:
    """
    Attempt to repair common JSON formatting errors from LLM responses.
    Specifically fixes missing closing braces in arrays.
    """
    # Fix pattern: `null\n    ,` -> `null\n    },`
    # This handles missing } before comma in array elements
    text = re.sub(r'(null|true|false|"\w+"|\d+)\s*\n\s*,', r'\1\n    },', text)
    
    # Fix pattern: `null\n    }` at end of array element (already correct, but ensure consistency)
    # No change needed for this pattern
    
    return text

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

@app.on_event("startup")
async def startup_event():
    """Log configuration on startup for debugging"""
    logger.info("=" * 60)
    logger.info("STARTUP CONFIGURATION:")
    logger.info(f"API_KEY present: {bool(API_KEY)}")
    logger.info(f"API_KEY (masked): {API_KEY[:10]}...{API_KEY[-4:] if API_KEY and len(API_KEY) > 14 else 'N/A'}")
    logger.info(f"GEMINI_MODEL: {GEMINI_MODEL}")
    logger.info(f"EMBEDDING_MODEL: {EMBEDDING_MODEL}")
    logger.info(f"Client initialized: {client is not None}")
    logger.info("=" * 60)

# canonical label set (bounded)
CANONICAL_LABELS: List[str] = [
    "DRAIN_BLOCKAGE",
    "FALLEN_TREE",
    "FLOODING_SURFACE",
    "GRAFFITI_VANDALISM",
    "GREENSPACE_MAINTENANCE",
    "ILLEGAL_CONSTRUCTION_DEBRIS",
    "MANHOLE_MISSING_OR_DAMAGED",
    "POWER_POLE_LINE_DAMAGE",
    "PUBLIC_INFRASTRUCTURE_DAMAGED",
    "PUBLIC_TOILET_UNSANITARY",
    "ROAD_POTHOLE",
    "SIDEWALK_DAMAGE",
    "SMALL_FIRE_HAZARD",
    "STRAY_ANIMALS",
    "STREETLIGHT_OUTAGE",
    "TRAFFIC_OBSTRUCTION",
    "TRAFFIC_SIGN_DAMAGE",
    "WASTE_BULKY_DUMP",
    "WASTE_LITTER_SMALL",
    "WATER_LEAK_SURFACE"
]


def sanitize_json_string(text: str) -> str:
    """
    Clean malformed JSON from Gemini responses.
    Removes:
    - Non-ASCII characters that commonly corrupt JSON (Hebrew, Arabic, etc.)
    - Control characters
    - Keeps only valid JSON characters
    """
    # Remove non-ASCII characters (keep ASCII 32-126 plus newlines, tabs)
    # This handles Hebrew/Arabic/other Unicode that Gemini sometimes injects
    cleaned = re.sub(r'[^\x20-\x7E\n\r\t]', '', text)
    return cleaned


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


def build_embedding_text(description: str, auto_caption: str, detected_issues: List[Dict[str, Any]], predicted_fix: str) -> str:
    """
    Build a single text blob for embedding generation.
    Format: [Issue] -- description -- auto_caption -- detected_issues_summary -- predicted_fix
    """
    title = "Issue"
    
    # Build detected issues summary: "type (score:X.XX) severity:Y future_impact:..."
    issues_summary_parts = []
    for issue in detected_issues:
        issue_type = issue.get("type", "unknown")
        confidence = issue.get("confidence", 0.0)
        severity = issue.get("severity", "medium")
        future_impact = (issue.get("future_impact") or "")[:100]  # truncate for brevity
        issues_summary_parts.append(
            f"{issue_type} (score:{confidence:.2f}) severity:{severity} future_impact:{future_impact}"
        )
    
    detected_issues_summary = " | ".join(issues_summary_parts) if issues_summary_parts else "No specific issues detected"
    
    # Build final text blob
    text_blob = f"{title} -- {description or 'No description'} -- {auto_caption or 'No caption'} -- {detected_issues_summary} -- predicted_fix: {predicted_fix or 'No fix predicted'}"
    
    return text_blob


def generate_embedding(text: str) -> Optional[List[float]]:
    """
    Generate embedding vector using gemini-embedding-001.
    Returns a list of 3072 floats or None on failure.
    """
    if not client:
        logger.warning("GenAI client not initialized; cannot generate embedding")
        return None
    
    try:
        result = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text
        )
        
        # Extract embedding from result
        if hasattr(result, 'embeddings') and result.embeddings:
            embedding = result.embeddings[0]
            if hasattr(embedding, 'values'):
                return list(embedding.values)
        
        logger.warning("Embedding result has unexpected structure")
        return None
    except Exception as e:
        logger.exception("Failed to generate embedding: %s", e)
        return None


@app.post("/analyze/", response_model=AnalyzeOut)
def analyze(report: ReportIn):
    # 1. fetch image
    try:
        image_bytes, mime_type = fetch_image_bytes(report.image_url)
    except Exception as e:
        logger.exception("fetch_image_bytes failed")
        raise HTTPException(status_code=400, detail=f"Could not fetch image: {e}")

    # 2. Generate query embedding for hybrid search (before evidence retrieval)
    # Build a simple query text from user input
    query_text_parts = []
    if report.description:
        query_text_parts.append(report.description)
    if report.user_selected_labels:
        query_text_parts.append(" ".join(report.user_selected_labels))
    
    query_embedding = None
    if query_text_parts and client:
        query_text = " ".join(query_text_parts)
        try:
            query_embedding = generate_embedding(query_text)
            if query_embedding and len(query_embedding) != 3072:
                logger.warning("Query embedding has unexpected dimension: %d", len(query_embedding))
                query_embedding = None
        except Exception as e:
            logger.warning("Failed to generate query embedding: %s", e)
            query_embedding = None

    # 3. evidence retrieval and weather (parallel execution)
    # Run ES queries and weather API in parallel since they're independent
    issues_evidence = []
    fixes_evidence = []
    weather_obj = {}
    
    with ThreadPoolExecutor(max_workers=3) as executor:
        # Submit independent tasks
        future_issues = executor.submit(
            lambda: es_client.hybrid_retrieve_issues(
                report.location.dict(), 
                report.user_selected_labels, 
                days=180, 
                size=5,
                query_embedding=query_embedding
            )
        )
        future_fixes = executor.submit(lambda: es_client.hybrid_retrieve_fixes(size=5))
        future_weather = executor.submit(get_weather_summary, report.location.dict(), report.timestamp)
        
        # Collect results as they complete (non-blocking)
        for future in as_completed([future_issues, future_fixes, future_weather]):
            try:
                if future == future_issues:
                    issues_evidence = future.result()
                elif future == future_fixes:
                    fixes_evidence = future.result()
                elif future == future_weather:
                    weather_obj = future.result()
            except Exception as e:
                if future == future_issues:
                    logger.exception("Failed to retrieve issue evidence; continuing with empty list")
                elif future == future_fixes:
                    logger.exception("Failed to retrieve fixes evidence; continuing with empty list")
                elif future == future_weather:
                    logger.exception("Failed to retrieve weather data; continuing without weather context")

    # 4.. Build weather summary string
    weather_summary_str = (
        f"Precipitation (24h): {weather_obj.get('precipitation_24h_mm', 0)}mm, "
        f"Avg Temperature: {weather_obj.get('temperature_c_avg')}°C, "
        f"Max Wind: {weather_obj.get('windspeed_max_ms')}m/s, "
        f"Avg Humidity: {weather_obj.get('relative_humidity_avg')}%. "
        f"Note: {weather_obj.get('weather_note', '')}"
    )

    # 5. build prompt
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

    # 6. call Gemini (image+prompt)
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

    # 7. robust parse
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
            
            # Sanitize JSON to remove corrupted characters (Hebrew, etc.) from Gemini
            if raw_candidate:
                raw_candidate = sanitize_json_string(raw_candidate)
            
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

            # Attempt to repair common JSON errors before parsing
            repaired_json = repair_json(raw_candidate)
            
            try:
                parsed = json.loads(repaired_json)
            except json.JSONDecodeError as e:
                # If repair didn't work, log both versions and fail
                logger.error("JSON repair failed. Original: %s", raw_candidate[:500])
                logger.error("Repaired: %s", repaired_json[:500])
                raise e
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

    # 8. validate detected_issues list
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

    # 9. Enforce maximum 5 issues (sort by severity_score, keep top 5)
    if len(retained) > 5:
        logger.warning("Gemini returned %d issues, limiting to top 5 by severity", len(retained))
        retained = sorted(retained, key=lambda x: x.severity_score, reverse=True)[:5]
        # Update seen_types and label_confidences to match retained issues
        seen_types = {d.type for d in retained}
        label_confidences = {d.type: d.confidence for d in retained}

    # 10. aggregate & prepare document
    issue_id = str(uuid.uuid4())
    doc_severity_score = max((d.severity_score for d in retained), default=0.0)
    fate_risk_co2 = safe_float(parsed.get("fate_risk_co2"), 0.0)

    # 11. Generate embedding for the issue
    auto_caption = parsed.get("auto_caption", "")
    predicted_fix_text = retained[0].predicted_fix if retained else ""
    
    embedding_text = build_embedding_text(
        description=report.description,
        auto_caption=auto_caption,
        detected_issues=[d.dict() for d in retained],
        predicted_fix=predicted_fix_text
    )
    
    text_embedding = generate_embedding(embedding_text)
    if text_embedding and len(text_embedding) != 3072:
        logger.warning("Generated embedding has unexpected dimension: %d (expected 3072)", len(text_embedding))
        text_embedding = None

    # 12. Extract evidence issue IDs from retrieved similar issues
    evidence_issue_ids = [item.get("id") for item in issues_evidence if item.get("id")]
    if evidence_issue_ids:
        logger.info("Found %d evidence issues: %s", len(evidence_issue_ids), evidence_issue_ids[:3])
    else:
        logger.info("No evidence issues found nearby")

    # 13. Build ES document 
    es_doc = {
        "issue_id": issue_id,
        "reported_by": report.reported_by or "anonymous123",
        "uploader_display_name": report.uploader_display_name or "anonymous",
        "source": report.source or "anonymous",
        "status": "open",
        "closed_by": None,
        "closed_at": None,
        "created_at": report.timestamp,
        "updated_at": report.timestamp,
        "location": {"lat": report.location.latitude, "lon": report.location.longitude},
        "description": report.description,
        "text_embedding": text_embedding,
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
        "evidence_ids": evidence_issue_ids,
        "auto_review_flag": any(d.auto_review_flag for d in retained),
        "upvotes": {"open": 0, "closed": 0},
        "reports": {"open": 0, "closed": 0},
        "is_spam": False
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
