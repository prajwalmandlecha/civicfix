from datetime import datetime, timedelta, timezone
import asyncio
import json
import uuid
import logging
import requests
import os
from datetime import datetime
from fastapi import (
    FastAPI,
    File,
    Form,
    Request,
    HTTPException,
    UploadFile,
    status,
    Depends,
)  # Added Depends
from fastapi.middleware.cors import CORSMiddleware

# --- ADDED firestore and auth_errors ---
from firebase_admin import (
    auth,
    credentials,
    initialize_app,
    _auth_utils as firebase_auth_errors,
    firestore,
)
from dotenv import load_dotenv
from google.cloud import storage
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional

from elasticsearch import AsyncElasticsearch, NotFoundError, RequestError
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
import asyncio

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# --- Firebase Setup ---
default_app = None
db = None

try:
    import os
    import firebase_admin
    
    # Check if Firebase is already initialized
    try:
        default_app = firebase_admin.get_app()
        logger.info("✓ Firebase app already initialized, reusing existing instance")
    except ValueError:
        # Firebase not initialized yet, initialize it
        service_account_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
        logger.info(f"Attempting to load Firebase credentials from: {service_account_path}")
        
        if not os.path.exists(service_account_path):
            raise FileNotFoundError(f"serviceAccountKey.json not found at {service_account_path}")
        
        cred = credentials.Certificate(service_account_path)
        default_app = initialize_app(cred)
        logger.info("✓ Firebase Admin initialized successfully")
    
    # Initialize Firestore DB client (synchronous)
    db = firestore.client()
    logger.info("✓ Firestore client initialized successfully")
    
except Exception as fb_err:
    logger.error(f"✗ Failed to initialize Firebase Admin: {fb_err}", exc_info=True)
    default_app = None
    db = None  # Set db to None if init fails

# --- Environment Variables ---
load_dotenv()
BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
CLOUD_ANALYZER_URL = os.getenv("CLOUD_ANALYZER_URL", "http://localhost:8001")
# --- NEW: Verifier URL (pointing to port 8002) ---
VERIFIER_URL = os.getenv("VERIFIER_URL", "http://localhost:8002/verify_fix/")
ES_URL = os.getenv("ES_URL", "http://localhost:9200")
# For cloud ES, try HTTP if HTTPS fails
ES_URL_HTTP = (
    ES_URL.replace("https://", "http://") if ES_URL.startswith("https://") else ES_URL
)
ES_USER = os.getenv("ES_USER")
ES_PASS = os.getenv("ES_PASS")
ES_VERIFY_CERTS = os.getenv("ES_VERIFY_CERTS", "true").lower() in ("1", "true", "yes")
ES_CA_CERT = os.getenv("ES_CA_CERT")
SPAM_REPORT_THRESHOLD = 3
REOPEN_REPORT_THRESHOLD = 3

# Debug: Print all relevant environment variables
logger.info(f"Environment Variables:")
logger.info(f"  ES_URL: {ES_URL}")
logger.info(f"  ES_USER: {'***' if ES_USER else None}")
logger.info(f"  ES_PASS: {'***' if ES_PASS else None}")
logger.info(f"  ES_VERIFY_CERTS: {ES_VERIFY_CERTS}")
logger.info(f"  ES_CA_CERT: {ES_CA_CERT}")
logger.info(f"  GCS_BUCKET_NAME: {BUCKET_NAME}")
logger.info(f"  CLOUD_ANALYZER_URL: {CLOUD_ANALYZER_URL}")

if not BUCKET_NAME:
    logger.warning("GCS_BUCKET_NAME env var not set. File uploads will fail.")

# --- FastAPI App and ES Client ---
app = FastAPI(title="CivicFix API Gateway")
es_client: Optional[AsyncElasticsearch] = None
es_connection_kwargs: Dict[str, Any] = {}
if ES_USER and ES_PASS:
    es_connection_kwargs["basic_auth"] = (ES_USER, ES_PASS)
if not ES_VERIFY_CERTS:
    es_connection_kwargs["verify_certs"] = False
    es_connection_kwargs["ssl_context"] = None  # Disable SSL context checking
elif ES_CA_CERT:
    es_connection_kwargs["ca_certs"] = ES_CA_CERT


# --- Lifespan Events for ES Client ---
@app.on_event("startup")
async def startup_event():
    # ... (This is your existing, working code) ...
    global es_client
    logger.info(f"Connecting to ES at {ES_URL}")

    # Try HTTPS first, then HTTP if it fails
    urls_to_try = [ES_URL]
    if ES_URL.startswith("https://"):
        urls_to_try.append(ES_URL_HTTP)

    for url in urls_to_try:
        logger.info(f"Trying ES connection to {url}")
        # Initialize AsyncElasticsearch with auth and SSL settings
        es_client = AsyncElasticsearch(
            hosts=[url],
            http_compress=True,
            request_timeout=45,  # increased to 45 seconds
            **es_connection_kwargs,
        )

        for i in range(3):
            try:
                info = await es_client.info()
                cluster_name = info.body.get("cluster_name", "Unknown")
                logger.info(
                    f"Successfully connected to ES cluster: {cluster_name} at {url}"
                )
                return
            except ConnectionError as ce:
                logger.warning(
                    f"Attempt {i+1} ES connect fail (ConnErr) to {url}: {ce}"
                )
            except TimeoutError:
                logger.warning(f"Attempt {i+1} ES connect fail (Timeout) to {url}.")
            except Exception as e:
                logger.error(f"Attempt {i+1} ES connect fail (Other) to {url}: {e}")
            if i < 2:
                await asyncio.sleep(2 * (i + 1))

        # Close the failed client before trying next URL
        await es_client.close()
        es_client = None

    logger.error("Failed ES connect after multiple attempts to all URLs.")
    es_client = None


