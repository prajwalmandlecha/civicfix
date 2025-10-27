"""
Issues router - Handles all issue-related endpoints.
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile, Query
from core.dependencies import get_current_user, get_optional_user
from core.database import get_elasticsearch_client
from services.geocoding_service import geocode_location
from services.storage_service import upload_file_to_gcs
from services.analyzer_service import analyze_issue
from services.user_service import award_first_post_karma, get_user_display_name
from services.issue_service import upvote_issue, remove_upvote, report_issue

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/issues")
async def get_all_issues(
    user: Optional[dict] = Depends(get_optional_user),
    latitude: Optional[float] = Query(None, description="User's latitude"),
    longitude: Optional[float] = Query(None, description="User's longitude"),
    radius_km: float = Query(5.0, description="Search radius in kilometers", gt=0),
):
    """
    Get all issues, optionally filtered by location.
    Public endpoint (no auth required).
    """
    es_client = get_elasticsearch_client()
    if not es_client:
        raise HTTPException(503, "Database unavailable")

    try:
        query = {"match_all": {}}
        
        # Add location filter if provided
        if latitude is not None and longitude is not None:
            query = {
                "bool": {
                    "must": {"match_all": {}},
                    "filter": {
                        "geo_distance": {
                            "distance": f"{radius_km}km",
                            "location": {"lat": latitude, "lon": longitude},
                        }
                    },
                }
            }

        response = await es_client.search(
            index="issues",
            body={
                "query": query,
                "size": 100,
                "sort": [{"created_at": {"order": "desc"}}],
            },
        )

        issues = []
        for hit in response["hits"]["hits"]:
            issue_data = hit["_source"]
            issue_data["issue_id"] = hit["_id"]
            issues.append(issue_data)

        return {"count": len(issues), "issues": issues}

    except Exception as e:
        logger.exception("Failed to retrieve issues")
        raise HTTPException(500, "Internal server error")


@router.post("/submit-issue")
async def submit_issue(
    user: dict = Depends(get_current_user),
    file: UploadFile = File(...),
    locationstr: str = Form(...),
    description: str = Form(...),
    labels: List[str] = Form([]),
    is_anonymous: bool = Form(False),
):
    """
    Submit a single issue report with image, location, and description.
    Used by the React Native mobile app.
    """
    logger.info(f"User {user.get('uid')} submitting issue report")

    # Validate file
    if not file:
        raise HTTPException(400, "No file provided")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Only image files are supported")

    # Geocode location
    geocoded = geocode_location(locationstr)
    if not geocoded:
        raise HTTPException(400, f"Could not geocode location: '{locationstr}'")

    # Upload to GCS
    public_url = await upload_file_to_gcs(file, "issues")
    if not public_url:
        raise HTTPException(500, "Failed to upload file to storage")

    # Prepare data for analyzer
    reporter_id = "anonymous" if is_anonymous else user.get("uid", "anonymous")
    source_type = "anonymous" if is_anonymous else "citizen"
    
    user_display_name = "Anonymous"
    if not is_anonymous:
        user_display_name = await get_user_display_name(reporter_id)

    # Call AI analyzer
    analysis_result = analyze_issue(
        photo_url=public_url,
        location_dict=geocoded,
        timestamp=geocoded.get("timestamp", ""),
        description=description,
        user_selected_labels=labels,
    )

    if not analysis_result:
        raise HTTPException(502, "Analysis service unavailable")

    # Award karma if not anonymous
    if not is_anonymous and reporter_id != "anonymous":
        await award_first_post_karma(
            reporter_id,
            user_display_name,
            user.get("email", ""),
        )

    # Return response
    if analysis_result.get("no_issues_found"):
        return {
            "no_issues_found": True,
            "message": "No issues detected in the uploaded image.",
            "image_url": public_url,
            "location_text": locationstr,
            "location_coords": geocoded,
        }

    return {
        "image_url": public_url,
        "analysis": analysis_result,
        "location_text": locationstr,
        "location_coords": geocoded,
    }


@router.post("/issues/{issue_id}/upvote")
async def upvote_issue_endpoint(
    issue_id: str,
    user: dict = Depends(get_current_user),
):
    """Upvote an issue"""
    try:
        result = await upvote_issue(issue_id, user.get("uid"))
        if not result["success"]:
            raise HTTPException(400, result["message"])
        return result
    except Exception as e:
        logger.error(f"Error upvoting issue: {e}")
        raise HTTPException(500, "Failed to upvote issue")


@router.post("/issues/{issue_id}/unlike")
async def unlike_issue_endpoint(
    issue_id: str,
    user: dict = Depends(get_current_user),
):
    """Remove upvote from an issue"""
    try:
        result = await remove_upvote(issue_id, user.get("uid"))
        if not result["success"]:
            raise HTTPException(400, result["message"])
        return result
    except Exception as e:
        logger.error(f"Error removing upvote: {e}")
        raise HTTPException(500, "Failed to remove upvote")


@router.post("/issues/{issue_id}/report")
async def report_issue_endpoint(
    issue_id: str,
    reason: str = Form(...),
    user: dict = Depends(get_current_user),
):
    """Report an issue for review"""
    try:
        result = await report_issue(issue_id, user.get("uid"), reason)
        if not result["success"]:
            raise HTTPException(400, result["message"])
        return result
    except Exception as e:
        logger.error(f"Error reporting issue: {e}")
        raise HTTPException(500, "Failed to report issue")

