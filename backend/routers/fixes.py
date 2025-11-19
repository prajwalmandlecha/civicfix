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

    # Call verifier service - it will handle ES updates and return results
    verification_result = verify_fix(
        issue_id=issue_id,
        after_image_urls=photo_urls,
        fix_description=description or "",
        ngo_id=user_id
    )

    # If verifier service is down or returns None, proceed with basic fix submission
    if verification_result:
        logger.info(f"Fix verification completed: {verification_result}")
        
        # Extract data from verification response
        overall_outcome = verification_result.get("overall_outcome", "closed")
        suggested_success_rate = verification_result.get("suggested_success_rate", 0.8)
        fix_id = verification_result.get("fix_id")
        co2_saved = issue_data.get("fate_risk_co2", 0) * suggested_success_rate
        
        # Map overall_outcome to issue status
        # Don't throw exception for rejected fixes - let frontend handle display
        if overall_outcome == "rejected":
            new_status = "open"  # Keep issue open if fix is rejected
        elif overall_outcome == "partially_closed":
            new_status = "partially_closed"
        else:
            new_status = "closed"
        
        # Verifier already updated Elasticsearch, but we update Firestore and always update fix_photo_urls for consistency
        # Only update status/closed_by/closed_at if fix is not rejected, but always update fix_photo_urls
        try:
            # Update Firestore (only if not rejected)
            if overall_outcome != "rejected":
                issue_ref = db.collection("issues").document(issue_id)
                issue_ref.set({
                    "status": new_status,
                    "closed_by": user_id,
                    "closed_at": verification_result.get("created_at"),
                }, merge=True)
                # Update user stats
                await increment_fix_count(user_id, co2_saved)
                # Award karma to reporter if issue is fully closed
                if new_status == "closed":
                    reporter_id = issue_data.get("reported_by")
                    if reporter_id and reporter_id != "anonymous":
                        await award_karma_for_fix(reporter_id)
            # Always update fix_photo_urls in Elasticsearch
            es_update_body = {
                "doc": {
                    "fix_photo_urls": photo_urls
                }
            }
            await es_client.update(
                index="issues",
                id=issue_id,
                body=es_update_body,
                refresh="wait_for",
            )
        except Exception as fb_err:
            logger.warning(f"Failed to update fix_photo_urls or mirror status to Firestore for issue {issue_id}: {fb_err}")
        
        logger.info(f"Fix submitted successfully for issue {issue_id} by user {user_id}")
        
        return {
            "success": True,
            "message": f"Fix submitted and verified successfully!",
            "issue_id": issue_id,
            "fix_id": fix_id,
            "photo_urls": photo_urls,
            "co2_saved": co2_saved,
            "overall_outcome": overall_outcome,
            "success_rate": suggested_success_rate,
            "per_issue_results": verification_result.get("per_issue_results", []),
        }
    else:
        # Fallback: Verifier service unavailable, proceed with basic submission
        logger.warning(f"Verifier service unavailable, proceeding with basic fix submission for issue {issue_id}")
        
        from datetime import datetime
        now = datetime.utcnow().isoformat() + "Z"
        co2_saved = issue_data.get("fate_risk_co2", 0) * 0.8
        
        # Update issue in Elasticsearch
        try:
            await es_client.update(
                index="issues",
                id=issue_id,
                body={
                    "doc": {
                        "status": "closed",
                        "closed_by": user_id,
                        "closed_at": now,
                        "fix_photo_urls": photo_urls,
                        "fix_title": title or "Fix Applied",
                        "fix_description": description or "",
                        "co2_kg_saved": co2_saved,
                        "verification_status": "pending",
                    }
                },
                refresh="wait_for",
            )
            
            # Mirror to Firestore
            issue_ref = db.collection("issues").document(issue_id)
            issue_ref.set({
                "status": "closed",
                "closed_by": user_id,
                "closed_at": now,
            }, merge=True)
        except Exception as e:
            logger.exception(f"Failed to update issue {issue_id}")
            raise HTTPException(500, "Failed to update issue status")
        
        # Update user stats
        await increment_fix_count(user_id, co2_saved)
        
        # Award karma to reporter
        reporter_id = issue_data.get("reported_by")
        if reporter_id and reporter_id != "anonymous":
            await award_karma_for_fix(reporter_id)
        
        logger.info(f"Fix submitted (without verification) for issue {issue_id} by user {user_id}")
        
        return {
            "success": True,
            "message": f"Fix submitted successfully (verification pending)!",
            "issue_id": issue_id,
            "photo_urls": photo_urls,
            "co2_saved": co2_saved,
            "verification_status": "pending",
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
                # Try multiple fields in order of preference
                ngo_name = (
                    user_data.get("displayName") or 
                    user_data.get("name")                )
                ngo_logo = user_data.get("logoUrl") or user_data.get("photoURL")
                logger.info(f"Fetched NGO details for {closed_by}: {ngo_name}")
            else:
                logger.warning(f"User document not found for closed_by: {closed_by}")
        except Exception as e:
            logger.error(f"Failed to fetch NGO details for {closed_by}: {e}")

    # Try to fetch detailed fix data from fixes index
    fix_outcomes = None
    overall_outcome = None
    success_rate = None
    
    # Check if there are evidence_ids (fix documents)
    evidence_ids = issue_data.get("evidence_ids", [])
    if evidence_ids:
        try:
            # Get the latest fix document
            fix_id = evidence_ids[-1]  # Most recent fix
            fix_resp = await es_client.get(index="fixes", id=fix_id)
            fix_data = fix_resp["_source"]
            
            fix_outcomes = fix_data.get("fix_outcomes", [])
            success_rate = fix_data.get("success_rate")
            
            # Determine overall outcome from fix document or issue status
            if fix_data.get("overall_outcome"):
                overall_outcome = fix_data.get("overall_outcome")
            elif issue_data.get("status") == "partially_closed":
                overall_outcome = "partially_closed"
            else:
                overall_outcome = "closed"
                
            logger.info(f"Fetched fix details from fixes index for {fix_id}")
        except Exception as e:
            logger.warning(f"Could not fetch fix details from fixes index: {e}")

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
        "fix_outcomes": fix_outcomes,
        "overall_outcome": overall_outcome,
        "success_rate": success_rate,
    }