@app.on_event("shutdown")
async def shutdown_event():
    # ... (This is your existing, working code) ...
    if es_client:
        await es_client.close()
        logger.info("ES connection closed.")


@app.middleware("http")
async def verify_firebase_token_middleware(request: Request, call_next):
    # --- NEW ---
    public_paths = [
        "/",
        "/docs",
        "/openapi.json",
        "/api/issues",
        "/issues/",
        "/issues/latest",
        "/favicon.ico",  # Keep if you added it
        "/api/leaderboard/citizens",  # <-- ADD THIS
        "/api/leaderboard/ngos",  # <-- ADD THIS
    ]
    if request.url.path in public_paths or request.method == "OPTIONS":
        response = await call_next(request)
        return response
    if not default_app or not db:
        logger.error(f"Firebase not initialized. Path: {request.url.path}, default_app: {default_app is not None}, db: {db is not None}")
        raise HTTPException(503, "Auth service unavailable - Firebase not initialized")
    auth_header = request.headers.get("Authorization")
    logger.debug(f"Authorization header received: {auth_header}")
    logger.debug(f"All headers: {dict(request.headers)}")
    if not auth_header or not auth_header.startswith("Bearer "):
        logger.warning(f"Missing/invalid Auth header for: {request.url.path}")
        raise HTTPException(401, "Missing/invalid auth token")
    id_token = auth_header.split("Bearer ")[1]
    decoded_token = None
    try:
        decoded_token = auth.verify_id_token(id_token, check_revoked=True)
        request.state.user = decoded_token
        logger.info(f"Token OK for UID: {decoded_token.get('uid')}")
    except firebase_auth_errors.RevokedIdTokenError:
        logger.warning(f"Token revoked")
        raise HTTPException(401, "Token revoked")
    except firebase_auth_errors.UserDisabledError:
        logger.warning(f"User disabled")
        raise HTTPException(403, "User account disabled")
    except (ValueError, firebase_auth_errors.InvalidIdTokenError) as e:
        logger.error(f"Invalid token: {e}")
        raise HTTPException(401, "Invalid auth token")
    except Exception as e:
        logger.exception(f"Token verify error: {e}")
        raise HTTPException(500, "Could not verify auth token")
    response = await call_next(request)
    return response


