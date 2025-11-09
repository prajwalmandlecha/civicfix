"""
Users router - User profile and stats endpoints.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from core.dependencies import get_current_user
from core.database import get_firestore_client
from google.cloud.firestore_v1.base_query import FieldFilter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/leaderboard/citizens")
async def get_citizen_leaderboard():
    """Fetch top 10 citizens by karma (public)."""
    db = get_firestore_client()
    if not db:
        raise HTTPException(503, "Database not available")
    try:
        users_ref = db.collection("users")
        # Firestore: filter by userType and order by karma desc
        query = (
            users_ref.where(filter=FieldFilter("userType", "==", "citizen"))
            .order_by("karma", direction="DESCENDING")
            .limit(10)
        )
        leaders = []
        rank = 1
        for doc in query.stream():
            data = doc.to_dict()
            leaders.append({
                "rank": rank,
                "id": doc.id,
                "name": data.get("display_name") or data.get("name") or data.get("email") or "Anonymous",
                "co2": data.get("karma", 0),  # frontend expects 'co2' field label but shows Karma
                "badges": data.get("badges", []),
            })
            rank += 1
        return {"leaderboard": leaders}
    except Exception as e:
        logger.exception("Failed to fetch citizen leaderboard")
        raise HTTPException(500, f"Server error: {e}")


@router.get("/leaderboard/ngos")
async def get_ngo_leaderboard():
    """Fetch top 10 NGOs by karma (public)."""
    db = get_firestore_client()
    if not db:
        raise HTTPException(503, "Database not available")
    try:
        users_ref = db.collection("users")
        query = (
            users_ref.where(filter=FieldFilter("userType", "==", "ngo"))
            .order_by("karma", direction="DESCENDING")
            .limit(10)
        )
        leaders = []
        rank = 1
        for doc in query.stream():
            data = doc.to_dict()
            leaders.append({
                "rank": rank,
                "id": doc.id,
                "name": data.get("organization_name") or data.get("display_name") or data.get("name") or data.get("email") or "NGO",
                "co2": data.get("karma", 0),
                "badges": data.get("badges", []),
            })
            rank += 1
        return {"leaderboard": leaders}
    except Exception as e:
        logger.exception("Failed to fetch NGO leaderboard")
        raise HTTPException(500, f"Server error: {e}")


@router.get("/users/{user_id}/stats-firebase")
async def get_user_stats_firebase(user_id: str, user: dict = Depends(get_current_user)):
    """
    Fetch user statistics directly from Firestore document fields.
    """
    db = get_firestore_client()
    if not db:
        raise HTTPException(503, "Database not available")

    if user.get("uid") != user_id:
        logger.warning(
            f"Auth mismatch: User {user.get('uid')} tried to fetch Firebase stats for {user_id}"
        )
        raise HTTPException(403, "You can only view your own statistics.")

    try:
        user_doc_ref = db.collection("users").document(user_id)
        user_doc = user_doc_ref.get()
        if not user_doc.exists:
            raise HTTPException(404, f"User {user_id} not found")

        user_data = user_doc.to_dict()
        user_type = user_data.get("userType", "citizen")
        stats = user_data.get("stats", {})
        karma = user_data.get("karma", 0)

        issues_reported = stats.get("issues_reported", 0)
        issues_resolved = stats.get("issues_resolved", 0) if user_type == "citizen" else 0
        issues_fixed = stats.get("issues_fixed", 0) if user_type in ["ngo", "volunteer"] else 0
        co2_saved = stats.get("co2_saved", 0)

        current_rank = 0
        try:
            users_ref = db.collection("users")
            rank_query = users_ref.where(filter=FieldFilter("userType", "==", user_type)).where(
                filter=FieldFilter("karma", ">", karma)
            )
            higher_karma_docs = list(rank_query.stream())
            current_rank = len(higher_karma_docs) + 1
        except Exception as rank_err:
            logger.error(f"Failed to calculate Firebase rank for {user_id}: {rank_err}")
            current_rank = 0

        response_stats = {
            "karma": karma,
            "currentRank": current_rank,
            "issuesReported": issues_reported,
            "issuesResolved": issues_resolved,
            "issuesFixed": issues_fixed,
            "co2Saved": round(co2_saved, 2),
            "badges": [],
            "source": "firebase",
        }
        return {"stats": response_stats}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error fetching Firebase user stats for {user_id}: {e}")
        raise HTTPException(500, f"Failed to fetch Firebase user stats: {str(e)}")
