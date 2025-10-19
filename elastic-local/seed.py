#!/usr/bin/env python3
"""
seed.py - robust Elasticsearch seeder compatible with ES 8.x python client.

Usage:
    python seed.py              # creates indices and seeds 10 docs (fast test)
    python seed.py --count 350  # seed 350 docs (may take time)
"""

import os
import sys
import argparse
import uuid
import random
import time
from datetime import datetime, timedelta, timezone
from elasticsearch import Elasticsearch, helpers, exceptions
from faker import Faker

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

# Import Gemini for embeddings
try:
    from google import genai
    EMBEDDING_ENABLED = True
except ImportError:
    print("Warning: google-genai not installed. Embeddings will be None.")
    EMBEDDING_ENABLED = False

fake = Faker("en_IN")

# Config
ES_URL = os.environ.get("ES_URL", "http://localhost:9200")
TEST_COUNT = 10
API_KEY = os.environ.get("GEMINI_API_KEY")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "gemini-embedding-001")

# Initialize Gemini client for embeddings
gemini_client = None
if EMBEDDING_ENABLED and API_KEY:
    try:
        gemini_client = genai.Client(api_key=API_KEY)
        print(f"Gemini client initialized for embeddings using {EMBEDDING_MODEL}")
    except Exception as e:
        print(f"Failed to initialize Gemini client: {e}")
        gemini_client = None
elif EMBEDDING_ENABLED and not API_KEY:
    print("Warning: GEMINI_API_KEY not set. Embeddings will be None.")

# Use ES 8.x compatible client parameters
es = Elasticsearch(
    ES_URL,
    verify_certs=False,
    request_timeout=60,  # ES 8.x client uses request_timeout
)

# Index names
ISSUES_INDEX = "issues"
FIXES_INDEX = "fixes"


# Full mapping for issues (from your schema)
ISSUES_MAPPING = {
    "mappings": {
        "properties": {
            "issue_id": {"type":"keyword"},
            "reported_by": {"type":"keyword"},
            "uploader_display_name": {"type":"keyword"},
            "source": {"type":"keyword"},
            "status": {"type":"keyword"},
            "locked_by": {"type":"keyword"},
            "locked_at": {"type":"date"},
            "verified_by": {"type":"keyword"},
            "verified_at": {"type":"date"},
            "closed_by": {"type":"keyword"},
            "closed_at": {"type":"date"},
            "reported_at": {"type":"date"},
            "created_at": {"type":"date"},
            "updated_at": {"type":"date"},
            "location": {"type":"geo_point"},
            "description": {"type":"text"},
            "text_embedding": {"type":"dense_vector","dims":3072},
            "auto_caption": {"type":"text"},
            "user_selected_labels": {"type":"keyword"},
            "photo_url": {"type":"keyword"},
            "detected_issues": {
                "type":"nested",
                "properties": {
                  "type": {"type":"keyword"},
                  "confidence": {"type":"float"},
                  "severity": {"type":"keyword"},
                  "severity_score": {"type":"float"},
                  "future_impact": {"type":"text"},
                  "predicted_fix": {"type":"text"},
                  "predicted_fix_confidence": {"type":"float"},
                  "auto_review_flag": {"type":"boolean"},
                  "reason_for_flag": {"type":"text"}
                }
            },
            "issue_types": {"type":"keyword"},
            "label_confidences": {"type":"object","dynamic": True},
            "severity_score": {"type":"float"},
            "fate_risk_co2": {"type":"float"},
            "co2_kg_saved": {"type":"float"},
            "predicted_fix": {"type":"text"},
            "predicted_fix_confidence": {"type":"float"},
            "evidence_ids": {"type":"keyword"},
            "auto_review_flag":{"type":"boolean"},
            "human_verified": {"type":"boolean"},
            "reviewed_by": {"type":"keyword"},
            "reviewed_at": {"type":"date"},
            "upvotes": {
                "properties": {
                  "open": { "type": "integer" },
                  "verified": { "type": "integer" },
                  "closed": { "type": "integer" }
                }
            },
            "reports": {
                "properties": {
                  "open": { "type": "integer" },
                  "verified": { "type": "integer" },
                  "closed": { "type": "integer" }
                }
            },
            "impact_score": {"type":"float"},
            "visibility_radius_m": {"type":"integer"},
            "weather": {
                "properties": {
                    "precipitation_24h_mm": {"type": "float"},
                    "temperature_c_avg": {"type": "float"},
                    "windspeed_max_ms": {"type":"float"},
                    "relative_humidity_avg": {"type":"float"},
                    "snowfall_24h_mm": {"type":"float"},
                    "weather_note": {"type":"text"}
                }
            }
        }
    }
}

