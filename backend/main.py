from datetime import datetime, timedelta, timezone
import json
import uuid
import logging
import requests
<<<<<<< HEAD
from fastapi import FastAPI, File, Form, Request, HTTPException, UploadFile, status
from firebase_admin import auth, credentials, initialize_app, firestore
from dotenv import load_dotenv
import os
from google.cloud import storage
from pydantic import ValidationError
from fastapi.middleware.cors import CORSMiddleware

from schema import AnalyzeOut,  Location, ReportIn
from typing import List, Optional
from elasticsearch import Elasticsearch, TransportError
import ssl
import urllib3

load_dotenv()

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ES_HOST = os.getenv("ES_URL", "http://localhost:9200")
ES_INDEX = os.getenv("ES_INDEX", "issues")
ES_USER = os.getenv("ES_USER")
ES_PASS = os.getenv("ES_PASS")
ES_VERIFY_CERTS = os.getenv("ES_VERIFY_CERTS", "true").lower() in ("1", "true", "yes")
ES_CA_CERT = os.getenv("ES_CA_CERT")

es_kwargs = {}
if ES_USER and ES_PASS:
    es_kwargs["basic_auth"] = (ES_USER, ES_PASS)

if not ES_VERIFY_CERTS:
    # Disable certificate verification for environments with self-signed certs.
    es_kwargs["verify_certs"] = False
elif ES_CA_CERT:
    es_kwargs["ca_certs"] = ES_CA_CERT

es = Elasticsearch(ES_HOST, **es_kwargs)

=======
import os
from datetime import datetime

# --- Added Depends ---
from fastapi import (
    FastAPI,
    File,
    Form,
    Request,
    HTTPException,
    UploadFile,
    status,
    Depends,
)
from fastapi.middleware.cors import CORSMiddleware

# --- Import auth exceptions ---
from firebase_admin import (
    auth,
    credentials,
    initialize_app,
    _auth_utils as firebase_auth_errors,
)
from dotenv import load_dotenv
from google.cloud import storage
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional

from elasticsearch import AsyncElasticsearch, NotFoundError, RequestError
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
import asyncio
>>>>>>> 452ce09f1f9c3eba66f250586a281de54d7dc51d

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

<<<<<<< HEAD

#firebase initialization
cred = credentials.Certificate("serviceAccountKey.json")
default_app = initialize_app(cred)
db = firestore.client()


=======
# --- Firebase Setup ---
try:
    cred = credentials.Certificate("serviceAccountKey.json")
    default_app = initialize_app(cred)
    logger.info("Firebase Admin initialized successfully.")
except Exception as fb_err:
    logger.error(f"Failed to initialize Firebase Admin: {fb_err}")
    default_app = None  # Handle missing credentials

# --- Environment Variables ---
load_dotenv()
>>>>>>> 452ce09f1f9c3eba66f250586a281de54d7dc51d
BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
CLOUD_ANALYZER_URL = os.getenv("CLOUD_ANALYZER_URL", "http://localhost:8001")
ES_URL = os.getenv("ES_URL", "http://localhost:9200")
SPAM_REPORT_THRESHOLD = 3
REOPEN_REPORT_THRESHOLD = 3

if not BUCKET_NAME:
    logger.warning("GCS_BUCKET_NAME env var not set. File uploads will fail.")

<<<<<<< HEAD
app = FastAPI()

logger.info(f"CLOUD_ANALYZER_URL={CLOUD_ANALYZER_URL}")

=======
# --- FastAPI App and ES Client ---
app = FastAPI(title="CivicFix API Gateway")
es_client: Optional[AsyncElasticsearch] = None


# --- Lifespan Events for ES Client ---
@app.on_event("startup")
async def startup_event():
    # ... (Keep the correct startup_event) ...
    global es_client
    logger.info(f"Connecting to ES at {ES_URL}")
    es_client = AsyncElasticsearch(ES_URL, http_compress=True, request_timeout=30)
    for i in range(3):
        try:
            info = await es_client.info()
            cluster_name = info.body.get("cluster_name", "Unknown")
            logger.info(f"Successfully connected to ES cluster: {cluster_name}")
            return
        except ConnectionError as ce:
            logger.warning(f"Attempt {i+1} ES connect fail (ConnErr): {ce}")
        except TimeoutError:
            logger.warning(f"Attempt {i+1} ES connect fail (Timeout).")
        except Exception as e:
            logger.error(f"Attempt {i+1} ES connect fail (Other): {e}")
        if i < 2:
            await asyncio.sleep(2 * (i + 1))
    logger.error("Failed ES connect after multiple attempts.")
    es_client = None


