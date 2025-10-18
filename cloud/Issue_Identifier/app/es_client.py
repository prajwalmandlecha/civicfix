from elasticsearch import Elasticsearch, NotFoundError
import os
from typing import List, Dict, Any, Optional

ES_URL = os.environ.get("ES_URL", "http://localhost:9200")
es = Elasticsearch(ES_URL, verify_certs=False, request_timeout=60)


def hybrid_retrieve_issues(
    location: Dict[str, float],
    user_labels: List[str],
    days: int = 180,
    size: int = 5,
) -> List[Dict[str, Any]]:
    lat = location.get("latitude")
    lon = location.get("longitude")
    body = {
        "size": size,
        "query": {
            "bool": {
                "filter": [
                    {"geo_distance": {"distance": "500m", "location": {"lat": lat, "lon": lon}}},
                    {"range": {"reported_at": {"gte": f"now-{days}d/d"}}}
                ]
            }
        },
        "_source": ["issue_types", "severity_score", "description"]
    }

    if user_labels:
        body["query"]["bool"]["must"] = [{"terms": {"issue_types": user_labels}}]

    try:
        resp = es.search(index="issues", body=body)
    except Exception:
        return []

    hits = resp.get("hits", {}).get("hits", [])
    snippets = []
    for h in hits:
        s = h.get("_source", {})
        snippets.append({
            "id": h.get("_id"),
            "issue_types": s.get("issue_types", []),
            "severity_score": s.get("severity_score"),
            "short": (s.get("description") or "")[:160]
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
