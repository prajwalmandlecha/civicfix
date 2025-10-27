"""
User service for managing user statistics and leaderboard data.
"""

import logging
from typing import Dict, List, Optional
from google.cloud.firestore_v1.transforms import Increment
from core.database import get_firestore_client

logger = logging.getLogger(__name__)


async def award_first_post_karma(user_id: str, user_display_name: str, user_email: str):
    """
    Award karma for first post and update user stats.
    
    Args:
        user_id: Firebase user ID
        user_display_name: User's display name
        user_email: User's email
    """
    db = get_firestore_client()
    if not db:
        logger.error("Firestore client not available")
        return

    try:
        user_doc_ref = db.collection("users").document(user_id)
        user_doc = user_doc_ref.get()

        if user_doc.exists:
            user_data = user_doc.to_dict()
            has_posted = user_data.get("has_posted_before", False)

            if not has_posted:
                user_doc_ref.update({
                    "karma": Increment(10),
                    "has_posted_before": True,
                    "stats.issues_reported": Increment(1)
                })
                logger.info(f"Awarded +10 first post karma to user {user_id}")
            else:
                user_doc_ref.update({"stats.issues_reported": Increment(1)})
                logger.info(f"User {user_id} has posted before. Incremented issues_reported")
        else:
            from firebase_admin import firestore as fb_firestore
            user_doc_ref.set({
                "name": user_display_name,
                "email": user_email,
                "userType": "citizen",
                "karma": 10,
                "has_posted_before": True,
                "createdAt": fb_firestore.SERVER_TIMESTAMP,
                "stats": {
                    "issues_reported": 1,
                    "issues_resolved": 0,
                    "co2_saved": 0
                }
            }, merge=True)
            logger.info(f"Created user document and awarded +10 first post karma to user {user_id}")

    except Exception as e:
        logger.error(f"Failed to update user karma/stats for {user_id}: {e}")


async def get_user_display_name(user_id: str) -> str:
    """
    Get user display name from Firestore.
    
    Args:
        user_id: Firebase user ID
        
    Returns:
        str: User's display name or default
    """
    db = get_firestore_client()
    if not db:
        return "Citizen"

    try:
        user_doc_ref = db.collection("users").document(user_id)
        user_doc = user_doc_ref.get()
        if user_doc.exists:
            return user_doc.to_dict().get("name", "Citizen")
        return "Citizen"
    except Exception as e:
        logger.warning(f"Could not fetch display name for {user_id}: {e}")
        return "Citizen"


async def increment_fix_count(user_id: str, co2_saved: float = 0.0):
    """
    Increment user's fix count and CO2 saved.
    
    Args:
        user_id: Firebase user ID
        co2_saved: Amount of CO2 saved (kg)
    """
    db = get_firestore_client()
    if not db:
        logger.error("Firestore client not available")
        return

    try:
        user_doc_ref = db.collection("users").document(user_id)
        user_doc_ref.update({
            "stats.issues_resolved": Increment(1),
            "stats.co2_saved": Increment(co2_saved)
        })
        logger.info(f"Incremented fix count for user {user_id}, CO2 saved: {co2_saved}")
    except Exception as e:
        logger.error(f"Failed to increment fix count for {user_id}: {e}")