# --- NEW: Dependency Functions (Copied from our previous discussion) ---
async def get_current_user(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if user is None:
        logger.error("get_current_user: No user in state")
        raise HTTPException(401, "Not authenticated")
    return user


async def get_optional_user(request: Request) -> Optional[dict]:
    return getattr(request.state, "user", None)


# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

try:
    # Initialize GCS client with GCS service account credentials (different from Firebase)
    storage_client = storage.Client.from_service_account_json(
        "../secrets/civicfix-474613-613212b7d832.json"
    )
    logger.info("GCS client initialized successfully.")
except Exception as gcs_err:
    logger.error(f"GCS client initialization failed: {gcs_err}")
    storage_client = None
geolocator = Nominatim(user_agent="civicfix_backend_app_v6")


def geocode_location(address: str, attempts=3) -> Optional[Dict[str, Any]]:
    # ... (This is your existing, working code) ...
    logger.info(f"Attempting to geocode address: '{address}'")
    if not address:
        return None
    for attempt in range(attempts):
        try:
            location = geolocator.geocode(address, timeout=10)
            if location:
                logger.info(f"Geocode OK: ({location.latitude}, {location.longitude})")
                return {
                    "latitude": location.latitude,
                    "longitude": location.longitude,
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
    # ... (This is your existing, working code) ...
    if not es_client:
        raise HTTPException(503, "DB unavailable")
    try:
        if not await es_client.ping():
            raise HTTPException(503, "DB no response")
    except Exception as e:
        logger.error(f"ES ping fail: {e}")
        raise HTTPException(503, "DB conn err")
    
    # Check Firebase status
    firebase_status = "connected" if (default_app and db) else "disconnected"
    
    return {
        "message": "CivicFix API Gateway - Running",
        "db_status": "connected",
        "firebase_status": firebase_status,
        "firebase_app": default_app is not None,
        "firestore_client": db is not None
    }


@app.get("/api/issues")
async def get_all_issues(
    user: Optional[dict] = Depends(get_optional_user),
):  # Auth optional
    # ... (This is your existing, working code) ...
    if user:
        logger.info(f"User {user.get('uid')} fetching issues.")
    else:
        logger.info("Anon user fetching issues.")
    if not es_client:
        raise HTTPException(503, "DB unavailable")
    logger.info("Fetching issues...")
    issues_with_address = []
    try:
        response = await es_client.search(
            index="issues",
            body={
                "query": {"match_all": {}},
                "sort": [
                    {"upvotes.open": {"order": "desc", "missing": "_last"}},
                    {"severity_score": {"order": "desc", "missing": "_last"}},
                ],
            },
            size=100,
            request_timeout=45,  # allow up to 45 seconds for this query
        )
        logger.info(f"ES returned {len(response['hits']['hits'])} issues.")
        issues_source = [doc["_source"] for doc in response["hits"]["hits"]]
        logger.info("Starting reverse geocoding...")
        processed_count = 0
        for issue in issues_source:
            issue_copy = issue.copy()
            display_address = "Address lookup failed"
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
                            logger.warning(f"RevGeocode ({lat},{lon}) no result.")
                    except (GeocoderTimedOut, GeocoderServiceError) as geo_e:
                        display_address = "Address lookup timeout/error"
                        logger.warning(f"RevGeocode failed for ({lat},{lon}): {geo_e}")
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
        logger.info(
            f"Finished processing {processed_count} issues with reverse geocoding."
        )
        return {"issues": issues_with_address}
    except NotFoundError:
        logger.warning("Issues index not found.")
        return {"issues": []}
    except Exception as e:
        logger.exception("Failed severely during fetch/process issues")
        raise HTTPException(500, f"Database query or processing failed: {e}")

@app.get("/issues/")
async def get_issues(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    limit: int = 10,
    skip: int = 0,
    days_back: int = 30,
    user: Optional[dict] = Depends(get_optional_user),
):
    """
    Get issues near a location, sorted by distance and recency.
    Includes user's upvote/report status if authenticated.
    
    Args:
        latitude: Location latitude
        longitude: Location longitude
        radius_km: Search radius in kilometers (default 5km)
        limit: Maximum number of results (default 10)
        skip: Number of results to skip for pagination (default 0)
        days_back: Only include issues from last N days (default 30)
    """
    if not es_client:
        raise HTTPException(503, "DB unavailable")
    
    try:
        date_threshold = (
            datetime.now(timezone.utc) - timedelta(days=days_back)
        ).isoformat()

        query = {
            "size": limit,
            "from": skip,  # Add pagination support
            "query": {
                "bool": {
                    "must": [{"range": {"created_at": {"gte": date_threshold}}}],
                    "filter": [
                        {
                            "geo_distance": {
                                "distance": f"{radius_km}km",
                                "location": {"lat": latitude, "lon": longitude},
                            }
                        }
                    ],
                }
            },
            "sort": [
                {
                    "_geo_distance": {
                        "location": {"lat": latitude, "lon": longitude},
                        "order": "asc",
                        "unit": "km",
                    }
                },
                {"created_at": {"order": "desc"}},
            ],
            "_source": [
                "issue_id",
                "location",
                "description",
                "issue_types",
                "severity_score",
                "status",
                "created_at",
                "photo_url",
                "upvotes",
                "impact_score",
                "detected_issues",
                "created_at",
            ],
        }

        response = await es_client.search(
            index="issues", body=query, request_timeout=45
        )
        issues = []

        for hit in response["hits"]["hits"]:
            issue_data = hit["_source"]
            if hit.get("sort"):
                issue_data["distance_km"] = hit["sort"][0]
            issues.append(issue_data)


        total_hits = response["hits"]["total"]["value"]
        
        logger.info(
            f"Found {len(issues)} issues near ({latitude}, {longitude}) within {radius_km}km (skip={skip}, total={total_hits})"
        )
        return {
            "location": {"latitude": latitude, "longitude": longitude},
            "radius_km": radius_km,
            "count": len(issues),
            "total": total_hits,  # Total available results
            "skip": skip,
            "issues": issues,
        }

    except Exception as e:
        logger.exception("Failed to retrieve nearby issues from Elasticsearch")
        raise HTTPException(500, "Internal server error")


@app.get("/issues/latest")
async def get_latest_issues(
    limit: int = 10,
    days_back: Optional[int] = None,
):
    """
    Get the latest issues sorted by reported time.
    """
    if not es_client:
        raise HTTPException(503, "DB unavailable")
    
    try:
        query = {
            "size": limit,
            "query": {"match_all": {}},
            "sort": [{"created_at": {"order": "desc"}}],
            "_source": [
                "issue_id",
                "location",
                "description",
                "issue_types",
                "severity_score",
                "status",
                "created_at",
                "photo_url",
                "upvotes",
                "impact_score",
                "detected_issues",
                "created_at",
            ],
        }

        # Add date filter if days_back is specified
        if days_back:
            date_threshold = (
                datetime.now(timezone.utc) - timedelta(days=days_back)
            ).isoformat()
            query["query"] = {"range": {"created_at": {"gte": date_threshold}}}

        response = await es_client.search(
            index="issues", body=query, request_timeout=45
        )

        issues = []
        for hit in response["hits"]["hits"]:
            issue_data = hit["_source"]
            issues.append(issue_data)

        logger.info(f"Retrieved {len(issues)} latest issues")
        return {"count": len(issues), "issues": issues}

    except Exception as e:
        logger.exception("Failed to retrieve latest issues from Elasticsearch")
        raise HTTPException(500, "Internal server error")


@app.post("/submit-issue")
async def submit_issue(
    user: dict = Depends(get_current_user),  # Requires auth
    file: UploadFile = File(...),
    locationstr: str = Form(...),
    description: str = Form(...),
    is_anonymous: bool = Form(False),  # Get anonymous flag
):
    # ... (This is your existing, working code) ...
    if not storage_client:
        raise HTTPException(503, "GCS unavailable")
    if not file:
        raise HTTPException(400, "No file")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Image only")
    geocoded = geocode_location(locationstr)
    if not geocoded:
        raise HTTPException(400, f"Cannot find coords for: '{locationstr}'.")
    file_uuid = uuid.uuid4()
    file.filename = f"issues/{file_uuid}"
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if not BUCKET_NAME:
        raise HTTPException(500, "GCS bucket not config")
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(file.filename)
    try:
        blob.upload_from_string(data, content_type=file.content_type)
        public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{file.filename}"
        logger.info(f"GCS OK: {public_url}")
    except Exception as gcs_err:
        logger.exception("GCS upload fail")
        raise HTTPException(500, f"GCS fail: {gcs_err}")
    try:
        logger.info(f"Calling analyzer: {CLOUD_ANALYZER_URL}/analyze/")
        reporter_id = (
            "anonymous" if is_anonymous else user.get("uid", "anonymous_fallback")
        )
        source_type = "anonymous" if is_anonymous else "citizen"
        analyzer_payload = {
            "image_url": public_url,
            "description": description,
            "location": {
                "latitude": geocoded["latitude"],
                "longitude": geocoded["longitude"],
            },
            "timestamp": geocoded["timestamp"],
            "user_selected_labels": [],
            "reported_by": reporter_id,
            "source": source_type,
        }
        logger.debug(f"Analyzer payload: {analyzer_payload}")
        analyzer_response = requests.post(
            f"{CLOUD_ANALYZER_URL}/analyze/", json=analyzer_payload, timeout=60
        )
        logger.debug(f"Analyzer response: {analyzer_response.text}")
        analyzer_response.raise_for_status()
        analysis_result = analyzer_response.json()
        logger.info(f"Analyzer OK for {reporter_id}. Response: {analysis_result}")

        db.collection("users").document(reporter_id).set({
            "stats": {
                "issues_reported": firestore.Increment(1),
            },
            "karma": firestore.Increment(10),  
            "issues_reported": firestore.ArrayUnion([analysis_result.get("issue_id")]),
        }, merge=True)

        return {
            "image_url": public_url,
            "analysis": analysis_result,
            "location_text": locationstr,
            "location_coords": {
                "latitude": geocoded["latitude"],
                "longitude": geocoded["longitude"],
            },
        }
    except requests.exceptions.HTTPError as http_err:
        error_detail = (
            f"Analysis error: {http_err.response.status_code}. {http_err.response.text}"
        )
        logger.error(error_detail)
        raise HTTPException(502, "Error from analysis service.")
    except requests.exceptions.RequestException as e:
        logger.exception("Analyzer conn fail")
        raise HTTPException(502, f"Analysis conn err: {e}")
    except Exception as e:
        logger.exception("Unexpected err in /submit-issue")
        raise HTTPException(500, f"Internal server err: {e}")


@app.post("/submit-issue-multi")
async def submit_issue_multi(
    user: dict = Depends(get_current_user),  # Requires auth
    files: List[UploadFile] = File(...),  # Accepts multiple files
    location_text: str = Form(...),
    description: str = Form(""),  # Optional description
    is_anonymous: bool = Form(False),  # Get anonymous flag
):
    if not storage_client:
        raise HTTPException(503, "GCS unavailable")
    if not files or len(files) == 0:
        raise HTTPException(400, "No files provided")

    # --- 1. Geocode Location ---
    geocoded = geocode_location(location_text)
    if not geocoded:
        raise HTTPException(400, f"Could not find coordinates for: '{location_text}'.")

    # --- 2. Upload all files to GCS ---
    public_urls = []
    issue_folder = f"issues/{uuid.uuid4()}"  # Create one folder for all issue images

    for file in files:
        if not (file.content_type or "").startswith("image/"):
            logger.warning(f"Skipping non-image file: {file.filename}")
            continue

        file.filename = f"{issue_folder}/{uuid.uuid4()}_{file.filename}"
        data = await file.read()
        if not data:
            logger.warning(f"Skipping empty file: {file.filename}")
            continue

        if not BUCKET_NAME:
            raise HTTPException(500, "GCS bucket not configured")

        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(file.filename)

        try:
            blob.upload_from_string(data, content_type=file.content_type)
            public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{file.filename}"
            public_urls.append(public_url)
        except Exception as gcs_err:
            logger.exception(f"GCS upload failed for {file.filename}")
            # Continue trying to upload other files

    if not public_urls:
        raise HTTPException(400, "No valid image files were uploaded.")

    logger.info(f"GCS Upload OK: {len(public_urls)} images uploaded to {issue_folder}")

    # --- 3. Call Analyzer (using only the *first* image) ---
    try:
        first_image_url = public_urls[0]
        logger.info(f"Calling analyzer: {CLOUD_ANALYZER_URL}/analyze/")

        reporter_id = (
            "anonymous" if is_anonymous else user.get("uid", "anonymous_fallback")
        )
        source_type = "anonymous" if is_anonymous else "citizen"

        analyzer_payload = {
            "image_url": first_image_url,  # Analyzer takes one image
            # "all_image_urls": public_urls, # We can send all if analyzer supports it
            "description": description,
            "location": {
                "latitude": geocoded["latitude"],
                "longitude": geocoded["longitude"],
            },
            "timestamp": geocoded["timestamp"],
            "user_selected_labels": [],
            "reported_by": reporter_id,
            "source": source_type,
        }

        # This part is complex: The analyzer will create the ES doc.
        # We need to make sure it adds *all* public_urls to it.
        # For now, we assume the analyzer just uses the first URL.
        # **A better design**: The analyzer should accept `image_urls: List[str]`
        # and store `photo_url: public_urls[0]` and `all_photo_urls: public_urls`

        analyzer_response = requests.post(
            f"{CLOUD_ANALYZER_URL}/analyze/", json=analyzer_payload, timeout=60
        )
        analyzer_response.raise_for_status()
        analysis_result = analyzer_response.json()

        logger.info(f"Analyzer OK for {reporter_id}. Response: {analysis_result}")

        # --- 4. (Optional) Update ES doc with all image URLs if analyzer didn't ---
        # This is a safety check. If the analyzer's response doesn't
        # include all our URLs, we should add them.
        # For now, we'll assume the analyzer handles it.

        return {
            "message": f"{len(public_urls)} images uploaded.",
            "image_urls": public_urls,
            "analysis": analysis_result,
            "location_text": location_text,
            "location_coords": {
                "latitude": geocoded["latitude"],
                "longitude": geocoded["longitude"],
            },
        }
    except requests.exceptions.HTTPError as http_err:
        error_detail = (
            f"Analysis error: {http_err.response.status_code}. {http_err.response.text}"
        )
        logger.error(error_detail)
        raise HTTPException(502, "Error from analysis service.")
    except requests.exceptions.RequestException as e:
        logger.exception("Analyzer conn fail")
        raise HTTPException(502, f"Analysis conn err: {e}")
    except Exception as e:
        logger.exception("Unexpected err in /submit-issue-multi")
        raise HTTPException(500, f"Internal server err: {e}")


@app.post("/api/issues/{issue_id}/upvote")
async def upvote_issue(issue_id: str, user: dict = Depends(get_current_user)):
    """
    Toggle upvote for an issue. 
    - Creates upvote with isActive=True if it doesn't exist
    - Toggles isActive between True/False if it exists
    - Updates Elasticsearch upvote count accordingly
    - Returns current toggle state
    """
    logger.info(f"User {user.get('uid')} toggling upvote for {issue_id}")
    if not es_client or not db:
        raise HTTPException(503, "DB unavailable")
    
    user_uid = user.get("uid")
    upvote_doc_id = f"{issue_id}__{user_uid}"

    try:
        # Check if upvote document exists in Firestore
        upvote_ref = db.collection("upvotes").document(upvote_doc_id)
        upvote_doc = upvote_ref.get()
        
        now = datetime.utcnow().isoformat() + "Z"
        new_active_state = True  # Default for new upvotes
        
        if upvote_doc.exists:
            # Toggle existing upvote
            upvote_data = upvote_doc.to_dict()
            is_active = upvote_data.get("isActive", False)
            new_active_state = not is_active
            
            # Update Firestore with new state
            upvote_ref.update({
                "isActive": new_active_state,
                "lastUpdated": now
            })
            
            logger.info(f"Toggling upvote from {is_active} to {new_active_state}")
        else:
            # Create new upvote document with isActive=True
            upvote_ref.set({
                "issueId": issue_id,
                "userId": user_uid,
                "isActive": True,
                "upvotedAt": now,
                "lastUpdated": now
            })
            new_active_state = True
            logger.info(f"Creating new upvote for user {user_uid}")
        
        # Update Elasticsearch count based on new state
        if new_active_state:
            # Activating upvote - increment count
            script = {
                "source": """
                    if (!ctx._source.containsKey('upvotes')) {
                        ctx._source.upvotes = ['open': 0, 'closed': 0];
                    }
                    if (ctx._source.status == 'closed') {
                        ctx._source.upvotes.closed += 1;
                    } else {
                        ctx._source.upvotes.open += 1;
                    }
                """,
                "lang": "painless"
            }
        else:
            # Deactivating upvote - decrement count (but not below 0)
            script = {
                "source": """
                    if (!ctx._source.containsKey('upvotes')) {
                        ctx._source.upvotes = ['open': 0, 'closed': 0];
                    }
                    if (ctx._source.status == 'closed') {
                        if (ctx._source.upvotes.closed > 0) {
                            ctx._source.upvotes.closed -= 1;
                        }
                    } else {
                        if (ctx._source.upvotes.open > 0) {
                            ctx._source.upvotes.open -= 1;
                        }
                    }
                """,
                "lang": "painless"
            }

        # Perform update operation in Elasticsearch
        await es_client.update(
            index="issues",
            id=issue_id,
            script=script,
            refresh=True,
            retry_on_conflict=3,
        )

        # Retrieve updated document from Elasticsearch
        get_response = await es_client.get(index="issues", id=issue_id)
        updated_source = get_response['_source']
        
        logger.info(
            f"Upvote toggled for {issue_id}. isActive: {new_active_state}, New counts: {updated_source.get('upvotes')}"
        )
        
        return {
            "success": True,
            "message": "Upvoted" if new_active_state else "Upvote removed",
            "isActive": new_active_state,
            "hasUpvoted": new_active_state,  # For frontend compatibility
            "updated_issue": updated_source,
            "upvotes": updated_source.get('upvotes', {})
        }
        
    except NotFoundError:
        logger.warning(f"Upvote fail: Issue {issue_id} not found in Elasticsearch.")
        raise HTTPException(404, f"Issue {issue_id} not found")
    except Exception as e:
        logger.exception(f"Unexpected error while toggling upvote for {issue_id}")
        raise HTTPException(500, f"Server error: {e}")


# --- Unlike Endpoint (Deprecated - use /upvote to toggle) ---
# Kept for backward compatibility
@app.post("/api/issues/{issue_id}/unlike")
async def unlike_issue(
    issue_id: str, user: dict = Depends(get_current_user)
):
    """Deprecated: Use POST /api/issues/{issue_id}/upvote to toggle upvote state"""
    # Redirect to upvote endpoint which now handles toggling
    return await upvote_issue(issue_id, user)


# --- Report Endpoint (Requires Auth, uses Firestore tracking) ---
@app.post("/api/issues/{issue_id}/report")
async def report_issue(issue_id: str, user: dict = Depends(get_current_user)):
    """
    Report an issue as spam/not fixed.
    - Reports are NOT toggleable (once reported, stays reported)
    - Creates permanent record in Firestore with isActive=True
    - Increments report count in Elasticsearch
    - May close/reopen issue if threshold reached
    """
    logger.info(f"User {user.get('uid')} reporting {issue_id}")
    if not es_client or not db:
        raise HTTPException(503, "DB unavailable")
    
    user_uid = user.get("uid")
    report_doc_id = f"{issue_id}__{user_uid}"
    
    try:
        # Check if user already reported this issue
        report_ref = db.collection("reports").document(report_doc_id)
        report_doc = report_ref.get()
        
        if report_doc.exists:
            report_data = report_doc.to_dict()
            if report_data.get("isActive", False):
                logger.warning(f"User {user_uid} already reported {issue_id}")
                return {
                    "success": True,
                    "message": "Already reported",
                    "hasReported": True,
                    "isActive": True
                }
        
        now = datetime.utcnow().isoformat() + "Z"
        
        # Create permanent report document in Firestore (NOT toggleable)
        report_ref.set({
            "issueId": issue_id,
            "userId": user_uid,
            "isActive": True,  # Always true, reports are permanent
            "reportedAt": now,
            "lastUpdated": now
        })
        
        logger.info(f"Created permanent report for user {user_uid}")
        
        # Get current issue status and reports from Elasticsearch
        get_resp = await es_client.get(index="issues", id=issue_id)
        source = get_resp["_source"]
        status = source.get("status", "open")
        reports = source.get("reports", {})
        params = {"now": now}
        script = None
        script_defined = False
        
        # Update Elasticsearch based on current status
        if status == "open":
            count = reports.get("open", 0)
            if count + 1 >= SPAM_REPORT_THRESHOLD:
                # Threshold reached - mark as spam/closed
                script = "ctx._source.reports.open = 0; ctx._source.upvotes.open = 0; ctx._source.status = 'closed'; ctx._source.updated_at = params.now; ctx._source.closed_at = params.now; ctx._source.closed_by = 'community_report';"
                script_defined = True
                logger.info(f"Issue {issue_id} closed due to {count + 1} reports (threshold: {SPAM_REPORT_THRESHOLD})")
            else:
                # Increment report count
                script = "ctx._source.reports.open += 1"
                script_defined = True
        elif status == "closed":
            count = reports.get("closed", 0)
            if count + 1 >= REOPEN_REPORT_THRESHOLD:
                # Threshold reached - reopen issue
                script = "ctx._source.reports.closed = 0; ctx._source.upvotes.closed = 0; ctx._source.status = 'open'; ctx._source.updated_at = params.now; ctx._source.closed_at = null; ctx._source.closed_by = null;"
                script_defined = True
                logger.info(f"Issue {issue_id} reopened due to {count + 1} reports (threshold: {REOPEN_REPORT_THRESHOLD})")
            else:
                # Increment report count
                script = "ctx._source.reports.closed += 1"
                script_defined = True
        elif status == "verified":
            script = "ctx._source.reports.verified += 1"
            script_defined = True
        elif status == "spam":
            logger.warning(f"Report ignored for spam issue {issue_id}.")
            return {
                "success": True,
                "message": "Issue already marked as spam",
                "updated_issue": source,
                "hasReported": True,
                "isActive": True
            }
        else:
            logger.error(f"Cannot report {issue_id}, unknown status: {status}.")
            return {
                "success": False,
                "message": f"Unknown status {status}",
                "updated_issue": source,
                "hasReported": True,
                "isActive": True
            }
        
        # Execute update script in Elasticsearch
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
        
        # Get updated document
        updated = await es_client.get(index="issues", id=issue_id)
        new_status = updated["_source"].get("status")
        new_reports = updated["_source"].get("reports")
        
        logger.info(
            f"Report OK for {issue_id}. New counts: {new_reports}, New Status: {new_status}"
        )
        
        return {
            "success": True,
            "message": "Reported successfully",
            "hasReported": True,
            "isActive": True,  # Reports are always active (not toggleable)
            "updated_issue": updated["_source"],
            "reports": new_reports
        }
        
    except NotFoundError:
        logger.warning(f"Report fail: Issue {issue_id} not found in Elasticsearch.")
        raise HTTPException(404, f"Issue {issue_id} not found")
    except Exception as e:
        logger.exception(f"Unexpected error while reporting {issue_id}")
        raise HTTPException(500, f"Server error: {e}")


# ---
# --- NEW NGO ENDPOINT ---
# ---
@app.post("/api/issues/{issue_id}/submit-fix")
async def submit_fix(
    issue_id: str,
    user: dict = Depends(get_current_user),  # Requires auth
    file: UploadFile = File(...),
    description: str = Form(""),  # Optional description from NGO
):
    """
    Endpoint for NGOs to submit proof of a fix (photo/video).
    This claims the issue, uploads proof, and calls the verifier.
    """
    if not es_client:
        raise HTTPException(503, "DB unavailable")
    if not storage_client:
        raise HTTPException(503, "GCS unavailable")
    if not db:
        raise HTTPException(503, "Firestore client not available")

    user_uid = user.get("uid")
    logger.info(f"User {user_uid} attempting to submit fix for issue {issue_id}")

    # --- 1. Verify user is an NGO ---
    try:
        user_doc_ref = db.collection("users").document(user_uid)
        # NOTE: firebase_admin.firestore.get() is SYNCHRONOUS
        # This will block the server. For production, use google-cloud-firestore async client.
        # For this hackathon, we'll accept the blocking call.
        user_doc = user_doc_ref.get()

        if not user_doc.exists:
            logger.warning(f"User {user_uid} not found in Firestore.")
            raise HTTPException(status_code=403, detail="User profile not found.")

        user_type = user_doc.to_dict().get("userType")
        if user_type not in ["ngo", "volunteer"]:
            logger.warning(
                f"User {user_uid} is not an NGO/Volunteer (userType: {user_type}). Cannot submit fix."
            )
            raise HTTPException(status_code=403, detail="Only NGOs and Volunteers can submit fixes.")

        logger.info(f"User {user_uid} verified as {user_type}.")
    except Exception as e:
        logger.exception(f"Error verifying NGO status for {user_uid}: {e}")
        raise HTTPException(status_code=500, detail="Error verifying user permissions.")

    # --- 2. Check if issue is 'open' ---
    original_issue_doc = None
    try:
        get_resp = await es_client.get(index="issues", id=issue_id)
        original_issue_doc = get_resp["_source"]
        current_status = original_issue_doc.get("status", "open")
        if current_status != "open":
            logger.warning(
                f"NGO {user_uid} tried to fix issue {issue_id} but status is {current_status}."
            )
            raise HTTPException(
                status_code=400,
                detail=f"Issue is not currently open. Status: {current_status}",
            )
    except NotFoundError:
        raise HTTPException(status_code=404, detail=f"Issue {issue_id} not found.")
    except Exception as e:
        logger.exception(f"Error checking issue status: {e}")
        raise HTTPException(status_code=500, detail="Error fetching issue details.")

    # --- 3. Upload fix file to GCS ---
    file_uuid = uuid.uuid4()
    # Save to a different folder
    blob_name = f"fix-proof/{issue_id}/{file_uuid}_{file.filename or 'fix'}"
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty proof file")

    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(blob_name)
    try:
        blob.upload_from_string(data, content_type=file.content_type)
        fix_public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_name}"
        logger.info(f"Fix proof uploaded to GCS: {fix_public_url}")
    except Exception as gcs_error:
        logger.exception("GCS upload fail for fix proof")
        raise HTTPException(500, f"GCS fail: {gcs_error}")

    # --- 4. Call Issue_Verifier Service ---
    try:
        logger.info(f"Calling verifier service: {VERIFIER_URL}")
        # Build the payload EXACTLY as the verifier README specifies
        verifier_payload = {
            "issue_id": issue_id,
            "ngo_id": user_uid,
            "image_urls": [fix_public_url],  # Send as a list
            "fix_description": description,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

        # --- Make the call to the Verifier (Port 8002) ---
        verifier_response = requests.post(
            VERIFIER_URL, json=verifier_payload, timeout=60
        )
        verifier_response.raise_for_status()
        verification_result = verifier_response.json()

        # The Verifier README says it updates ES, so we don't need to mock.
        logger.info(
            f"Fix submission processed by Verifier for issue {issue_id}. Result: {verification_result}"
        )

        return {
            "message": "Fix submitted successfully!",
            "issue_id": issue_id,
            "verification_result": verification_result,
        }

    except requests.exceptions.HTTPError as http_err:
        error_detail = f"Verifier service error: {http_err.response.status_code}. {http_err.response.text}"
        logger.error(error_detail)
        raise HTTPException(502, "Error from verifier service.")
    except requests.exceptions.RequestException as e:
        logger.exception(
            f"Failed to connect to Issue Verifier service at {VERIFIER_URL}"
        )
        raise HTTPException(
            status_code=502, detail=f"Issue Verifier service connection error: {e}"
        )
    except Exception as e:
        logger.exception(f"Unexpected error during fix submission for {issue_id}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


# --- ADD THESE 2 NEW ENDPOINTS to main.py ---
# Make sure 'db' (Firestore client) is initialized near the top
# and 'Query' is imported from 'google.cloud.firestore_v1.client'
# OR just use the string "DESCENDING"


@app.get("/api/leaderboard/citizens")
async def get_citizen_leaderboard():
    """Fetches top 10 citizens by karma from Firestore."""
    if not db:
        raise HTTPException(503, "Firestore client not available")
    try:
        logger.info("Fetching citizen leaderboard...")
        users_ref = db.collection("users")
        # Query for userType == "citizen", order by karma descending, limit to 10
        query = (
            users_ref.where(field_path="userType", op_string="==", value="citizen")
            .order_by("karma", direction="DESCENDING")
            .limit(10)
        )
        docs = query.stream()  # This is a synchronous call

        leaderboard = []
        rank = 1
        for doc in docs:
            user_data = doc.to_dict()
            leaderboard.append(
                {
                    "rank": rank,
                    "name": user_data.get("name", "Anonymous Citizen"),
                    "co2": user_data.get("karma", 0),  # Using karma field as the score
                    "badges": [],  # Badges not implemented yet
                }
            )
            rank += 1

        logger.info(f"Returning {len(leaderboard)} citizen leaders.")
        return {"leaderboard": leaderboard}
    except Exception as e:
        logger.exception(f"Error fetching citizen leaderboard: {e}")
        raise HTTPException(500, "Failed to fetch citizen leaderboard")


@app.get("/api/leaderboard/ngos")
async def get_ngo_leaderboard():
    """Fetches top 10 NGOs by karma from Firestore."""
    if not db:
        raise HTTPException(503, "Firestore client not available")
    try:
        logger.info("Fetching NGO leaderboard...")
        users_ref = db.collection("users")
        # Query for userType == "ngo", order by karma descending, limit to 10
        query = (
            users_ref.where(field_path="userType", op_string="in", value=["ngo", "volunteer"])
            .order_by("karma", direction="DESCENDING")
            .limit(10)
        )
        docs = query.stream()  # Synchronous call

        leaderboard = []
        rank = 1
        for doc in docs:
            user_data = doc.to_dict()
            leaderboard.append(
                {
                    "rank": rank,
                    "name": user_data.get("name", "Anonymous NGO"),
                    "co2": user_data.get("karma", 0),  # Using karma field as the score
                    "badges": [],  # Badges not implemented yet
                }
            )
            rank += 1

        logger.info(f"Returning {len(leaderboard)} NGO leaders.")
        return {"leaderboard": leaderboard}
    except Exception as e:
        logger.exception(f"Error fetching NGO leaderboard: {e}")
        raise HTTPException(500, "Failed to fetch NGO leaderboard")


@app.get("/api/users/{user_id}/stats")
async def get_user_stats(user_id: str):
    """Fetches user statistics from Firestore."""
    if not db:
        raise HTTPException(503, "Firestore client not available")
    try:
        logger.info(f"Fetching stats for user: {user_id}")
        
        # Get user document from Firestore
        user_ref = db.collection("users").document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(404, f"User {user_id} not found")
        
        user_data = user_doc.to_dict()
        
        # Get stats from the user document
        stats = user_data.get("stats", {})
        karma = user_data.get("karma", 0)
        user_type = user_data.get("userType", "citizen")
        
        # Calculate rank by counting users with higher karma
        users_ref = db.collection("users")
        higher_karma_query = users_ref.where(field_path="karma", op_string=">", value=karma)
        higher_karma_docs = list(higher_karma_query.stream())
        current_rank = len(higher_karma_docs) + 1
        
        # Build response based on user type
        response_stats = {
            "karma": karma,
            "currentRank": current_rank,
            "issuesReported": stats.get("issues_reported", 0),
            "issuesResolved": stats.get("issues_resolved", 0),
            "co2Saved": 0,  # Placeholder for future implementation
            "badges": []  # Placeholder for future implementation
        }
        
        # Add volunteer-specific stats
        if user_type == "volunteer":
            response_stats["issuesFixed"] = stats.get("issues_fixed", 0)
        
        logger.info(f"Returning stats for user {user_id}: {response_stats}")
        return {"stats": response_stats}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error fetching user stats for {user_id}: {e}")
        raise HTTPException(500, f"Failed to fetch user stats: {str(e)}")


# TEMPORARILY DISABLED - These endpoints are inefficient (N+1 queries)
# TODO: Implement batch status checking or include status in main issue query
# @app.get("/api/issues/{issue_id}/upvote-status")
# async def get_upvote_status(issue_id: str, user: dict = Depends(get_current_user)):
#     """Check if current user has upvoted this issue"""
#     if not db:
#         raise HTTPException(503, "Firestore unavailable")
#     
#     user_uid = user.get("uid")
#     upvote_doc_id = f"{issue_id}__{user_uid}"
#     
#     try:
#         upvote_doc = db.collection("upvotes").document(upvote_doc_id).get()
#         
#         if upvote_doc.exists:
#             upvote_data = upvote_doc.to_dict()
#             return {
#                 "hasUpvoted": upvote_data.get("isActive", False),
#                 "upvotedAt": upvote_data.get("upvotedAt"),
#                 "lastUpdated": upvote_data.get("lastUpdated")
#             }
#         else:
#             return {"hasUpvoted": False}
#             
#     except Exception as e:
#         logger.exception(f"Error checking upvote status for {issue_id}")
#         raise HTTPException(500, f"Server error: {e}")


# @app.get("/api/issues/{issue_id}/report-status")
# async def get_report_status(issue_id: str, user: dict = Depends(get_current_user)):
#     """Check if current user has reported this issue"""
#     if not db:
#         raise HTTPException(503, "Firestore unavailable")
#     
#     user_uid = user.get("uid")
#     report_doc_id = f"{issue_id}__{user_uid}"
#     
#     try:
#         report_doc = db.collection("reports").document(report_doc_id).get()
#         
#         if report_doc.exists:
#             report_data = report_doc.to_dict()
#             return {
#                 "hasReported": report_data.get("isActive", False),
#                 "reportedAt": report_data.get("reportedAt"),
#                 "lastUpdated": report_data.get("lastUpdated")
#             }
#         else:
#             return {"hasReported": False}
#             
#     except Exception as e:
#         logger.exception(f"Error checking report status for {issue_id}")
#         raise HTTPException(500, f"Server error: {e}")