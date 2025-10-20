import os
import logging
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import List, Dict, Any
from pydantic import ValidationError
from uuid import uuid4

from app.schemas import VerifyIn, VerifyOut, PerIssueResult
from app.prompt_template import build_prompt
from app.utils import fetch_image_bytes, now_iso, make_fix_id

# Gemini SDK
from google import genai
from google.genai import types

# Elasticsearch
from elasticsearch import Elasticsearch

load_dotenv()

logger = logging.getLogger("uvicorn.error")

# Config from env
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-001")
ES_URL = os.getenv("ES_URL", "http://localhost:9200")
ISSUES_INDEX = os.getenv("ISSUES_INDEX", "issues")
FIXES_INDEX = os.getenv("FIXES_INDEX", "fixes")

if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not set; ensure you export your Google AI Studio key in env")

client = genai.Client(api_key=GEMINI_API_KEY)
es = Elasticsearch(ES_URL)

app = FastAPI(title="Issue Verifier")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_issue(issue_id: str) -> Dict[str, Any]:
    """
    Fetch issue doc by issue_id. We assume issue_id is stored as a field `issue_id`.
    """
    q = {
        "query": {"term": {"issue_id": {"value": issue_id}}}
    }
    resp = es.search(index=ISSUES_INDEX, body=q, size=1)
    hits = resp.get("hits", {}).get("hits", [])
    if not hits:
        raise KeyError(f"Issue {issue_id} not found")
    return hits[0]["_source"]

