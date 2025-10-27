"""
User-related Pydantic models.
"""

from pydantic import BaseModel
from typing import Optional


class UserStats(BaseModel):
    """User statistics model"""
    user_id: str
    total_reports: int = 0
    total_upvotes: int = 0
    total_fixes: int = 0
    total_co2_saved: float = 0.0
    rank: Optional[int] = None


class LeaderboardEntry(BaseModel):
    """Leaderboard entry model"""
    user_id: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    score: int = 0
    total_reports: int = 0
    total_fixes: int = 0
    total_co2_saved: float = 0.0
    rank: int

