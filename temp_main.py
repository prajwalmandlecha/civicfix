from datetime import datetime, timedelta, timezone
import json
from typing import List, Tuple
import uuid
import logging 
import requests
from fastapi import FastAPI, File, Form, Request, HTTPException, UploadFile, status
from firebase_admin import auth, credentials, initialize_app
from dotenv import load_dotenv
import os
from google.cloud import storage
from pydantic import ValidationError
from fastapi.middleware.cors import CORSMiddleware

from schema import AnalyzeOut,  Location, ReportIn
from typing import List, Optional
from elasticsearch import Elasticsearch, TransportError

ES_HOST = os.getenv("ES_HOST", "http://localhost:9200")
ES_INDEX = os.getenv("ES_INDEX", "issues")

# Load Elasticsearch auth and SSL settings
ES_USER = os.getenv("ES_USER")
ES_PASS = os.getenv("ES_PASS")
ES_VERIFY_CERTS = os.getenv("ES_VERIFY_CERTS", "true").lower() in ("1", "true", "yes")
ES_CA_CERT = os.getenv("ES_CA_CERT")

# Configure Elasticsearch client with authentication and SSL verify settings
es_kwargs = {}
if ES_USER and ES_PASS:
    es_kwargs["basic_auth"] = (ES_USER, ES_PASS)
if not ES_VERIFY_CERTS:
    es_kwargs["verify_certs"] = False
elif ES_CA_CERT:
    es_kwargs["ca_certs"] = ES_CA_CERT

es = Elasticsearch(ES_HOST, **es_kwargs)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

cred = credentials.Certificate("serviceAccountKey.json")
default_app = initialize_app(cred)

load_dotenv()

BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
if not BUCKET_NAME:
    raise RuntimeError("GCS_BUCKET_NAME must be set in .env")
API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
CLOUD_ANALYZER_URL = os.getenv("CLOUD_ANALYZER_URL", "http://localhost:8001")  # URL of your cloud service
# CLOUD_ANALYZER_URL = "http://localhost:8001"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

storage_client = storage.Client()

# @app.middleware("http")
# async def verify_firebase_token(request: Request):
#     auth_header = request.headers.get("Authorization")
#     if not auth_header or not auth_header.startswith("Bearer "):
#         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    
#     id_token = auth_header.split("Bearer ")[1]
#     try:
#         decoded_token = auth.verify_id_token(id_token)
#         print("Token verified successfully:", decoded_token)
#         return decoded_token
#     except Exception as e:
#         print(f"Error verifying token: {e}")
#         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.post("/submit-issue")
async def submit_issue(
    file: UploadFile = File(...),
    locationstr: str = Form(...),
    description: str = Form(...),
    labels: Optional[List[str]] = Form(None),
    timestamp: Optional[str] = Form(None)
):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    try:
        location_data = json.loads(locationstr)
        location = Location(**location_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid location format")

    labels = labels or []

    file.filename = f"issues/{uuid.uuid4()}"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")

    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(file.filename)
    blob.upload_from_string(data, content_type=file.content_type)
    public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{file.filename}"

    try:
        analyzer_response = requests.post(
            f"{CLOUD_ANALYZER_URL}/analyze/",
            json={
                "image_url": public_url,
                "description": description,
                "location": location.model_dump(),
                "timestamp": str(timestamp),
                "user_selected_labels": labels, 
            },
        )
        analyzer_response.raise_for_status()
        analysis_result = analyzer_response.json()
        logger.info(f"Analyzer response: {analysis_result}")
        issues = analysis_result.get("detected_issues", [])
        no_issues_found = analysis_result.get("no_issues_found", False)

        if(no_issues_found):
            logger.info("No issues found in the submitted image.")
            #need to delete the photo from GCS
    except requests.exceptions.RequestException as e:
        logger.exception("Failed to call cloud analyzer")
        raise HTTPException(status_code=500, detail=f"Analysis service error: {str(e)}")

    return {"image_url": public_url, "issues": issues, "location": location, "no_issues_found": no_issues_found}

@app.get("/issues/")
async def get_issues(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    limit: int = 10,
    days_back: int = 30
):
    """    
    Get issues near a location, sorted by distance and recency.
    
    Args:
        latitude: Location latitude
        longitude: Location longitude
        radius_km: Search radius in kilometers (default 5km)
        limit: Maximum number of results (default 10)
        days_back: Only include issues from last N days (default 30)
    """
    try:
        date_threshold = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

        query = {
            "size": limit,
            "query": {
                "bool": {
                    "must": [
                        {
                            "range": {
                                "reported_at": {
                                    "gte": date_threshold
                                }
                            }
                        }
                    ],
                    "filter": [
                        {
                            "geo_distance": {
                                "distance": f"{radius_km}km",
                                "location": {
                                    "lat": latitude,
                                    "lon": longitude
                                }
                            }
                        }
                    ]
                }
            },
            "sort": [
                {
                    "_geo_distance": {
                        "location": {
                            "lat": latitude,
                            "lon": longitude
                        },
                        "order": "asc",
                        "unit": "km"
                    }
                },
                {
                    "reported_at": {
                        "order": "desc"
                    }
                }
            ],
            "_source": [
                "issue_id",
                "location",
                "description",
                "issue_types",
                "severity_score",
                "status",
                "reported_at",
                "photo_url",
                "upvotes",
                "impact_score",
                "detected_issues"
            ]
        }

        response = es.search(index=ES_INDEX, body=query)
        issues = []

        for hit in response["hits"]["hits"]:
            issue_data = hit["_source"]
            if hit.get("sort"):
                issue_data["distance_km"] = hit["sort"][0]
            issues.append(issue_data)

        return {
            "location": {"latitude": latitude, "longitude": longitude},
            "radius_km": radius_km,
            "count": len(issues),
            "issues": issues
        }


    except TransportError as e:
        logger.exception("Failed to retrieve nearby issues from Elasticsearch")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/issues/latest")
async def get_latest_issues(
    limit: int = 10,
    days_back: Optional[int] = None
):
    """
    Get the latest issues sorted by reported time.
    
    Args:
        limit: Maximum number of results (default 10)
        days_back: Only include issues from last N days (optional)
    """
    try:
        query = {
            "size": limit,
            "query": {
                "match_all": {}
            },
            "sort": [
                {
                    "reported_at": {
                        "order": "desc"
                    }
                }
            ],
            "_source": [
                "issue_id",
                "location",
                "description",
                "issue_types",
                "severity_score",
                "status",
                "reported_at",
                "photo_url",
                "upvotes",
                "impact_score",
                "detected_issues"
            ]
        }
        
        # Add date filter if days_back is specified
        if days_back:
            date_threshold = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
            query["query"] = {
                "range": {
                    "reported_at": {
                        "gte": date_threshold
                    }
                }
            }
        
        response = es.search(index=ES_INDEX, body=query)
        
        issues = []
        for hit in response["hits"]["hits"]:
            issue_data = hit["_source"]
            issues.append(issue_data)
        
        return {
            "count": len(issues),
            "issues": issues
        }
        
    except TransportError as e:
        logger.exception("Failed to retrieve latest issues from Elasticsearch")
        raise HTTPException(status_code=500, detail="Internal server error")