# Full mapping for fixes (from your schema)
FIXES_MAPPING = {
    "mappings": {
        "properties": {
            "fix_id": {"type":"keyword"},
            "issue_id": {"type":"keyword"},
            "created_by": {"type":"keyword"},
            "created_at": {"type":"date"},
            "title": {"type":"text"},
            "summary": {"type":"text"},
            "transcript": {"type":"text"},
            "video_url": {"type":"keyword"},
            "co2_saved": {"type":"float"},
            "success_rate": {"type":"float"},
            "city": {"type":"keyword"},
            "related_issue_types": {"type":"keyword"},
            "text_embedding": {"type":"dense_vector","dims":3072},
            "source_doc_ids": {"type":"keyword"}
        }
    }
}


def check_es_or_exit():
    """Verify ES reachable and print diagnostics, exit on failure."""
    print("Testing Elasticsearch endpoint:", ES_URL)
    try:
        info = es.info()
        ver = info.get("version", {}).get("number")
        cluster = info.get("cluster_name")
        print(f"Elasticsearch reachable. cluster: {cluster}, version: {ver}")
    except exceptions.AuthenticationException:
        print("Elasticsearch requires authentication (401). If so, set ES_URL to include credentials (http://user:pass@host:9200) or configure client auth.")
        sys.exit(1)
    except exceptions.ConnectionError as ce:
        print("Connection error contacting Elasticsearch:", ce)
        sys.exit(1)
    except Exception as e:
        print("Failed to contact Elasticsearch:", e)
        sys.exit(1)


def create_indices():
    """Create issues and fixes indices if missing, using create(..., ignore=400) to be robust."""
    try:
        resp = es.options(ignore_status=400).indices.create(index=ISSUES_INDEX, body=ISSUES_MAPPING)
        if isinstance(resp, dict) and resp.get("acknowledged") is True:
            print(f"Created index: {ISSUES_INDEX}")
        else:
            print(f"Index '{ISSUES_INDEX}' exists or create returned: {resp}")
    except Exception as e:
        print("Failed to create issues index:", repr(e))
        sys.exit(1)

    try:
        resp2 = es.options(ignore_status=400).indices.create(index=FIXES_INDEX, body=FIXES_MAPPING)
        if isinstance(resp2, dict) and resp2.get("acknowledged") is True:
            print(f"Created index: {FIXES_INDEX}")
        else:
            print(f"Index '{FIXES_INDEX}' exists or create returned: {resp2}")
    except Exception as e:
        print("Failed to create fixes index:", repr(e))
        sys.exit(1)


# A small set of canonical issue types (single-image, NGO-fixable)
ISSUE_TYPES = [
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

PREDICTED_FIXES = {
    "exposed_power_cables": "Secure and insulate cables; coordinate with electricity department; cordon area.",
    "illegal_dumping_bulky_waste": "Clear bulky items, schedule pickup and enforce fines.",
    "illegal_hoarding": "Remove hoarding and document permit violations.",
    "waterlogging": "Desilt drains and clear blockages; regrade local drain flows.",
    "encroachment_public_space": "Remove encroachment and restore pedestrian path.",
    "illegal_construction_small": "Issue stop-work and remove temporary structure.",
    "visible_pollution": "Clean area and enforce anti-burning rules.",
    "streetlight_out": "Replace lamp and driver; repair wiring.",
    "overflowing_garbage_bin": "Empty bin and increase pickup frequency.",
    "broken_infrastructure": "Patch pothole or replace pavement slab.",
    "public_toilet_nonfunctional": "Repair plumbing and deep-clean facility.",
    "sewer_blockage": "Clear blockage and inspect pipe.",
    "uncollected_household_waste": "Collect waste and adjust schedule.",
    "unregulated_construction_activity": "Inspect and halt unsafe work.",
    "public_health_hazard": "Remove stagnant water; fogging and larvicide if needed."
}


def generate_embedding(text: str):
    """Generate embedding using Gemini embedding model."""
    if not gemini_client:
        return None
    
    try:
        result = gemini_client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text
        )
        
        if hasattr(result, 'embeddings') and result.embeddings:
            embedding = result.embeddings[0]
            if hasattr(embedding, 'values'):
                return list(embedding.values)
        return None
    except Exception as e:
        print(f"Failed to generate embedding: {e}")
        return None


