from datetime import datetime, timedelta, timezone
import asyncio
import json
import uuid
import logging
import requests
import os
from datetime import datetime
from fastapi import Query  # Add Query import
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

from google.cloud.firestore_v1.transforms import Increment
from elasticsearch import AsyncElasticsearch, NotFoundError, RequestError
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
import asyncio

# --- ADD Global Cache ---
geocode_cache: Dict[str, str] = {}
# --- END ADD ---

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
VERIFIER_URL = os.getenv("VERIFIER_URL", "http://localhost:8002")
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
        # --- The verify_id_token call is likely correct ---
        decoded_token = auth.verify_id_token(id_token, check_revoked=True)
        request.state.user = decoded_token
        logger.info(f"Token OK for UID: {decoded_token.get('uid')}")

    # --- CORRECTED Exception Handling ---
    except auth.RevokedIdTokenError:  # Catch directly from auth
        logger.warning(
            f"Token revoked for UID: {decoded_token.get('uid') if decoded_token else 'unknown'}"
        )
        raise HTTPException(status_code=401, detail="Token has been revoked.")
    except auth.UserDisabledError:  # Catch directly from auth
        logger.warning(
            f"User disabled for UID: {decoded_token.get('uid') if decoded_token else 'unknown'}"
        )
        raise HTTPException(status_code=403, detail="User account disabled.")
    except (ValueError, auth.InvalidIdTokenError) as e:  # Catch directly from auth
        logger.error(f"Invalid token: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token.")
    except Exception as e:  # General catch-all
        logger.exception(f"An unexpected error occurred during token verification: {e}")
        raise HTTPException(
            status_code=500, detail="Could not verify authentication token."
        )
    # --- END CORRECTION ---

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
    # --- ADD Query Parameters ---
    latitude: Optional[float] = Query(
        None, description="User's latitude for nearby filtering"
    ),
    longitude: Optional[float] = Query(
        None, description="User's longitude for nearby filtering"
    ),
    radius_km: float = Query(
        5.0, description="Search radius in kilometers for nearby filtering", gt=0
    ),  # Default 5km, must be > 0
    # --- END ADD ---
):
    if user:
        logger.info(f"User {user.get('uid')} fetching issues.")
    else:
        logger.info("Anon user fetching issues.")
    if not es_client:
        raise HTTPException(503, "DB unavailable")

    logger.info("Fetching issues...")
    issues_with_address = []
    try:
        # --- DYNAMICALLY BUILD QUERY ---
        es_query_body: Dict[str, Any] = {
            # Base sort (will be prepended if geo-sorting)
            "sort": [
                {"upvotes.open": {"order": "desc", "missing": "_last"}},
                {"severity_score": {"order": "desc", "missing": "_last"}},
            ],
            "size": 100,  # Keep size limit
            # "_source": [...] # Optionally define specific fields to return
        }

        if latitude is not None and longitude is not None:
            logger.info(
                f"Applying geo_distance filter: lat={latitude}, lon={longitude}, radius={radius_km}km"
            )
            es_query_body["query"] = {
                "bool": {
                    "must": {
                        "match_all": {}
                    },  # Keep match_all or add other 'must' clauses if needed later
                    "filter": [
                        {
                            "geo_distance": {
                                "distance": f"{radius_km}km",
                                "location": {  # Field name in your ES mapping
                                    "lat": latitude,
                                    "lon": longitude,
                                },
                            }
                        }
                    ],
                }
            }
            # Prepend distance sort to existing sort keys
            es_query_body["sort"].insert(
                0,
                {
                    "_geo_distance": {
                        "location": {"lat": latitude, "lon": longitude},
                        "order": "asc",
                        "unit": "km",
                    }
                },
            )

        else:
            logger.info("No location provided, fetching all issues.")
            es_query_body["query"] = {"match_all": {}}
        # --- END DYNAMIC QUERY BUILD ---

        response = await es_client.search(
            index="issues",
            body=es_query_body,  # Use the dynamically built body
            request_timeout=45,
        )

        logger.info(f"ES returned {len(response['hits']['hits'])} issues.")

        # --- Process hits, add distance, and perform reverse geocoding with cache ---
        processed_count = 0
        cache_hits = 0  # Track cache hits

        # Extract only the _source documents first
        issues_source = [hit["_source"] for hit in response["hits"]["hits"]]
        # Extract sort values (distances) if available
        sort_values = [hit.get("sort") for hit in response["hits"]["hits"]]

        for i, issue in enumerate(
            issues_source
        ):  # Iterate through the source documents
            issue_copy = issue.copy()

            # Add distance if sorting by distance was applied
            current_sort = sort_values[i]
            if current_sort and len(current_sort) > 0:
                # Check if the first sort key in the *query* was geo_distance
                if "_geo_distance" in es_query_body["sort"][0]:
                    # Check if the first sort value in the *response* is a number
                    if isinstance(current_sort[0], (float, int)):
                        issue_copy["distance_km"] = round(current_sort[0], 2)

            # --- Reverse Geocoding Logic with Cache ---
            display_address = "Address lookup failed"
            location = issue.get("location")

            if isinstance(location, dict) and "lat" in location and "lon" in location:
                lat, lon = location.get("lat"), location.get("lon")
                if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):

                    # --- CACHE LOGIC ---
                    cache_key = (
                        f"{lat:.6f},{lon:.6f}"  # Create a key with fixed precision
                    )

                    if cache_key in geocode_cache:
                        display_address = geocode_cache[cache_key]
                        cache_hits += 1
                    else:
                        # --- Original Geocoding Logic (if not in cache) ---
                        try:
                            # Assuming geolocator is initialized globally
                            geo_result = geolocator.reverse(
                                f"{lat}, {lon}",
                                exactly_one=True,
                                timeout=5,
                                language="en",
                            )
                            if geo_result and geo_result.address:
                                address_parts = geo_result.address.split(",")
                                if len(address_parts) >= 3:
                                    resolved_address = f"{address_parts[0].strip()}, {address_parts[1].strip()}, {address_parts[-2].strip()}"
                                else:
                                    resolved_address = geo_result.address
                                display_address = (
                                    resolved_address  # Assign resolved address
                                )
                            else:
                                display_address = (
                                    "Address not found"  # Specific failure message
                                )
                                logger.warning(f"RevGeocode ({lat},{lon}) no result.")

                        except (GeocoderTimedOut, GeocoderServiceError) as geo_e:
                            display_address = "Address lookup timeout/error"  # Specific failure message
                            logger.warning(
                                f"RevGeocode failed for ({lat},{lon}): {geo_e}"
                            )
                        except Exception as e:
                            display_address = (
                                "Address lookup error"  # Specific failure message
                            )
                            logger.exception(
                                f"Unexpected error during reverse geocoding for ({lat},{lon})"
                            )
                        # --- Store result (or failure message) in cache ---
                        geocode_cache[cache_key] = display_address
                    # --- END CACHE LOGIC ---

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
            # --- End Reverse Geocoding ---

            issue_copy["display_address"] = display_address
            issues_with_address.append(issue_copy)
            processed_count += 1
        # --- End processing loop ---

        logger.info(
            f"Finished processing {processed_count} issues. Cache hits: {cache_hits}/{processed_count}."
            + (
                f" Filtered near ({latitude}, {longitude})"
                if latitude is not None
                else ""
            )
        )
        return {"issues": issues_with_address}

    except NotFoundError:
        logger.warning("Issues index not found.")
        return {"issues": []}
    except Exception as e:
        logger.exception("Failed severely during fetch/process issues")
        raise HTTPException(500, f"Database query or processing failed: {e}")


