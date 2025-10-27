"""
Fix-related Pydantic models.
"""

from pydantic import BaseModel
from typing import List, Optional


class FixSubmission(BaseModel):
    """Fix submission input model"""
    issue_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    photo_urls: List[str] = []
    submitted_by: str
    source: str = "ngo"


class FixDetails(BaseModel):
    """Fix details output model"""
    issue_id: str
    has_fix: bool
    title: Optional[str] = None
    description: Optional[str] = None
    photo_urls: List[str] = []
    submitted_by: Optional[str] = None
    submitted_at: Optional[str] = None
    co2_saved: Optional[float] = None
    verification_status: Optional[str] = None

