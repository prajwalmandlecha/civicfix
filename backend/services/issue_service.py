"""
Issue service for managing issue-related business logic.
"""

import logging
from typing import Dict, Any, Optional, List
from firebase_admin import firestore
from google.cloud.firestore_v1.transforms import Increment
from core.database import get_firestore_client, get_elasticsearch_client

logger = logging.getLogger(__name__)


async def upvote_issue(issue_id: str, user_id: str) -> Dict[str, Any]:
    """
    Upvote an issue and update Firestore/Elasticsearch.
    
    Args:
        issue_id: Issue ID
        user_id: User ID
        
    Returns:
        Dict: Result with success status and upvote count
    """
    db = get_firestore_client()
    if not db:
        raise Exception("Firestore client not available")

    try:
        # Check if user already upvoted
        upvote_ref = db.collection("issue_upvotes").document(f"{issue_id}_{user_id}")
        upvote_doc = upvote_ref.get()

        if upvote_doc.exists:
            return {
                "success": False,
                "message": "You have already upvoted this issue",
                "already_upvoted": True,
            }

        # Get issue to determine status
        issue_ref = db.collection("issues").document(issue_id)
        issue_doc = issue_ref.get()

        if not issue_doc.exists:
            return {"success": False, "message": "Issue not found"}

        issue_data = issue_doc.to_dict()
        issue_status = issue_data.get("status", "open").lower()

        # Create upvote record
        upvote_ref.set({
            "issue_id": issue_id,
            "user_id": user_id,
            "created_at": firestore.SERVER_TIMESTAMP,
        })

        # Increment appropriate counter
        if issue_status == "closed":
            issue_ref.update({"upvotes.closed": Increment(1)})
            field = "upvotes.closed"
        else:
            issue_ref.update({"upvotes.open": Increment(1)})
            field = "upvotes.open"

        # Get updated count
        updated_issue = issue_ref.get().to_dict()
        upvote_count = updated_issue.get("upvotes", {}).get(
            "closed" if issue_status == "closed" else "open", 1
        )

        logger.info(f"User {user_id} upvoted issue {issue_id} ({issue_status})")

        return {
            "success": True,
            "message": "Issue upvoted successfully",
            "upvote_count": upvote_count,
        }

    except Exception as e:
        logger.error(f"Error upvoting issue {issue_id}: {e}")
        raise


async def remove_upvote(issue_id: str, user_id: str) -> Dict[str, Any]:
    """
    Remove upvote from an issue.
    
    Args:
        issue_id: Issue ID
        user_id: User ID
        
    Returns:
        Dict: Result with success status and upvote count
    """
    db = get_firestore_client()
    if not db:
        raise Exception("Firestore client not available")

    try:
        upvote_ref = db.collection("issue_upvotes").document(f"{issue_id}_{user_id}")
        upvote_doc = upvote_ref.get()

        if not upvote_doc.exists:
            return {
                "success": False,
                "message": "You have not upvoted this issue",
            }

        # Get issue status
        issue_ref = db.collection("issues").document(issue_id)
        issue_doc = issue_ref.get()

        if not issue_doc.exists:
            return {"success": False, "message": "Issue not found"}

        issue_data = issue_doc.to_dict()
        issue_status = issue_data.get("status", "open").lower()

        # Delete upvote record
        upvote_ref.delete()

        # Decrement appropriate counter
        if issue_status == "closed":
            issue_ref.update({"upvotes.closed": Increment(-1)})
        else:
            issue_ref.update({"upvotes.open": Increment(-1)})

        # Get updated count
        updated_issue = issue_ref.get().to_dict()
        upvote_count = max(
            0,
            updated_issue.get("upvotes", {}).get(
                "closed" if issue_status == "closed" else "open", 0
            ),
        )

        logger.info(f"User {user_id} removed upvote from issue {issue_id}")

        return {
            "success": True,
            "message": "Upvote removed successfully",
            "upvote_count": upvote_count,
        }

    except Exception as e:
        logger.error(f"Error removing upvote from issue {issue_id}: {e}")
        raise


async def report_issue(issue_id: str, user_id: str, reason: str) -> Dict[str, Any]:
    """
    Report an issue for review.
    
    Args:
        issue_id: Issue ID
        user_id: User ID
        reason: Report reason
        
    Returns:
        Dict: Result with success status
    """
    db = get_firestore_client()
    if not db:
        raise Exception("Firestore client not available")

    try:
        # Check if user already reported
        report_ref = db.collection("issue_reports").document(f"{issue_id}_{user_id}")
        report_doc = report_ref.get()

        if report_doc.exists:
            return {
                "success": False,
                "message": "You have already reported this issue",
            }

        # Create report record
        from firebase_admin import firestore as fb_firestore
        report_ref.set({
            "issue_id": issue_id,
            "user_id": user_id,
            "reason": reason,
            "created_at": fb_firestore.SERVER_TIMESTAMP,
        })

        # Increment report count
        issue_ref = db.collection("issues").document(issue_id)
        issue_ref.update({"report_count": Increment(1)})

        logger.info(f"User {user_id} reported issue {issue_id}: {reason}")

        return {
            "success": True,
            "message": "Issue reported successfully",
        }

    except Exception as e:
        logger.error(f"Error reporting issue {issue_id}: {e}")
        raise

