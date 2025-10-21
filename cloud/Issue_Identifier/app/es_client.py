from elasticsearch import Elasticsearch, NotFoundError
import os
import logging
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables before reading them
load_dotenv()

ES_URL = os.environ.get("ES_URL", "http://localhost:9200")
ES_USER = os.environ.get("ES_USER")
ES_PASSWORD = os.environ.get("ES_PASSWORD")

logger = logging.getLogger("uvicorn.error")

# Initialize Elasticsearch client with authentication and SSL support
if ES_USER and ES_PASSWORD:
    es = Elasticsearch(
        ES_URL,
        basic_auth=(ES_USER, ES_PASSWORD),
        verify_certs=False,  # Set to True in production with valid certificates
        request_timeout=60
    )
    logger.info(f"Elasticsearch client initialized with authentication for {ES_URL}")
else:
    es = Elasticsearch(ES_URL, verify_certs=False, request_timeout=60)
    logger.info(f"Elasticsearch client initialized without authentication for {ES_URL}")


def hybrid_retrieve_issues(
    location: Dict[str, float],
    user_labels: List[str],
    days: int = 180,
    size: int = 5,
    query_embedding: Optional[List[float]] = None,
) -> List[Dict[str, Any]]:
    """
    Hybrid retrieval combining:
    - kNN vector similarity (if query_embedding provided)
    - Geo-distance filter
    - Time range filter
    - Optional term matching on issue_types
    """
    lat = location.get("latitude")
    lon = location.get("longitude")
    
    # Build filter conditions
    filter_conditions = [
        {"geo_distance": {"distance": "5km", "location": {"lat": lat, "lon": lon}}},
        {"range": {"created_at": {"gte": f"now-{days}d/d"}}} 
    ]
    
    # If query_embedding is provided, use kNN + filters
    if query_embedding and len(query_embedding) == 3072:
        logger.info("Using kNN hybrid search with vector similarity (3072 dims) for lat=%s, lon=%s", lat, lon)
        body = {
            "size": size,
            "knn": {
                "field": "text_embedding",
                "query_vector": query_embedding,
                "k": size * 2,  # retrieve more candidates for filtering
                "num_candidates": 100,
                "filter": {
                    "bool": {
                        "filter": filter_conditions
                    }
                }
            },
            "_source": ["issue_types", "severity_score", "description", "auto_caption", "created_at", "location"]
        }
        
        # Add term matching if user labels provided
        if user_labels:
            body["knn"]["filter"]["bool"]["should"] = [{"terms": {"issue_types": user_labels}}]
            body["knn"]["filter"]["bool"]["minimum_should_match"] = 0  # boost, not require
    else:
        # Fallback to traditional search if no embedding
        logger.info("Using traditional filtered search (no query embedding provided) for lat=%s, lon=%s", lat, lon)
        body = {
            "size": size,
            "query": {
                "bool": {
                    "filter": filter_conditions
                }
            },
            "_source": ["issue_types", "severity_score", "description", "auto_caption", "created_at", "location"]
        }
        
        if user_labels:
            body["query"]["bool"]["must"] = [{"terms": {"issue_types": user_labels}}]

    try:
        resp = es.search(index="issues", body=body)
        hits_count = len(resp.get("hits", {}).get("hits", []))
        logger.info("ES returned %d evidence issues within 5km and %d days", hits_count, days)
    except Exception as e:
        logger.exception("ES search failed: %s", e)
        return []

    hits = resp.get("hits", {}).get("hits", [])
    snippets = []
    for h in hits:
        s = h.get("_source", {})
        snippets.append({
            "id": h.get("_id"),  # This is the actual document ID
            "issue_types": s.get("issue_types", []),
            "severity_score": s.get("severity_score"),
            "short": (s.get("description") or s.get("auto_caption") or "")[:160],
            "created_at": s.get("created_at")
        })
    return snippets


def hybrid_retrieve_fixes(size: int = 5) -> List[Dict[str, Any]]:
    body = {
        "size": size,
        "query": {"match_all": {}},
        "_source": ["fix_id", "related_issue_types", "summary", "co2_saved"]
    }
    try:
        resp = es.search(index="fixes", body=body)
    except Exception:
        return []
    hits = resp.get("hits", {}).get("hits", [])
    snippets = []
    for h in hits:
        s = h.get("_source", {})
        snippets.append({
            "fix_id": h.get("_id"),
            "related_issue_types": s.get("related_issue_types", []),
            "summary": (s.get("summary") or "")[:160],
            "co2_saved": s.get("co2_saved")
        })
    return snippets


def index_issue(issue_id: str, doc: Dict[str, Any]) -> None:
    es.index(index="issues", id=issue_id, document=doc)


def get_issue(issue_id: str) -> Optional[Dict[str, Any]]:
    try:
        res = es.get(index="issues", id=issue_id)
        return res.get("_source")
    except NotFoundError:
        return None
    except Exception:
        return None
