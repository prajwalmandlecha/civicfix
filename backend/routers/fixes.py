"""
Fixes router - Handles fix submission and retrieval.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from core.dependencies import get_current_user
from core.database import get_firestore_client
from services.storage_service import upload_multiple_files_to_gcs
from services.analyzer_service import verify_fix
from services.user_service import increment_fix_count

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
    Only NGOs can submit fixes.
    """
    user_id = user.get("uid")
    logger.info(f"User {user_id} submitting fix for issue {issue_id}")

    db = get_firestore_client()
    if not db:
        raise HTTPException(503, "Database unavailable")

    # Validate user is NGO
    user_doc = db.collection("users").document(user_id).get()
    if not user_doc.exists:
        raise HTTPException(404, "User not found")

    user_data = user_doc.to_dict()
    if user_data.get("userType") != "ngo":
        raise HTTPException(403, "Only NGOs can submit fixes")

    # Get issue data
    issue_ref = db.collection("issues").document(issue_id)
    issue_doc = issue_ref.get()

    if not issue_doc.exists:
        raise HTTPException(404, "Issue not found")

    issue_data = issue_doc.to_dict()

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

    # Calculate CO2 saved (simplified - could be from verifier)
    co2_saved = issue_data.get("fate_risk_co2", 0) * 0.8  # 80% of predicted risk

    # Update issue in Firestore
    from firebase_admin import firestore as fb_firestore
    issue_ref.update({
        "status": "closed",
        "fix_submitted_by": user_id,
        "fix_submitted_at": fb_firestore.SERVER_TIMESTAMP,
        "fix_photo_urls": photo_urls,
        "fix_title": title or "Fix Applied",
        "fix_description": description or "",
        "co2_kg_saved": co2_saved,
        "verification_status": verification_result.get("status") if verification_result else "pending",
    })

    # Update user stats
    await increment_fix_count(user_id, co2_saved)

    logger.info(f"Fix submitted successfully for issue {issue_id} by user {user_id}")

    return {
        "success": True,
        "message": "Fix submitted successfully",
        "issue_id": issue_id,
        "photo_urls": photo_urls,
        "co2_saved": co2_saved,
        "verification": verification_result,
    }


@router.get("/issues/{issue_id}/fix-details")
async def get_fix_details(
    issue_id: str,
    user: dict = Depends(get_current_user),
):
    """Get fix details for a closed issue"""
    db = get_firestore_client()
    if not db:
        raise HTTPException(503, "Database unavailable")

    issue_ref = db.collection("issues").document(issue_id)
    issue_doc = issue_ref.get()

    if not issue_doc.exists:
        raise HTTPException(404, "Issue not found")

    issue_data = issue_doc.to_dict()

    if issue_data.get("status", "").lower() != "closed":
        return {
            "has_fix": False,
            "message": "Issue is not closed yet",
        }

    return {
        "has_fix": True,
        "issue_id": issue_id,
        "title": issue_data.get("fix_title"),
        "description": issue_data.get("fix_description"),
        "photo_urls": issue_data.get("fix_photo_urls", []),
        "submitted_by": issue_data.get("fix_submitted_by"),
        "submitted_at": issue_data.get("fix_submitted_at"),
        "co2_saved": issue_data.get("co2_kg_saved", 0),
        "verification_status": issue_data.get("verification_status"),
    }

