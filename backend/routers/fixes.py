"""
Fixes router - Handles fix submission and retrieval.
Only contains endpoints used by the mobile app.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from core.dependencies import get_current_user
from core.database import get_elasticsearch_client, get_firestore_client
from services.storage_service import upload_multiple_files_to_gcs
from services.analyzer_service import verify_fix
from services.user_service import increment_fix_count, award_karma_for_fix

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/issues/{issue_id}/submit-fix")
async def submit_fix(
    issue_id: str,
    files: List[UploadFile] = File(...),
    title: str = Form(None),
    description: str = Form(None),
    user: dict = Depends(get_current_user),
):
    """
    Submit a fix for an issue with proof images.
    Used by: FixUploadScreen.js, useUpload.js
    Only NGOs can submit fixes.
    """
    user_id = user.get("uid")
    logger.info(f"User {user_id} submitting fix for issue {issue_id}")

    es_client = get_elasticsearch_client()
    db = get_firestore_client()
    
    if not es_client or not db:
        raise HTTPException(503, "Database unavailable")

    # Validate user is NGO
    user_doc = db.collection("users").document(user_id).get()
    if not user_doc.exists:
        raise HTTPException(404, "User not found")

    user_data = user_doc.to_dict()
    if user_data.get("userType") != "ngo":
        raise HTTPException(403, "Only NGOs can submit fixes")

    # Get issue from Elasticsearch
    try:
        get_resp = await es_client.get(index="issues", id=issue_id)
        issue_data = get_resp["_source"]
    except Exception as e:
        logger.exception(f"Failed to fetch issue {issue_id}")
        raise HTTPException(404, "Issue not found")

    # Check if issue is already closed
    if issue_data.get("status", "").lower() == "closed":
        raise HTTPException(400, "Issue is already closed")

    # Upload fix images to GCS
    photo_urls = await upload_multiple_files_to_gcs(files, "fixes")
    if not photo_urls:
        raise HTTPException(500, "Failed to upload fix images")

    # Call verifier service (optional - can be async)
    verification_result = None
    if issue_data.get("photo_url"):
        verification_result = verify_fix(
            before_image_url=issue_data["photo_url"],
            after_image_urls=photo_urls,
            issue_description=issue_data.get("description", ""),
            fix_description=description or "",
        )

    # Calculate CO2 saved (simplified)
    co2_saved = issue_data.get("fate_risk_co2", 0) * 0.8  # 80% of predicted risk

    # Determine new status based on verification
    new_status = "closed"
    if verification_result:
        overall_outcome = verification_result.get("overall_outcome", "closed")
        if overall_outcome == "rejected":
            raise HTTPException(400, "Fix verification failed")
        elif overall_outcome == "partially_closed":
            new_status = "partially_closed"

    # Update issue in Elasticsearch
    try:
        from datetime import datetime
        now = datetime.utcnow().isoformat() + "Z"
        
        await es_client.update(
            index="issues",
            id=issue_id,
            body={
                "doc": {
                    "status": new_status,
                    "closed_by": user_id,
                    "closed_at": now,
                    "fix_photo_urls": photo_urls,
                    "fix_title": title or "Fix Applied",
                    "fix_description": description or "",
                    "co2_kg_saved": co2_saved,
                    "verification_status": verification_result.get("status") if verification_result else "pending",
                }
            },
            refresh="wait_for",
        )

        # Mirror essential status fields in Firestore `issues/{id}` for consistency
        try:
            issue_ref = db.collection("issues").document(issue_id)
            issue_ref.set({
                "status": new_status,
                "closed_by": user_id,
                "closed_at": now,
            }, merge=True)
        except Exception as fb_err:
            logger.warning(f"Failed to mirror status to Firestore for issue {issue_id}: {fb_err}")
    except Exception as e:
        logger.exception(f"Failed to update issue {issue_id}")
        raise HTTPException(500, "Failed to update issue status")

    # Update user stats
    await increment_fix_count(user_id, co2_saved)

    # Award karma to reporter if issue is fully closed
    if new_status == "closed":
        reporter_id = issue_data.get("reported_by")
        if reporter_id and reporter_id != "anonymous":
            await award_karma_for_fix(reporter_id)

    logger.info(f"Fix submitted successfully for issue {issue_id} by user {user_id}")

    return {
        "success": True,
        "message": f"Fix submitted successfully with {len(photo_urls)} images!",
        "issue_id": issue_id,
        "photo_urls": photo_urls,
        "co2_saved": co2_saved,
        "verification": verification_result,
    }


@router.get("/issues/{issue_id}/fix-details")
async def get_fix_details(
    issue_id: str,
):
    """
    Get fix details for a closed issue.
    Used by: LocationScreen.js, SocialPost.js, IssueDetailModal.js
    """
    es_client = get_elasticsearch_client()
    db = get_firestore_client()
    
    if not es_client or not db:
        raise HTTPException(503, "Database unavailable")

    try:
        # Fetch issue from Elasticsearch
        get_resp = await es_client.get(index="issues", id=issue_id)
        issue_data = get_resp["_source"]
    except Exception:
        raise HTTPException(404, "Issue not found")

    if issue_data.get("status", "").lower() != "closed":
        return {
            "has_fix": False,
            "message": "Issue is not closed yet",
        }

    # Get NGO user details
    closed_by = issue_data.get("closed_by")
    ngo_name = "Unknown NGO"
    ngo_logo = None
    
    if closed_by and db:
        try:
            user_doc = db.collection("users").document(closed_by).get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                ngo_name = user_data.get("organization_name") or user_data.get("displayName") or "Unknown NGO"
                ngo_logo = user_data.get("logoUrl") or user_data.get("photoURL")
        except Exception as e:
            logger.error(f"Failed to fetch NGO details: {e}")

    return {
        "has_fix": True,
        "issue_id": issue_id,
        "title": issue_data.get("fix_title"),
        "description": issue_data.get("fix_description"),
        "photo_urls": issue_data.get("fix_photo_urls", []),
        "submitted_by": closed_by,
        "ngo_name": ngo_name,
        "ngo_logo": ngo_logo,
        "submitted_at": issue_data.get("closed_at"),
        "co2_saved": issue_data.get("co2_kg_saved", 0),
        "verification_status": issue_data.get("verification_status"),
    }

