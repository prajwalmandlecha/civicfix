"""
User service for managing user statistics and leaderboard data.
"""

import logging
from typing import Dict, List, Optional
from services.firestore_service import get_firestore_service

logger = logging.getLogger(__name__)


async def award_first_post_karma(user_id: str, user_display_name: str, user_email: str):
    """
    Award karma for first post and update user stats.
    Uses centralized Firestore service for consistency.
    
    Args:
        user_id: Firebase user ID
        user_display_name: User's display name
        user_email: User's email
    """
    fs = get_firestore_service()
    success = await fs.award_first_post_karma(user_id, user_display_name, user_email)
    
    if not success:
        logger.error(f"Failed to award first post karma to {user_id}")


async def get_user_display_name(user_id: str) -> str:
    """
    Get user display name from Firestore.
    
    Args:
        user_id: Firebase user ID
        
    Returns:
        str: User's display name or default
    """
    fs = get_firestore_service()
    user_data = await fs.get_user(user_id)
    
    if user_data:
        return user_data.get("name", "Citizen")
    
    return "Citizen"


async def increment_fix_count(user_id: str, co2_saved: float = 0.0):
    """
    Increment user's fix count and CO2 saved.
    Uses centralized Firestore service for consistency.
    
    Args:
        user_id: Firebase user ID
        co2_saved: Amount of CO2 saved (kg)
    """
    fs = get_firestore_service()
    success = await fs.increment_user_stats(
        user_id,
        issues_resolved=1,
        co2_saved=co2_saved
    )
    
    if not success:
        logger.error(f"Failed to increment fix count for {user_id}")