def build_embedding_text(description: str, auto_caption: str, detected_issues: list, predicted_fix: str) -> str:
    """Build text blob for embedding from issue components."""
    title = "Issue"
    
    # Build detected issues summary
    issues_summary_parts = []
    for issue in detected_issues:
        issue_type = issue.get("type", "unknown")
        confidence = issue.get("confidence", 0.0)
        severity = issue.get("severity", "medium")
        future_impact = (issue.get("future_impact") or "")[:100]
        issues_summary_parts.append(
            f"{issue_type} (score:{confidence:.2f}) severity:{severity} future_impact:{future_impact}"
        )
    
    detected_issues_summary = " | ".join(issues_summary_parts) if issues_summary_parts else "No specific issues detected"
    
    # Build final text blob
    text_blob = f"{title} -- {description or 'No description'} -- {auto_caption or 'No caption'} -- {detected_issues_summary} -- predicted_fix: {predicted_fix or 'No fix predicted'}"
    
    return text_blob


def make_random_issue(idx):
    """Return a single realistic issue doc (ES bulk action format)."""
    issue_type = random.choice(ISSUE_TYPES)
    severity = random.choice(["low", "medium", "high"])
    base_map = {"low": 2.5, "medium": 5.5, "high": 8.0}
    severity_score = round(max(0.0, min(10.0, base_map[severity] + random.uniform(-1.5, 1.5))), 1)
    confidence = round(random.uniform(0.65, 0.98), 2)

    lat = round(random.uniform(18.45, 18.65), 6)   # Pune latitude range
    lon = round(random.uniform(73.75, 73.95), 6)   # Pune longitude range

    reported_at = (datetime.now(timezone.utc) - timedelta(days=random.uniform(0, 180))).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

    up_open = random.randint(0, 25)
    up_verified = random.randint(0, 10)
    up_closed = random.randint(0, 5)
    rep_open = random.randint(0, 6)
    rep_verified = random.randint(0, 3)
    rep_closed = random.randint(0, 2)

    total_up = up_open + up_verified + up_closed
    total_rep = rep_open + rep_verified + rep_closed

    # simple impact formula (same as service)
    import math
    severity_norm = severity_score / 10.0
    upvote_score = math.log1p(total_up)
    report_score = math.log1p(total_rep)
    recency = 1.0  # simplify for seed
    density_norm = round(random.uniform(0.0, 0.6), 2)
    w_s, w_u, w_r, w_d, w_t = 35.0, 18.0, 14.0, 20.0, 13.0
    impact_raw = (w_s * severity_norm + w_u * upvote_score - w_r * report_score + w_d * density_norm + w_t * recency)
    normalization_const = 8.0
    impact_score = max(0.0, min(100.0, (impact_raw / normalization_const) * 100.0))
    visibility_radius = int(100 * (1 + 0.06 * math.log1p(max(0.0, impact_score))))

    # minimal weather stub (you said use Open-Meteo in final generator; this quick seed uses realistic randoms)
    weather = {
        "precipitation_24h_mm": round(random.uniform(0.0, 50.0), 2),
        "temperature_c_avg": round(random.uniform(18.0, 35.0), 2),
        "windspeed_max_ms": round(random.uniform(0.5, 12.0), 2),
        "relative_humidity_avg": round(random.uniform(40.0, 90.0), 1),
        "snowfall_24h_mm": 0.0,
        "weather_note": ""
    }

    detected_issue = {
        "type": issue_type,
        "confidence": confidence,
        "severity": severity,
        "severity_score": severity_score,
        "future_impact": " ".join(PREDICTED_FIXES.get(issue_type, "May cause issues").split()[:20]),
        "predicted_fix": PREDICTED_FIXES.get(issue_type, "Inspect and repair"),
        "predicted_fix_confidence": round(random.uniform(0.6, 0.98), 2),
        "auto_review_flag": (confidence < 0.85),
        "reason_for_flag": None if confidence >= 0.85 else "medium confidence, NGO review suggested"
    }

    # Generate auto_caption
    auto_caption = f"{issue_type.replace('_', ' ').title()} detected at {fake.street_name()}, Pune. Severity: {severity}."
    
    # Generate description
    description = f"{issue_type.replace('_',' ')} observed near {fake.street_name()}."
    
    # Build embedding text and generate embedding
    embedding_text = build_embedding_text(
        description=description,
        auto_caption=auto_caption,
        detected_issues=[detected_issue],
        predicted_fix=detected_issue["predicted_fix"]
    )
    
    text_embedding = generate_embedding(embedding_text)
    
    # Validate embedding dimensions
    if text_embedding and len(text_embedding) != 3072:
        print(f"Warning: Generated embedding has {len(text_embedding)} dims, expected 3072. Setting to None.")
        text_embedding = None

    doc = {
        "_index": ISSUES_INDEX,
        "_id": str(uuid.uuid4()),
        "_source": {
            "issue_id": str(uuid.uuid4()),
            "reported_by": random.choice([None, f"user:{random.randint(1000,9999)}"]),
            "uploader_display_name": None,
            "source": "citizen",
            "status": "open",
            "locked_by": None,
            "locked_at": None,
            "verified_by": None,
            "verified_at": None,
            "closed_by": None,
            "closed_at": None,
            "reported_at": reported_at,
            "created_at": reported_at,
            "updated_at": reported_at,
            "location": {"lat": lat, "lon": lon},
            "description": description,
            "text_embedding": text_embedding,
            "auto_caption": auto_caption,
            "user_selected_labels": [issue_type] if random.random() < 0.6 else [],
            "photo_url": f"https://example.com/pune/{issue_type}/{idx}",
            "detected_issues": [detected_issue],
            "issue_types": [issue_type],
            "label_confidences": {issue_type: confidence},
            "severity_score": severity_score,
            "fate_risk_co2": round(random.uniform(0.1, 5.0), 2),
            "co2_kg_saved": 0.0,
            "predicted_fix": detected_issue["predicted_fix"],
            "predicted_fix_confidence": detected_issue["predicted_fix_confidence"],
            "evidence_ids": [],
            "auto_review_flag": detected_issue["auto_review_flag"],
            "human_verified": False,
            "reviewed_by": None,
            "reviewed_at": None,
            "upvotes": {"open": up_open, "verified": up_verified, "closed": up_closed},
            "reports": {"open": rep_open, "verified": rep_verified, "closed": rep_closed},
            "impact_score": round(impact_score, 2),
            "visibility_radius_m": visibility_radius,
            "weather": weather
        }
    }

    return doc


def seed(count=TEST_COUNT):
    check_es_or_exit()

    # create indices (robust)
    create_indices()

    # generate docs
    docs = []
    print(f"Generating {count} documents with embeddings...")
    for i in range(count):
        # pass idx for each doc so photo_url unique
        doc = make_random_issue(i)
        docs.append(doc)
        
        # Show progress every 10 documents
        if (i + 1) % 10 == 0 or (i + 1) == count:
            print(f"  Generated {i + 1}/{count} documents...")

    print(f"Bulk indexing {len(docs)} documents...")
    try:
        success, failures = helpers.bulk(es, docs, stats_only=False)
        print("Bulk insert completed. inserter returned:", success)
    except Exception as e:
        print("Bulk insert failed:", repr(e))
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=TEST_COUNT, help="Number of documents to seed")
    args = parser.parse_args()

    seed(count=args.count)
    print("Seeding finished.")