def hybrid_retrieve_context(issue_doc: Dict[str, Any], fix_description: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """
    Hybrid retrieval for fix documents using kNN vector search with filters (like Issue Identifier).
    Falls back to traditional search if vector search fails.
    Returns a list of candidate fix docs (top_k).
    """
    # Build short context text
    parts = []
    if issue_doc.get("auto_caption"):
        parts.append(issue_doc["auto_caption"])
    if issue_doc.get("description"):
        parts.append(issue_doc["description"])
    if fix_description:
        parts.append(fix_description)
    context_text = " -- ".join(parts)[:12000]

    # Get issue types from issue doc for filtering
    issue_types = issue_doc.get("issue_types", [])
    
    # Call embeddings API using Google GenAI SDK
    qvec = None
    try:
        emb_resp = client.models.embed_content(
            model=EMBED_MODEL,
            contents=context_text
        )
        # Extract embedding from result
        if hasattr(emb_resp, 'embeddings') and emb_resp.embeddings:
            embedding = emb_resp.embeddings[0]
            if hasattr(embedding, 'values'):
                qvec = list(embedding.values)
        
        if qvec is None:
            logger.warning("Embedding result has unexpected structure, falling back to traditional search")
    except Exception as e:
        logger.exception("Embedding call failed, will use traditional search")

    # Try kNN vector search with filters if we have an embedding
    if qvec and len(qvec) == 3072:
        logger.info("Using kNN vector search for fixes retrieval")
        
        # Build filter for related issue types
        filter_conditions = []
        if issue_types:
            filter_conditions.append({
                "terms": {"related_issue_types": issue_types}
            })
        
        # kNN search body
        body = {
            "size": top_k,
            "knn": {
                "field": "text_embedding",
                "query_vector": qvec,
                "k": top_k * 2,  # Fetch more candidates for filtering
                "num_candidates": 100
            },
            "_source": ["fix_id", "title", "summary", "related_issue_types", "co2_saved", "success_rate", "fix_outcomes"]
        }
        
        # Add filters if we have any
        if filter_conditions:
            body["knn"]["filter"] = {"bool": {"should": filter_conditions, "minimum_should_match": 1}}
        
        try:
            res = es.search(index=FIXES_INDEX, body=body)
            hits = res.get("hits", {}).get("hits", [])
            results = [h["_source"] for h in hits]
            logger.info(f"kNN search returned {len(results)} fixes")
            return results
        except Exception as e:
            logger.exception("kNN vector search failed, falling back to traditional search")
    
    # Fallback: Traditional filtered search (no vector)
    logger.info("Using traditional filtered search for fixes retrieval")
    
    # Build filter query
    filter_conditions = []
    if issue_types:
        filter_conditions.append({
            "terms": {"related_issue_types": issue_types}
        })
    
    if filter_conditions:
        fallback_body = {
            "size": top_k,
            "query": {
                "bool": {
                    "should": filter_conditions,
                    "minimum_should_match": 1
                }
            },
            "_source": ["fix_id", "title", "summary", "related_issue_types", "co2_saved", "success_rate", "fix_outcomes"]
        }
    else:
        # No filters available, just match_all
        fallback_body = {
            "size": top_k,
            "query": {"match_all": {}},
            "_source": ["fix_id", "title", "summary", "related_issue_types", "co2_saved", "success_rate", "fix_outcomes"]
        }
    
    try:
        res = es.search(index=FIXES_INDEX, body=fallback_body)
        hits = res.get("hits", {}).get("hits", [])
        results = [h["_source"] for h in hits]
        logger.info(f"Fallback search returned {len(results)} fixes")
        return results
    except Exception as e:
        logger.exception("Fallback search also failed")
        return []

def call_gemini_with_images(issue_doc: Dict[str, Any],
                            image_bytes_list: List[bytes],
                            image_mimes: List[str],
                            fix_description: str,
                            similar_fixes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Attach images as parts and call Gemini generate_content with strict JSON prompt.
    Returns parsed JSON object or raises.
    """
    prompt = build_prompt(issue_doc, fix_description, similar_fixes, image_count=len(image_bytes_list))

    parts = []
    # attach each image as types.Part
    for b, mime in zip(image_bytes_list, image_mimes):
        img_part = types.Part.from_bytes(data=b, mime_type=mime)
        parts.append(img_part)
    # add the text prompt as final content
    parts.append(prompt)

    config = types.GenerateContentConfig(response_mime_type="application/json")
    # deterministic
    # Note: some SDK versions support temperature in different places; here we pass prompt + config
    try:
        resp = client.models.generate_content(model=GEMINI_MODEL, contents=parts, config=config)
    except Exception as e:
        logger.exception("Gemini generate_content failed")
        raise

    # try parsed
    parsed = None
    if hasattr(resp, "parsed") and resp.parsed:
        parsed = resp.parsed
    else:
        # fallback: try to grab text and parse JSON
        try:
            # resp.output[0].content[0].text? depends on SDK
            raw = ""
            if hasattr(resp, "text"):
                raw = resp.text
            else:
                raw = str(resp)
            # find first brace
            start = raw.find("{")
            if start >= 0:
                raw_json = raw[start:]
                parsed = json.loads(raw_json)
        except Exception as e:
            logger.exception("Failed to parse Gemini raw response")
            raise

    if not isinstance(parsed, dict):
        raise ValueError("Model returned unparsable response")

    return parsed

@app.post("/verify_fix/", response_model=VerifyOut)
def verify_fix(payload: VerifyIn):
    try:
        # 1. fetch issue doc
        issue = get_issue(payload.issue_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Failed to fetch issue from ES")
        raise HTTPException(status_code=500, detail="Error fetching issue")

    # 2. basic image reachability & fetch bytes
    image_bytes = []
    image_mimes = []
    if not payload.image_urls or len(payload.image_urls) < 1:
        raise HTTPException(status_code=400, detail="image_urls is required (>=1)")

    # We will attempt to download all images; if one fails, raise 400
    for url in payload.image_urls:
        try:
            b, mime = fetch_image_bytes(url)
            image_bytes.append(b)
            image_mimes.append(mime)
        except Exception as e:
            logger.exception("Failed to fetch image: %s", url)
            raise HTTPException(status_code=400, detail=f"Could not fetch image url: {url}: {e}")

    # 3. hybrid context retrieval
    similar = hybrid_retrieve_context(issue, payload.fix_description, top_k=3)

    # 4. call gemini with images + prompt
    try:
        model_output = call_gemini_with_images(issue, image_bytes, image_mimes, payload.fix_description, similar)
    except Exception as e:
        logger.exception("Gemini call failed")
        raise HTTPException(status_code=500, detail=f"Model call failed: {e}")

    # 5. validate model_output and map into per_issue_results
    try:
        fix_summary = model_output.get("fix_summary", "") if isinstance(model_output, dict) else ""
        per_results_raw = model_output.get("per_issue_results", [])
        overall_outcome = model_output.get("overall_outcome", "needs_manual_review")
        suggested_success_rate = float(model_output.get("suggested_success_rate", 0.0))
        per_results = []
        for r in per_results_raw:
            # build PerIssueResult; ensure fields exist & types ok
            pir = PerIssueResult(
                issue_type=r.get("issue_type"),
                original_confidence=float(r.get("original_confidence", 0.0)),
                fixed=str(r.get("fixed")),
                confidence=float(r.get("confidence", 0.0)),
                evidence_photos=[int(x) for x in r.get("evidence_photos", [])],
                notes=r.get("notes")
            )
            per_results.append(pir)
    except ValidationError as ve:
        logger.exception("Schema validation error when parsing model output")
        raise HTTPException(status_code=500, detail=f"Model returned invalid schema: {ve}")
    except Exception as e:
        logger.exception("Failed parsing model output")
        raise HTTPException(status_code=500, detail="Model returned unparsable response")

    # 6. store fix doc into ES
    fix_id = make_fix_id(payload.issue_id, payload.ngo_id)
    created_at = now_iso()

    fix_doc = {
        "fix_id": fix_id,
        "issue_id": payload.issue_id,
        "created_by": payload.ngo_id,
        "created_at": created_at,
        "title": fix_summary,
        "summary": payload.fix_description or fix_summary,
        "image_urls": payload.image_urls,
        "photo_count": len(payload.image_urls),
        "co2_saved": 0.0,
        "success_rate": suggested_success_rate,
        "city": issue.get("location", {}).get("city") if isinstance(issue.get("location"), dict) else None,
        "related_issue_types": issue.get("issue_types", []),
        "fix_outcomes": [r.dict() for r in per_results],
        "text_embedding": None,  # optional: you can embed summary here
        "source_doc_ids": [payload.issue_id]
    }

    try:
        es.index(index=FIXES_INDEX, id=fix_id, document=fix_doc)
    except Exception:
        logger.exception("Failed to index fix doc")
        # still continue but warn
        raise HTTPException(status_code=500, detail="Failed to index fix doc into ES")

    # 7. update issues doc: append evidence_ids and set status/flags as simple mapping
    try:
        # naive update: search for doc id and update by query
        # Find existing issue ES doc id
        q = {"query": {"term": {"issue_id": {"value": payload.issue_id}}}}
        res = es.search(index=ISSUES_INDEX, body=q, size=1)
        hits = res.get("hits", {}).get("hits", [])
        if hits:
            doc_id = hits[0]["_id"]
            issue_source = hits[0]["_source"]
            # determine new status based on overall_outcome
            new_status = issue_source.get("status", "open")
            if overall_outcome == "closed":
                new_status = "closed"
                update_fields = {
                    "status": new_status,
                    "closed_by": payload.ngo_id,
                    "closed_at": created_at
                }
            elif overall_outcome == "partially_closed":
                new_status = "verified"
                update_fields = {
                    "status": new_status
                }
            else:
                update_fields = {
                    "status": issue_source.get("status", "open")
                }

            # append evidence_ids
            existing_evidence = issue_source.get("evidence_ids", [])
            existing_evidence.append(fix_id)
            update_fields["evidence_ids"] = existing_evidence

            es.update(index=ISSUES_INDEX, id=doc_id, body={"doc": update_fields})
    except Exception:
        logger.exception("Failed to update issue doc; continuing")

    out = VerifyOut(
        fix_id=fix_id,
        issue_id=payload.issue_id,
        per_issue_results=per_results,
        overall_outcome=overall_outcome,
        suggested_success_rate=suggested_success_rate,
        created_at=created_at
    )

    return out
