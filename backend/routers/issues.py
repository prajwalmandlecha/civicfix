"""
Issues router - All issue-related endpoints used by the mobile app.
"""
import logging
from typing import List, Optional, Dict
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile, Query
from core.dependencies import get_current_user, get_optional_user
from core.database import get_elasticsearch_client, get_firestore_client
from services.geocoding_service import geocode_location
from services.storage_service import upload_file_to_gcs
from services.analyzer_service import analyze_issue
from services.user_service import award_first_post_karma, get_user_display_name
from services.issue_service import upvote_issue, report_issue, toggle_upvote

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/issues/")
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
    Used by: LocationScreen.js
    
    Args:
        latitude: Location latitude
        longitude: Location longitude
        radius_km: Search radius in kilometers (default 5km)
        limit: Maximum number of results (default 10)
        skip: Number of results to skip for pagination (default 0)
        days_back: Only include issues from last N days (default 30)
    """
    es_client = get_elasticsearch_client()
    if not es_client:
        raise HTTPException(503, "DB unavailable")

    try:
        date_threshold = (
            datetime.now(timezone.utc) - timedelta(days=days_back)
        ).isoformat()

        query = {
            "size": limit,
            "from": skip,
            "query": {
                "bool": {
                    "must": [{"range": {"created_at": {"gte": date_threshold}}}],
                    "must_not": [
                        {"term": {"hidden_for_review": True}}
                    ],
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
            "total": total_hits,
            "skip": skip,
            "issues": issues,
        }

    except Exception as e:
        logger.exception("Failed to retrieve nearby issues from Elasticsearch")
        raise HTTPException(500, "Internal server error")





@router.get("/issues/with-user-status")


async def get_issues_with_user_status(


    latitude: float,


    longitude: float,


    radius_km: float = 5.0,


    limit: int = 10,


    skip: int = 0,


    days_back: int = 30,


    user: dict = Depends(get_current_user),


):


    """


    Get issues near a location with user's upvote and report status included.


    Used by: HomeScreen.js, useIssues.js


    """


    es_client = get_elasticsearch_client()


    db = get_firestore_client()


    if not es_client:


        raise HTTPException(503, "Elasticsearch unavailable")


    if not db:


        raise HTTPException(503, "Firestore unavailable")





    user_uid = user.get("uid")


    logger.info(


        f"User {user_uid} fetching issues with status near ({latitude}, {longitude})"


    )





    try:


        date_threshold = (


            datetime.now(timezone.utc) - timedelta(days=days_back)


        ).isoformat()





        query = {


            "size": limit,


            "from": skip,


            "query": {


                "bool": {


                    "must": [{"range": {"created_at": {"gte": date_threshold}}}],


                    "must_not": [


                        {"term": {"hidden_for_review": True}}


                    ],


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





        # Batch fetch upvote and report status from Firestore
        upvote_status = {}
        report_status = {}
        firestore_issues_data = {} # To store fresh data from Firestore

        if issue_ids:
            try:
                # Fetch user-specific status
                upvote_refs = [db.collection("upvotes").document(f"{iid}__{user_uid}") for iid in issue_ids]
                report_refs = [db.collection("reports").document(f"{iid}__{user_uid}") for iid in issue_ids]
                
                upvote_docs = db.get_all(upvote_refs)
                report_docs = db.get_all(report_refs)

                for doc in upvote_docs:
                    if doc.exists:
                        doc_data = doc.to_dict()
                        iid = doc_data.get("issue_id")
                        is_active = bool(doc_data.get("isActive", False))
                        if iid: upvote_status[iid] = is_active
                    
                for doc in report_docs:
                    if doc.exists:
                        doc_data = doc.to_dict()
                        iid = doc_data.get("issue_id")
                        is_active = bool(doc_data.get("isActive", False))
                        if iid: report_status[iid] = is_active

                # Also fetch the full issue docs from Firestore to get the TRUE upvote counts
                issue_refs = [db.collection("issues").document(iid) for iid in issue_ids]
                issue_docs = db.get_all(issue_refs)
                for doc in issue_docs:
                    if doc.exists:
                        firestore_issues_data[doc.id] = doc.to_dict()
                    
            except Exception as e:
                logger.error(f"Error fetching user status or issue data from Firestore: {e}")
                # On failure, default to false so the UI doesn't break
                upvote_status = {iid: False for iid in issue_ids}
                report_status = {iid: False for iid in issue_ids}

        # Merge user status and authoritative Firestore data into each issue
        issues_with_status = []
        for issue in issues:
            iid = issue["issue_id"]
            
            # Get the fresh data from Firestore if it exists
            firestore_data = firestore_issues_data.get(iid)
            if firestore_data:
                # Overwrite stale ES data with fresh Firestore data
                issue["upvotes"] = firestore_data.get("upvotes", {"open": 0, "closed": 0})
                issue["status"] = firestore_data.get("status", issue["status"])

            user_status = {
                "hasUpvoted": upvote_status.get(iid, False),
                "hasReported": report_status.get(iid, False),
            }
            issues_with_status.append({
                **issue,
                "userStatus": user_status,
            })

        # Log a sample for debugging
        if issues_with_status:
            sample = issues_with_status[0]
            logger.info(f"Sample issue {sample['issue_id']} prepared with userStatus: {sample['userStatus']} and upvotes: {sample['upvotes']}")



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


    Used by: useUpload.js


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


        reported_by=reporter_id,


        source=source_type,


        uploader_display_name=user_display_name,


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


async def upvote_issue_endpoint(issue_id: str, user: dict = Depends(get_current_user)):


    """


    Toggle upvote for an issue.


    Used by: SocialPost.js, IssueDetailModal.js


    """


    logger.info(f"User {user.get('uid')} toggling upvote for {issue_id}")


    


    try:


        # Use toggle semantics: if already upvoted -> deactivate, else activate


        result = await toggle_upvote(issue_id, user.get("uid"))


        return result


    except Exception as e:


        logger.exception(f"Error upvoting issue: {e}")


        raise HTTPException(500, "Failed to upvote issue")








@router.post("/issues/{issue_id}/report")


async def report_issue_endpoint(issue_id: str, user: dict = Depends(get_current_user)):


    """


    Report an issue as spam or not fixed.


    Used by: SocialPost.js, IssueDetailModal.js


    """


    logger.info(f"User {user.get('uid')} reporting issue {issue_id}")


    


    try:


        result = await report_issue(issue_id, user.get("uid"))


        return result


    except Exception as e:


        logger.exception(f"Error reporting issue: {e}")


        raise HTTPException(500, "Failed to report issue")