# BETTER TO USE FOR HEATMAP---->>> IT HAS COORDINATES AND MORE FILTERS
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
                "uploader_display_name",
                "reported_by",
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


@app.get("/api/issues/with-user-status")
async def get_issues_with_user_status(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    limit: int = 10,
    skip: int = 0,
    days_back: int = 30,
    user: dict = Depends(get_current_user),  # Requires authentication
):
    """
    Get issues near a location with user's upvote and report status included.
    This combines the functionality of /issues/ and /batch-upvote-status endpoints.
    
    Args:
        latitude: Location latitude
        longitude: Location longitude
        radius_km: Search radius in kilometers (default 5km)
        limit: Maximum number of results (default 10)
        skip: Number of results to skip for pagination (default 0)
        days_back: Only include issues from last N days (default 30)
    
    Returns:
        Issues with embedded user status (hasUpvoted, hasReported) for each issue
    """
    if not es_client:
        raise HTTPException(503, "Elasticsearch unavailable")
    if not db:
        raise HTTPException(503, "Firestore unavailable")

    user_uid = user.get("uid")
    logger.info(f"User {user_uid} fetching issues with status near ({latitude}, {longitude})")

    try:
        # 1. Fetch issues from Elasticsearch (same as /issues/ endpoint)
        date_threshold = (
            datetime.now(timezone.utc) - timedelta(days=days_back)
        ).isoformat()

        query = {
            "size": limit,
            "from": skip,
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
                "uploader_display_name",
                "reported_by",
            ],
        }

        response = await es_client.search(
            index="issues", body=query, request_timeout=45
        )
        
        issues = []
        issue_ids = []

        for hit in response["hits"]["hits"]:
            issue_data = hit["_source"]
            if hit.get("sort"):
                issue_data["distance_km"] = hit["sort"][0]
            issues.append(issue_data)
            issue_ids.append(issue_data["issue_id"])

        total_hits = response["hits"]["total"]["value"]

        # 2. Batch fetch upvote and report status from Firestore
        upvote_status = {}
        report_status = {}
        
        if issue_ids:
            try:
                # Build document IDs for all issues
                upvote_doc_ids = [f"{issue_id}__{user_uid}" for issue_id in issue_ids]
                report_doc_ids = [f"{issue_id}__{user_uid}" for issue_id in issue_ids]
                
                # Batch fetch upvotes
                upvote_refs = [
                    db.collection("upvotes").document(doc_id) 
                    for doc_id in upvote_doc_ids
                ]
                
                # Batch fetch reports
                report_refs = [
                    db.collection("reports").document(doc_id) 
                    for doc_id in report_doc_ids
                ]
                
                # Get all documents in two batch operations
                upvote_docs = db.get_all(upvote_refs)
                report_docs = db.get_all(report_refs)
                
                # Build status maps
                for i, doc in enumerate(upvote_docs):
                    issue_id = issue_ids[i]
                    if doc.exists:
                        upvote_data = doc.to_dict()
                        upvote_status[issue_id] = upvote_data.get("isActive", False)
                    else:
                        upvote_status[issue_id] = False
                
                for i, doc in enumerate(report_docs):
                    issue_id = issue_ids[i]
                    if doc.exists:
                        report_data = doc.to_dict()
                        report_status[issue_id] = report_data.get("isActive", False)
                    else:
                        report_status[issue_id] = False
                
                logger.info(f"Batch fetched status for {len(issue_ids)} issues")
            except Exception as firestore_err:
                logger.error(f"Error fetching user status from Firestore: {firestore_err}")
                # Set all to False if there's an error
                upvote_status = {issue_id: False for issue_id in issue_ids}
                report_status = {issue_id: False for issue_id in issue_ids}

        # 3. Merge user status into each issue
        issues_with_status = []
        for issue in issues:
            issue_id = issue["issue_id"]
            issue_with_status = {
                **issue,
                "userStatus": {
                    "hasUpvoted": upvote_status.get(issue_id, False),
                    "hasReported": report_status.get(issue_id, False),
                }
            }
            issues_with_status.append(issue_with_status)

        logger.info(
            f"Returning {len(issues_with_status)} issues with user status for user {user_uid}"
        )
        
        return {
            "location": {"latitude": latitude, "longitude": longitude},
            "radius_km": radius_km,
            "count": len(issues_with_status),
            "total": total_hits,
            "skip": skip,
            "issues": issues_with_status,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to retrieve issues with user status")
        raise HTTPException(500, f"Internal server error: {str(e)}")


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
                "uploader_display_name",
                "reported_by",
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
    locationstr: str = Form(
        ...
    ),  # Renamed from location_text in original /submit-issue
    description: str = Form(...),
    is_anonymous: bool = Form(False),  # Get anonymous flag
):
    if not storage_client:
        raise HTTPException(503, "GCS unavailable")
    if not file:
        raise HTTPException(400, "No file")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(
            400, "Only image files are supported for single upload"
        )  # Adjusted error message

    # --- 1. Geocode Location ---
    geocoded = geocode_location(locationstr)
    if not geocoded:
        raise HTTPException(400, f"Cannot find coords for: '{locationstr}'.")

    # --- 2. Upload single file to GCS ---
    public_url = ""  # Initialize variable
    try:
        file_uuid = uuid.uuid4()
        # Create a unique path for the single file
        blob_name = f"issues/{uuid.uuid4()}_{file.filename or file_uuid}"
        file.filename = blob_name  # Use blob_name for consistency if needed later

        data = await file.read()
        if not data:
            raise HTTPException(400, "Empty file")

        if not BUCKET_NAME:
            raise HTTPException(500, "GCS bucket not config")

        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(blob_name)

        blob.upload_from_string(data, content_type=file.content_type)
        public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_name}"
        logger.info(f"GCS OK: {public_url}")
    except Exception as gcs_err:
        logger.exception("GCS upload fail")
        raise HTTPException(500, f"GCS fail: {gcs_err}")

    # --- 3. Call Analyzer ---
    try:
        logger.info(f"Calling analyzer: {CLOUD_ANALYZER_URL}/analyze/")

        reporter_id = (
            "anonymous" if is_anonymous else user.get("uid", "anonymous_fallback")
        )
        source_type = "anonymous" if is_anonymous else "citizen"

        # --- Fetch user display name for the analyzer ---
        user_display_name = "Anonymous"
        if not is_anonymous and reporter_id != "anonymous_fallback" and db:
            try:
                user_doc_ref = db.collection("users").document(reporter_id)
                user_doc = user_doc_ref.get()  # Synchronous call
                if user_doc.exists:
                    user_display_name = user_doc.to_dict().get("name", "Citizen")
                else:
                    logger.warning(
                        f"User document {reporter_id} not found, using default name."
                    )
                    user_display_name = "Citizen"  # Fallback
            except Exception as e:
                logger.warning(f"Could not fetch display name for {reporter_id}: {e}")
                user_display_name = "Citizen"  # Fallback
        # --- End display name fetch ---

        analyzer_payload = {
            "image_url": public_url,  # Single URL
            "description": description,
            "location": {
                "latitude": geocoded["latitude"],
                "longitude": geocoded["longitude"],
            },
            "timestamp": geocoded["timestamp"],
            "user_selected_labels": [],
            "reported_by": reporter_id,
            "source": source_type,
            "uploader_display_name": user_display_name,  # Pass display name
        }
        logger.debug(f"Analyzer payload: {analyzer_payload}")

        analyzer_response = requests.post(
            f"{CLOUD_ANALYZER_URL}/analyze/", json=analyzer_payload, timeout=60
        )
        logger.debug(
            f"Analyzer response: {analyzer_response.text}"
        )  # Log raw response for debugging
        analyzer_response.raise_for_status()  # Check for HTTP errors
        analysis_result = analyzer_response.json()  # Parse JSON

        logger.info(f"Analyzer OK for {reporter_id}. Response: {analysis_result}")

        # --- NEW: Award +10 Karma for First Post (Copied from multi-upload) ---
        if not is_anonymous and reporter_id != "anonymous_fallback" and db:
            try:
                user_doc_ref = db.collection("users").document(reporter_id)
                user_doc = user_doc_ref.get()  # Synchronous call

                if user_doc.exists:
                    user_data = user_doc.to_dict()  # Use .to_dict() here
                    has_posted = user_data.get("has_posted_before", False)

                    if not has_posted:
                        # Award +10 karma and set flag
                        user_doc_ref.update(
                            {"karma": Increment(10), "has_posted_before": True}
                        )
                        logger.info(
                            f"Awarded +10 first post karma to user {reporter_id}."
                        )
                    else:
                        logger.info(
                            f"User {reporter_id} has posted before. No first post karma awarded."
                        )
                else:
                    # Handle missing user doc (optional: create it)
                    logger.warning(
                        f"User document not found for {reporter_id} when checking first post karma. Creating doc and awarding karma."
                    )
                    user_doc_ref.set(
                        {
                            "name": user_display_name,
                            "email": user.get("email"),
                            "userType": "citizen",
                            "karma": 10,
                            "has_posted_before": True,
                            "createdAt": firestore.SERVER_TIMESTAMP,
                        },
                        merge=True,
                    )
                    logger.info(
                        f"Created user doc and awarded +10 first post karma to user {reporter_id}."
                    )

            except Exception as firestore_err:
                logger.error(
                    f"Failed to check/award first post karma for {reporter_id}: {firestore_err}"
                )
        # --- END NEW KARMA LOGIC ---

        # Return results
        return {
            "image_url": public_url,
            "analysis": analysis_result,
            "location_text": locationstr,  # Use the correct input variable name
            "location_coords": {
                "latitude": geocoded["latitude"],
                "longitude": geocoded["longitude"],
            },
        }

    # --- Keep existing error handling ---
    except requests.exceptions.HTTPError as http_err:
        error_detail = (
            f"Analysis error: {http_err.response.status_code}. {http_err.response.text}"
        )
        logger.error(error_detail)
        # Try to extract detail if JSON error response from analyzer
        try:
            err_json = http_err.response.json()
            error_detail = err_json.get("detail", error_detail)
        except json.JSONDecodeError:
            pass  # Keep original text
        raise HTTPException(502, f"Error from analysis service: {error_detail}")
    except requests.exceptions.RequestException as e:
        logger.exception("Analyzer conn fail")
        raise HTTPException(502, f"Analysis conn err: {e}")
    except Exception as e:
        logger.exception("Unexpected err in /submit-issue")
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
    # try:
    #     # Single update operation with script that handles different statuses
    #     script = {
    #         "source": """
    #             if (!ctx._source.containsKey('upvotes')) {
    #                 ctx._source.upvotes = ['open': 0, 'closed': 0];
    #             }
    #             if (ctx._source.status == 'closed') {
    #                 ctx._source.upvotes.closed += 1;
    #             } else {
    #                 ctx._source.upvotes.open += 1;
    #             }
    #         """,
    #         "lang": "painless",
    #     }
    # except NotFoundError:
    #     logger.warning(f"Upvote failed: Issue {issue_id} not found.")
    #     raise HTTPException(status_code=404, detail=f"Issue {issue_id} not found")

    try:
        # --- Get current issue details FIRST (for status and reporter) ---
        get_resp = await es_client.get(index="issues", id=issue_id)
        source_doc = get_resp["_source"]
        current_status = source_doc.get("status", "open")
        reporter_uid = source_doc.get("reported_by")  # Get reporter ID for potential karma

        # --- Check if upvote document exists in Firestore ---
        upvote_ref = db.collection("upvotes").document(upvote_doc_id)
        upvote_doc = upvote_ref.get()

        now = datetime.utcnow().isoformat() + "Z"
        new_active_state = True  # Default for new upvotes
        is_first_upvote = False  # Track if this is the first time upvoting (for karma)

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
            is_first_upvote = True  # Mark as first upvote for karma award
            logger.info(f"Creating new upvote for user {user_uid}")

        # --- Update Elasticsearch count based on new state ---
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
            refresh="wait_for",  # Use wait_for for consistency before awarding karma
            retry_on_conflict=3,
        )

        # Retrieve updated document from Elasticsearch
        get_response = await es_client.get(index="issues", id=issue_id)
        updated_source = get_response['_source']
        
        logger.info(
            f"Upvote toggled for {issue_id}. isActive: {new_active_state}, New counts: {updated_source.get('upvotes')}"
        )

        # --- AWARD KARMA LOGIC (only on first upvote activation for open issues) ---
        if is_first_upvote and new_active_state and current_status == "open":
            if reporter_uid and reporter_uid != "anonymous":
                current_voter_uid = user.get("uid")
                # --- Prevent self-vote karma ---
                if reporter_uid == current_voter_uid:
                    logger.info(
                        f"User {current_voter_uid} upvoted their own issue {issue_id}. No karma awarded."
                    )
                else:
                    try:
                        user_doc_ref = db.collection("users").document(reporter_uid)
                        # Check if user exists before trying to update
                        reporter_doc = user_doc_ref.get()  # Synchronous call
                        if reporter_doc.exists:
                            user_doc_ref.update({"karma": Increment(5)})
                            logger.info(
                                f"Awarded +5 karma to reporter {reporter_uid} for upvote on {issue_id}."
                            )
                        else:
                            logger.warning(
                                f"Reporter user {reporter_uid} not found in Firestore. Cannot award karma."
                            )
                    except Exception as firestore_err:
                        # Log error but don't fail the whole request
                        logger.error(
                            f"Failed to award karma to {reporter_uid} for upvote on {issue_id}: {firestore_err}"
                        )
            else:
                logger.info(
                    f"Issue {issue_id} reported anonymously or reporter ID missing. No karma awarded."
                )
        # --- END AWARD KARMA LOGIC ---

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
):  # Require user
    logger.info(f"User {user.get('uid')} unliking issue {issue_id}")
    if not es_client:
        raise HTTPException(503, "DB unavailable")
    try:
        # Single update operation with script that handles different statuses and prevents negative values
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
            "lang": "painless",
        }

        # Perform update operation
        await es_client.update(
            index="issues",
            id=issue_id,
            script=script,
            refresh=True,
            retry_on_conflict=3,
        )

        # Retrieve updated document
        get_response = await es_client.get(index="issues", id=issue_id)
        updated_source = get_response["_source"]

        logger.info(f"Unlike OK for {issue_id}. New: {updated_source.get('upvotes')}")
        return {"message": "Unliked", "updated_issue": updated_source}
    except NotFoundError:
        logger.warning(f"Unlike fail: {issue_id} not found.")
        raise HTTPException(404, f"{issue_id} not found")
    except RequestError as e:
        logger.error(f"ES Err unlike {issue_id}: {e.info}")
        raise HTTPException(400, f"DB err: {e.error}")
    except Exception as e:
        logger.exception(f"Unexpected err unlike {issue_id}")
        raise HTTPException(500, f"Server err: {e}")


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


