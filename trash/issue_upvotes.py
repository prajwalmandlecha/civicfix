from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from elasticsearch import Elasticsearch, NotFoundError
import os
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()

ISSUE_VERIFIER_URL = os.environ.get("ISSUE_VERIFIER_URL")
ES_URL = os.environ.get("ES_URL", "http://localhost:9200")
ES_USER = os.environ.get("ES_USER")
ES_PASSWORD = os.environ.get("ES_PASSWORD")
ISSUES_INDEX = "issues"
REPORT_SPAM_THRESHOLD = 5  # Change this value to adjust spam threshold


if ES_USER and ES_PASSWORD:
    es = Elasticsearch(ES_URL, basic_auth=(ES_USER, ES_PASSWORD), verify_certs=False)
else:
    es = Elasticsearch(ES_URL, verify_certs=False)

app = FastAPI()

class UpvoteRequest(BaseModel):
    issue_id: str
    user_id: str

class ReportRequest(BaseModel):
    issue_id: str
    user_id: str 

class SubmitFixRequest(BaseModel):
    issue_id: str
    ngo_id: str
    image_urls: list[str]
    fix_description: str = ""
    timestamp: str = datetime.now(timezone.utc).isoformat()


@app.post("/upvote")
def upvote_issue(req: UpvoteRequest):
    # Fetch the issue document
    q = {"query": {"term": {"issue_id": {"value": req.issue_id}}}}
    resp = es.search(index=ISSUES_INDEX, body=q, size=1)
    hits = resp.get("hits", {}).get("hits", [])
    if not hits:
        raise HTTPException(status_code=404, detail="Issue not found")
    doc_id = hits[0]["_id"]
    issue = hits[0]["_source"]

    # Initialize upvotes if not present
    upvotes = issue.get("upvotes", {"open": 0, "closed": 0})
    if not isinstance(upvotes, dict):
        upvotes = {"open": 0, "closed": 0}

    # Increment the correct upvote counter
    status = issue.get("status", "open")
    if status == "open":
        upvotes["open"] = upvotes.get("open", 0) + 1
    else:
        upvotes["closed"] = upvotes.get("closed", 0) + 1

    # Update the document
    es.update(index=ISSUES_INDEX, id=doc_id, body={"doc": {"upvotes": upvotes}})
    return {"message": "Upvote registered", "upvotes": upvotes}


@app.post("/report")
def report_issue(req: ReportRequest):
    # Fetch the issue document
    q = {"query": {"term": {"issue_id": {"value": req.issue_id}}}}
    resp = es.search(index=ISSUES_INDEX, body=q, size=1)
    hits = resp.get("hits", {}).get("hits", [])
    if not hits:
        raise HTTPException(status_code=404, detail="Issue not found")
    doc_id = hits[0]["_id"]
    issue = hits[0]["_source"]

    # Initialize reports if not present
    reports = issue.get("reports", {"open": 0, "closed": 0})
    if not isinstance(reports, dict):
        reports = {"open": 0, "closed": 0}

    # Increment the correct report counter
    status = issue.get("status", "open")
    if status == "open":
        reports["open"] = reports.get("open", 0) + 1
    else:
        reports["closed"] = reports.get("closed", 0) + 1

    # Determine if is_spam should be set
    is_spam = False
    if (status == "open" and reports["open"] > REPORT_SPAM_THRESHOLD) or (status != "open" and reports["closed"] > REPORT_SPAM_THRESHOLD): is_spam = True

    # Update the document
    es.update(index=ISSUES_INDEX, id=doc_id, body={"doc": {"reports": reports, "is_spam": is_spam}})
    return {"message": "Report registered", "reports": reports, "is_spam": is_spam}


# Endpoint to submit fix verification request to Issue Verifier
@app.post("/submit_fix")
def submit_fix(req: SubmitFixRequest):
    if not ISSUE_VERIFIER_URL:
        raise HTTPException(status_code=500, detail="ISSUE_VERIFIER_URL not set in environment")
    url = ISSUE_VERIFIER_URL.rstrip("/") + "/verify_fix/"
    payload = req.dict()
    # If timestamp is None, remove it to let Issue Verifier use its default
    if payload.get("timestamp") is None:
        payload.pop("timestamp")
    try:
        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Issue Verifier error: {e}")