@app.on_event("shutdown")
async def shutdown_event():
    # ... (Keep the correct shutdown_event) ...
    if es_client:
        await es_client.close()
        logger.info("ES connection closed.")


# --- NEW: Firebase Authentication Middleware ---
@app.middleware("http")
async def verify_firebase_token_middleware(request: Request, call_next):
    # Allow access to docs and root path without authentication
    # --- ADDED /api/issues to the public list ---
    public_paths = ["/", "/docs", "/openapi.json", "/api/issues"]

    # Check if the path *starts with* /api/issues (in case of /api/issues/123)
    # A simpler check for now:
    if request.url.path in public_paths:
        response = await call_next(request)
        return response

    # Allow OPTIONS requests for CORS preflight
    if request.method == "OPTIONS":
        response = await call_next(request)
        return response

    if not default_app:  # Check if Firebase initialized
        logger.error("Firebase Admin SDK not initialized. Cannot verify token.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not available",
        )

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        logger.warning(
            f"Missing or invalid Authorization header for: {request.url.path}"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication token",
        )

    id_token = auth_header.split("Bearer ")[1]
    decoded_token = None
    try:
        # Verify the ID token while checking if the token is revoked.
        decoded_token = auth.verify_id_token(id_token, check_revoked=True)
        # --- Store user info in request state ---
        request.state.user = decoded_token
        logger.info(f"Token verified for UID: {decoded_token.get('uid')}")
    except firebase_auth_errors.RevokedIdTokenError:
        logger.warning(
            f"Token revoked for UID: {decoded_token.get('uid') if decoded_token else 'Unknown'}"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked"
        )
    except firebase_auth_errors.UserDisabledError:
        logger.warning(
            f"User account disabled for UID: {decoded_token.get('uid') if decoded_token else 'Unknown'}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is disabled"
        )
    except (ValueError, firebase_auth_errors.InvalidIdTokenError) as e:
        logger.error(f"Invalid token received: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    except Exception as e:
        logger.exception(f"Unexpected error during token verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not verify authentication token",
        )

    response = await call_next(request)
    return response


# --- NEW: Dependency Functions ---
async def get_current_user(request: Request) -> dict:  # Changed Optional[dict] to dict
    user = getattr(request.state, "user", None)
    if user is None:
        logger.error(
            "get_current_user dependency: No user in request state (Middleware issue?)."
        )
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def get_optional_user(request: Request) -> Optional[dict]:
    return getattr(request.state, "user", None)


# --- CORS Middleware (MUST come AFTER Auth Middleware if applied globally) ---
# Actually, middleware order is defined by app.add_middleware order. Auth first is fine.
>>>>>>> 452ce09f1f9c3eba66f250586a281de54d7dc51d
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# --- GCS and Geocoder ---
try:
    storage_client = storage.Client()
    logger.info("GCS client init.")
except Exception as gcs_err:
    logger.error(f"GCS client init fail: {gcs_err}")
    storage_client = None
geolocator = Nominatim(user_agent="civicfix_backend_app_v6")  # Incremented version


# --- Geocoding Helper ---
def geocode_location(address: str, attempts=3) -> Optional[Dict[str, Any]]:
    # ... (Keep the working geocode_location function) ...
    logger.info(f"Attempting geocode: '{address}'")
    if not address:
        return None
    for attempt in range(attempts):
        try:
            loc = geolocator.geocode(address, timeout=10)
            if loc:
                logger.info(f"Geocode OK: ({loc.latitude}, {loc.longitude})")
                return {
                    "latitude": loc.latitude,
                    "longitude": loc.longitude,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }
            else:
                logger.warning(
                    f"Geocode attempt {attempt+1}: Addr '{address}' not found."
                )
                return None
        except (GeocoderTimedOut, GeocoderServiceError) as e:
            logger.warning(f"Geocode attempt {attempt+1} fail: {e}")
        except Exception as e:
            logger.exception(f"Geocode unexpected err attempt {attempt+1}")
            return None
    logger.error("Geocode fail after retries.")
    return None


# --- API Endpoints ---


@app.get("/")
async def root():
    # ... (Keep root, public access allowed by middleware) ...
    return {"message": "CivicFix API Gateway - Running"}

<<<<<<< HEAD
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

=======

# --- Replace the existing get_all_issues function ---
@app.get("/api/issues")
async def get_all_issues(
    user: Optional[dict] = Depends(get_optional_user),
):  # Auth Optional
    """
    Fetches all issues from Elasticsearch, adds address via reverse geocoding,
    and sorts them by open upvotes (descending), then severity.
    """
    if user:
        logger.info(f"User {user.get('uid')} fetching issues.")
    else:
        logger.info("Anon user fetching issues.")

    if not es_client:
        logger.error("get_all_issues called but es_client is not available.")
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    logger.info("Fetching issues from Elasticsearch...")
    issues_with_address = []
>>>>>>> 452ce09f1f9c3eba66f250586a281de54d7dc51d
    try:
        # Fetch issues sorted by upvotes.open descending, then severity_score descending
        response = await es_client.search(
            index="issues",
            body={
                "query": {"match_all": {}},
                # --- SIMPLIFIED SORT (Removed the failing _script) ---
                "sort": [
                    {
                        "upvotes.open": {"order": "desc", "missing": "_last"}
                    },  # Sort by open upvotes first
                    {
                        "severity_score": {"order": "desc", "missing": "_last"}
                    },  # Then by severity
                ],
            },
            size=100,
        )
        logger.info(f"Elasticsearch returned {len(response['hits']['hits'])} issues.")
        issues_source = [doc["_source"] for doc in response["hits"]["hits"]]

        # --- Reverse Geocode each issue's location ---
        logger.info("Starting reverse geocoding for fetched issues...")
        processed_count = 0
        for issue in issues_source:
            issue_copy = issue.copy()
            display_address = "Address lookup failed"  # Default error message
            location = issue.get("location")

            if isinstance(location, dict) and "lat" in location and "lon" in location:
                lat, lon = location.get("lat"), location.get("lon")
                if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                    try:
                        geo_result = geolocator.reverse(
                            f"{lat}, {lon}", exactly_one=True, timeout=5, language="en"
                        )
                        if geo_result and geo_result.address:
                            address_parts = geo_result.address.split(",")
                            if len(address_parts) >= 3:
                                display_address = f"{address_parts[0].strip()}, {address_parts[1].strip()}, {address_parts[-2].strip()}"
                            else:
                                display_address = geo_result.address
                        else:
                            display_address = "Address not found"
                            logger.warning(
                                f"Reverse geocoding for ({lat},{lon}) returned no result."
                            )
                    except (GeocoderTimedOut, GeocoderServiceError) as geo_e:
                        display_address = "Address lookup timeout/error"
                        logger.warning(
                            f"Reverse geocoding failed for ({lat},{lon}): {geo_e}"
                        )
                    except Exception as e:
                        display_address = "Address lookup error"
                        logger.exception(
                            f"Unexpected error during reverse geocoding for ({lat},{lon})"
                        )
                else:
                    display_address = "Invalid coordinates"
                    logger.warning(
                        f"Skipping geocoding for invalid coordinates: lat={lat}, lon={lon}"
                    )
            else:
                display_address = "Missing coordinates"
                logger.warning(
                    f"Skipping geocoding for issue {issue.get('issue_id', 'N/A')} due to missing/invalid location: {location}"
                )

            issue_copy["display_address"] = display_address
            issues_with_address.append(issue_copy)
            processed_count += 1
        # --- End Reverse Geocode ---

        logger.info(f"Finished processing {processed_count} issues.")
        return {"issues": issues_with_address}

    except NotFoundError:
        logger.warning("Issues index not found.")
        return {"issues": []}
    except Exception as e:
        logger.exception(
            "Failed severely during fetch/process issues from Elasticsearch"
        )
        raise HTTPException(
            status_code=500, detail=f"Database query or processing failed: {e}"
        )

<<<<<<< HEAD
    labels = labels or []

    file.filename = f"issues/{uuid.uuid4()}"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")

=======

# --- Submit Issue Endpoint (Requires Auth) ---
@app.post("/submit-issue")
async def submit_issue(
    # --- Added user dependency ---
    user: dict = Depends(get_current_user),  # Requires valid token
    file: UploadFile = File(...),
    location_text: str = Form(...),
    description: str = Form(...),
    # --- Added is_anonymous form field ---
    is_anonymous: bool = Form(False),
):
    # ... (Keep geocoding and GCS upload logic) ...
    if not storage_client:
        raise HTTPException(503, "GCS unavailable")
    if not file:
        raise HTTPException(400, "No file")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Image only")
    geocoded = geocode_location(location_text)
    if not geocoded:
        raise HTTPException(400, f"Cannot find coords for: '{location_text}'.")
    file_uuid = uuid.uuid4()
    file.filename = f"issues/{file_uuid}"
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if not BUCKET_NAME:
        raise HTTPException(500, "GCS bucket not config")
>>>>>>> 452ce09f1f9c3eba66f250586a281de54d7dc51d
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(file.filename)
    try:
<<<<<<< HEAD
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
                                "created_at": {
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
                    "created_at": {
                        "order": "desc"
                    }
                }
            ],
            "_source": [
                "issue_id",
                "reported_by",
                "uploader_display_name",
                "source",
                "status",
                "closed_by",
                "closed_at",
                "created_at",
                "updated_at",
                "location",
                "description",
                "auto_caption",
                "user_selected_labels",
                "photo_url",
                "detected_issues",
                "issue_types",
                "label_confidences",
                "severity_score",
                "fate_risk_co2",
                "co2_kg_saved",
                "predicted_fix",
                "predicted_fix_confidence",
                "evidence_ids",
                "auto_review_flag",
                "upvotes",
                "reports",
                "is_spam",
                "impact_score"
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
=======
        blob.upload_from_string(data, content_type=file.content_type)
        public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{file.filename}"
        logger.info(f"GCS OK: {public_url}")
    except Exception as gcs_err:
        logger.exception("GCS upload fail")
        raise HTTPException(500, f"GCS fail: {gcs_err}")

    # --- Call Analyzer (Pass User Info) ---
    try:
        logger.info(f"Calling analyzer: {CLOUD_ANALYZER_URL}/analyze/")
        # --- Determine reporter ID and source ---
        reporter_id = (
            "anonymous" if is_anonymous else user.get("uid", "anonymous_fallback")
        )  # Fallback just in case
        source_type = "anonymous" if is_anonymous else "citizen"
        if reporter_id == "anonymous_fallback":
            logger.warning("UID missing from verified token!")

        analyzer_payload = {
            "image_url": public_url,
            "description": description,
            "location": {
                "latitude": geocoded["latitude"],
                "longitude": geocoded["longitude"],
            },
            "timestamp": geocoded["timestamp"],
            "user_selected_labels": [],
            # --- Pass reporter info ---
            "reported_by": reporter_id,
            "source": source_type,
        }
        logger.debug(f"Analyzer payload: {analyzer_payload}")
        analyzer_response = requests.post(
            f"{CLOUD_ANALYZER_URL}/analyze/", json=analyzer_payload, timeout=60
        )
        analyzer_response.raise_for_status()
        analysis_result = analyzer_response.json()
        logger.info(f"Analyzer OK for user {reporter_id}. Response: {analysis_result}")

        return {
            "image_url": public_url,
            "analysis": analysis_result,
            "location_text": location_text,
            "location_coords": {
                "latitude": geocoded["latitude"],
                "longitude": geocoded["longitude"],
            },
        }
    # ... (Keep existing error handling) ...
    except requests.exceptions.HTTPError as http_err:
        error_detail = (
            f"Analysis error: {http_err.response.status_code}. {http_err.response.text}"
        )
        logger.error(error_detail)
        raise HTTPException(502, "Error communicating with analysis service.")
    except requests.exceptions.RequestException as e:
        logger.exception("Analyzer conn fail")
        raise HTTPException(502, f"Analysis conn err: {e}")
    except Exception as e:
        logger.exception("Unexpected err in /submit-issue")
        raise HTTPException(500, f"Internal server err: {e}")


# --- Upvote Endpoint (Requires Auth) ---
@app.post("/api/issues/{issue_id}/upvote")
async def upvote_issue(
    issue_id: str, user: dict = Depends(get_current_user)
):  # Require user
    logger.info(f"User {user.get('uid')} upvoting issue {issue_id}")
    if not es_client:
        raise HTTPException(503, "DB unavailable")
    # ... (Rest of upvote logic remains the same) ...
    try:
        get_resp = await es_client.get(index="issues", id=issue_id)
        status = get_resp["_source"].get("status", "open")
        if status == "open":
            script = "ctx._source.upvotes.open += 1"
        elif status == "closed":
            script = "ctx._source.upvotes.closed += 1"
        elif status == "verified":
            script = "ctx._source.upvotes.verified += 1"
        else:
            logger.warning(
                f"Upvoting issue {issue_id} (status: {status}). Adding to open."
            )
            script = "ctx._source.upvotes.open += 1"
        await es_client.update(
            index="issues",
            id=issue_id,
            script={"source": script, "lang": "painless"},
            refresh=True,
            retry_on_conflict=3,
        )
        updated = await es_client.get(index="issues", id=issue_id)
        logger.info(
            f"Upvote OK for {issue_id}. New: {updated['_source'].get('upvotes')}"
        )
        return {"message": "Upvoted", "updated_issue": updated["_source"]}
    except NotFoundError:
        logger.warning(f"Upvote fail: {issue_id} not found.")
        raise HTTPException(404, f"{issue_id} not found")
    except RequestError as e:
        logger.error(f"ES Err upvote {issue_id}: {e.info}")
        raise HTTPException(400, f"DB err: {e.error}")
    except Exception as e:
        logger.exception(f"Unexpected err upvote {issue_id}")
        raise HTTPException(500, f"Server err: {e}")


# --- Report Endpoint (Requires Auth, uses Closed status) ---
@app.post("/api/issues/{issue_id}/report")
async def report_issue(
    issue_id: str, user: dict = Depends(get_current_user)
):  # Require user
    logger.info(f"User {user.get('uid')} reporting issue {issue_id}")
    if not es_client:
        raise HTTPException(503, "DB unavailable")
    # ... (Rest of report logic remains the same, using 'closed') ...
    try:
        get_resp = await es_client.get(index="issues", id=issue_id)
        source = get_resp["_source"]
        status = source.get("status", "open")
        reports = source.get("reports", {})
        params = {"now": datetime.utcnow().isoformat() + "Z"}
        script = None
        script_defined = False
        if status == "open":
            count = reports.get("open", 0)
            if count + 1 >= SPAM_REPORT_THRESHOLD:
                script = "ctx._source.reports.open = 0; ctx._source.upvotes.open = 0; ctx._source.status = 'closed'; ctx._source.updated_at = params.now; ctx._source.closed_at = params.now; ctx._source.closed_by = 'community_report';"
                script_defined = True
            else:
                script = "ctx._source.reports.open += 1"
                script_defined = True
        elif status == "closed":
            count = reports.get("closed", 0)
            if count + 1 >= REOPEN_REPORT_THRESHOLD:
                script = "ctx._source.reports.closed = 0; ctx._source.upvotes.closed = 0; ctx._source.status = 'open'; ctx._source.updated_at = params.now; ctx._source.closed_at = null; ctx._source.closed_by = null;"
                params["threshold"] = REOPEN_REPORT_THRESHOLD
                script_defined = True
            else:
                script = "ctx._source.reports.closed += 1"
                script_defined = True
        elif status == "verified":
            script = "ctx._source.reports.verified += 1"
            script_defined = True
        elif status == "spam":
            logger.warning(f"Report ignored spam {issue_id}.")
            return {"message": "Issue spam", "updated_issue": source}
        else:
            logger.error(f"Cannot report {issue_id}, unknown status: {status}.")
            return {"message": f"Unknown status {status}", "updated_issue": source}
>>>>>>> 452ce09f1f9c3eba66f250586a281de54d7dc51d

        if script_defined:
            await es_client.update(
                index="issues",
                id=issue_id,
                script={"source": script, "lang": "painless", "params": params},
                refresh=True,
                retry_on_conflict=3,
            )
        else:
            logger.info("No update script needed.")

<<<<<<< HEAD
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
                    "created_at": {
                        "order": "desc"
                    }
                }
            ],
            "_source": [
                "issue_id",
                "reported_by",
                "uploader_display_name",
                "source",
                "status",
                "closed_by",
                "closed_at",
                "created_at",
                "updated_at",
                "location",
                "description",
                "auto_caption",
                "user_selected_labels",
                "photo_url",
                "detected_issues",
                "issue_types",
                "label_confidences",
                "severity_score",
                "fate_risk_co2",
                "co2_kg_saved",
                "predicted_fix",
                "predicted_fix_confidence",
                "evidence_ids",
                "auto_review_flag",
                "upvotes",
                "reports",
                "is_spam",
                "impact_score"
            ]
        }
        
        # Add date filter if days_back is specified
        if days_back:
            date_threshold = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
            query["query"] = {
                "range": {
                    "created_at": {
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

# ...existing code...
=======
        updated = await es_client.get(index="issues", id=issue_id)
        new_status = updated["_source"].get("status")
        logger.info(
            f"Report OK for {issue_id}. New counts: {updated['_source'].get('reports')}, New Status: {new_status}"
        )
        return {"message": "Reported", "updated_issue": updated["_source"]}
    except NotFoundError:
        logger.warning(f"Report fail: {issue_id} not found.")
        raise HTTPException(404, f"{issue_id} not found")
    except RequestError as e:
        logger.error(f"ES Err report {issue_id}: {e.info}")
        raise HTTPException(400, f"DB err: {e.error}")
    except Exception as e:
        logger.exception(f"Unexpected err report {issue_id}")
        raise HTTPException(500, f"Server err: {e}")
>>>>>>> 452ce09f1f9c3eba66f250586a281de54d7dc51d