# main.py


@app.post("/api/issues/{issue_id}/submit-fix")
async def submit_fix(
    issue_id: str,
    user: dict = Depends(get_current_user),  # Requires auth
    file: UploadFile = File(...),
    description: str = Form(""),  # Optional description from NGO
):
    """
    Endpoint for NGOs to submit proof of a fix (photo).
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
        user_doc = user_doc_ref.get()  # Synchronous call

        if not user_doc.exists:
            logger.warning(f"User {user_uid} not found in Firestore.")
            raise HTTPException(status_code=403, detail="User profile not found.")

        user_data = user_doc.to_dict()  # Use .to_dict()
        user_type = user_data.get("userType")
        if user_type != "ngo":
            logger.warning(
                f"User {user_uid} is not an NGO (userType: {user_type}). Cannot submit fix."
            )
            raise HTTPException(
                status_code=403, detail="Only NGOs can submit fixes."
            )

        logger.info(f"User {user_uid} verified as {user_type}.")
    except Exception as e:
        logger.exception(f"Error verifying NGO status for {user_uid}: {e}")
        raise HTTPException(status_code=500, detail="Error verifying user permissions.")

    # --- 2. Check if issue is 'open' ---
    try:
        get_resp = await es_client.get(index="issues", id=issue_id)
        original_issue_doc = get_resp["_source"]
        current_status = original_issue_doc.get("status", "open")
        if current_status != "open":
            logger.warning(
                f"User {user_uid} tried to fix issue {issue_id} but status is {current_status}."
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
    fix_public_url = ""  # Initialize variable
    try:
        file_uuid = uuid.uuid4()
        blob_name = f"fix-proof/{issue_id}/{file_uuid}_{file.filename or 'fix'}"
        data = await file.read()
        if not data:
            raise HTTPException(400, "Empty proof file")

        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(blob_name)
        blob.upload_from_string(data, content_type=file.content_type)
        fix_public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_name}"
        logger.info(f"Fix proof uploaded to GCS: {fix_public_url}")
    except Exception as gcs_error:
        logger.exception("GCS upload fail for fix proof")
        raise HTTPException(500, f"GCS fail: {gcs_error}")

    # --- 4. Call Issue_Verifier Service ---
    try:
        logger.info(f"Calling verifier service: {VERIFIER_URL}")
        verifier_payload = {
            "issue_id": issue_id,
            "ngo_id": user_uid,  # Pass the UID of the user submitting the fix
            "image_urls": [fix_public_url],
            "fix_description": description,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

        verifier_response = requests.post(
            f"{VERIFIER_URL}/verify_fix/",
            json=verifier_payload,
            timeout=60,  # Increased timeout just in case
        )
        verifier_response.raise_for_status()  # Raises HTTPError for 4xx/5xx responses
        verification_result = verifier_response.json()

        logger.info(
            f"Fix submission processed by Verifier for issue {issue_id}. Result: {verification_result}"
        )

        # --- NEW: Award Karma and Update Stats based on Verifier's response ---
        overall_outcome = verification_result.get("overall_outcome")
        karma_points = 0
        if overall_outcome == "closed":
            karma_points = 20
        # No karma for "rejected" outcomes

        # Get CO2 saved from the original issue
        co2_saved = original_issue_doc.get("fate_risk_co2", 0.0)

        if karma_points > 0:  # Check if karma should be awarded
            try:
                ngo_doc_ref = db.collection("users").document(
                    user_uid
                )  # Use the UID of the submitter
                # Check if user exists before trying to update (using the doc snapshot we already fetched)
                if user_doc.exists:  # Check the snapshot from step 1
                    # Update karma, CO2 saved, issues fixed, and issues resolved for NGO
                    update_data = {
                        "karma": Increment(karma_points),
                        "stats.issues_fixed": Increment(1),
                        "stats.issues_resolved": Increment(1),
                        "stats.co2_saved": Increment(co2_saved),
                    }
                    ngo_doc_ref.update(update_data)
                    logger.info(
                        f"Awarded +{karma_points} karma, +{co2_saved} CO2, and updated stats for NGO {user_uid} for fix outcome '{overall_outcome}' on {issue_id}."
                    )
                else:
                    # This case should ideally not happen due to check in step 1, but log just in case
                    logger.warning(
                        f"User {user_uid} doc was unexpectedly missing. Cannot award karma."
                    )
            except Exception as firestore_err:
                # Log error but don't fail the request
                logger.error(
                    f"Failed to update stats for user {user_uid}: {firestore_err}"
                )
        # --- END NEW KARMA AND STATS LOGIC ---

        return {
            "message": "Fix submitted successfully!",
            "issue_id": issue_id,
            "verification_result": verification_result,  # Pass Verifier result back to frontend
        }

    except requests.exceptions.HTTPError as http_err:
        error_detail = f"Verifier service error: {http_err.response.status_code}. {http_err.response.text}"
        logger.error(error_detail)
        # Try to parse JSON detail from the verifier's error response
        try:
            err_json = http_err.response.json()
            error_detail = err_json.get("detail", error_detail)
        except json.JSONDecodeError:
            pass  # Keep original text if JSON parsing fails
        raise HTTPException(502, f"Error from verifier service: {error_detail}")
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


@app.get("/api/issues/{issue_id}/fix-details")
async def get_issue_fix_details(issue_id: str):
    """
    Fetch fix details for a closed issue, including fix images and NGO info.
    """
    if not es_client:
        raise HTTPException(503, "Elasticsearch unavailable")
    if not db:
        raise HTTPException(503, "Firestore client not available")
    
    try:
        # 1. Fetch the issue from Elasticsearch
        issue_query = {"query": {"term": {"issue_id": {"value": issue_id}}}}
        issue_response = await es_client.search(index="issues", body=issue_query, size=1)
        issue_hits = issue_response.get("hits", {}).get("hits", [])
        
        if not issue_hits:
            raise HTTPException(404, f"Issue {issue_id} not found")
        
        issue_data = issue_hits[0]["_source"]
        
        # 2. Check if issue is closed
        if issue_data.get("status") != "closed":
            return {"has_fix": False, "message": "Issue is not closed yet"}
        
        # 3. Get closed_by user ID
        closed_by_uid = issue_data.get("closed_by")
        if not closed_by_uid:
            return {"has_fix": False, "message": "No fix information available"}
        
        # 4. Fetch fix details from fixes index
        fix_query = {"query": {"term": {"issue_id": {"value": issue_id}}}}
        fix_response = await es_client.search(index="fixes", body=fix_query, size=1)
        fix_hits = fix_response.get("hits", {}).get("hits", [])
        
        if not fix_hits:
            return {"has_fix": False, "message": "Fix details not found"}
        
        fix_data = fix_hits[0]["_source"]
        
        # 5. Fetch user information from Firestore
        user_doc = db.collection("users").document(closed_by_uid).get()
        user_info = {}
        
        if user_doc.exists:
            user_data = user_doc.to_dict()
            user_info = {
                "name": user_data.get("name", "Anonymous NGO"),
                "organization": user_data.get("organization", None),
                "userType": user_data.get("userType", "ngo"),
            }
        else:
            user_info = {
                "name": "Anonymous NGO",
                "organization": None,
                "userType": "ngo",
            }
        
        # 6. Return fix details
        return {
            "has_fix": True,
            "fix_id": fix_data.get("fix_id"),
            "image_urls": fix_data.get("image_urls", []),
            "description": fix_data.get("description", ""),
            "title": fix_data.get("title", ""),
            "created_at": fix_data.get("created_at"),
            "fixed_by": user_info,
            "co2_saved": fix_data.get("co2_saved", 0),
            "success_rate": fix_data.get("success_rate", 0),
            "overall_outcome": issue_data.get("overall_outcome", "closed"),  # Get from issue data
            "fix_outcomes": fix_data.get("fix_outcomes", []),  # Per-issue results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error fetching fix details for issue {issue_id}: {e}")
        raise HTTPException(500, f"Failed to fetch fix details: {str(e)}")


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
            users_ref.where(
                field_path="userType", op_string="==", value="ngo"
            )
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
        higher_karma_query = users_ref.where(
            field_path="karma", op_string=">", value=karma
        )
        higher_karma_docs = list(higher_karma_query.stream())
        current_rank = len(higher_karma_docs) + 1

        # Build response based on user type
        response_stats = {
            "karma": karma,
            "currentRank": current_rank,
            "issuesReported": stats.get("issues_reported", 0),
            "issuesResolved": stats.get("issues_resolved", 0),
            "co2Saved": stats.get("co2_saved", 0),  # Get from Firestore stats
            "badges": [],  # Placeholder for future implementation
        }

        # Add NGO-specific stats
        if user_type == "ngo":
            response_stats["issuesFixed"] = stats.get("issues_fixed", 0)

        logger.info(f"Returning stats for user {user_id}: {response_stats}")
        return {"stats": response_stats}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error fetching user stats for {user_id}: {e}")
        raise HTTPException(500, f"Failed to fetch user stats: {str(e)}")


@app.get("/api/issues/{issue_id}/upvote-status")
async def get_upvote_status(issue_id: str, user: dict = Depends(get_current_user)):
    """Check if current user has upvoted this issue"""
    if not db:
        raise HTTPException(503, "Firestore unavailable")

    user_uid = user.get("uid")
    upvote_doc_id = f"{issue_id}__{user_uid}"

    try:
        upvote_doc = db.collection("upvotes").document(upvote_doc_id).get()

        if upvote_doc.exists:
            upvote_data = upvote_doc.to_dict()
            return {
                "hasUpvoted": upvote_data.get("isActive", False),
                "upvotedAt": upvote_data.get("upvotedAt"),
                "lastUpdated": upvote_data.get("lastUpdated"),
            }
        else:
            return {"hasUpvoted": False}

    except Exception as e:
        logger.exception(f"Error checking upvote status for {issue_id}")
        raise HTTPException(500, f"Server error: {e}")


class BatchUpvoteRequest(BaseModel):
    issue_ids: List[str]


@app.post("/api/issues/batch-upvote-status")
async def get_batch_upvote_status(
    request: BatchUpvoteRequest,
    user: dict = Depends(get_current_user)
):
    """
    Check upvote and report status for multiple issues in one call.
    Returns maps of issue_id -> hasUpvoted and issue_id -> hasReported status.
    """
    if not db:
        raise HTTPException(503, "Firestore unavailable")
    
    user_uid = user.get("uid")
    issue_ids = request.issue_ids
    
    try:
        # Build document IDs for all issues (both upvotes and reports)
        upvote_doc_ids = [f"{issue_id}__{user_uid}" for issue_id in issue_ids]
        report_doc_ids = [f"{issue_id}__{user_uid}" for issue_id in issue_ids]
        
        # Batch fetch upvotes from Firestore
        upvote_refs = [
            db.collection("upvotes").document(doc_id) 
            for doc_id in upvote_doc_ids
        ]
        
        # Batch fetch reports from Firestore
        report_refs = [
            db.collection("reports").document(doc_id) 
            for doc_id in report_doc_ids
        ]
        
        # Get all documents in two batch operations (efficient!)
        upvote_docs = db.get_all(upvote_refs)
        report_docs = db.get_all(report_refs)
        
        # Build response maps
        upvote_status = {}
        report_status = {}
        
        for i, doc in enumerate(upvote_docs):
            issue_id = issue_ids[i]
            if doc.exists:
                upvote_data = doc.to_dict()
                upvote_status[issue_id] = upvote_data.get("isActive", False)
            else:
                upvote_status[issue_id] = False
        
        for i, doc in enumerate(report_docs):
            issue_id = issue_ids[i]
            if doc.exists:
                report_data = doc.to_dict()
                report_status[issue_id] = report_data.get("isActive", False)
            else:
                report_status[issue_id] = False
        
        logger.info(f"Batch checked {len(issue_ids)} issues (upvotes + reports) for user {user_uid}")
        return {
            "upvoteStatus": upvote_status,
            "reportStatus": report_status
        }
        
    except Exception as e:
        logger.exception(f"Error checking batch upvote/report status")
        raise HTTPException(500, f"Server error: {e}")


