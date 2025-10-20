from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class VerifyIn(BaseModel):
    issue_id: str
    ngo_id: str
    image_urls: List[str]
    fix_description: Optional[str] = ""
    timestamp: Optional[str] = None

class PerIssueResult(BaseModel):
    issue_type: str
    original_confidence: float = Field(..., ge=0.0, le=1.0)
    fixed: str  # "yes" | "partial" | "no"
    confidence: float = Field(..., ge=0.0, le=1.0)
    evidence_photos: List[int] = []
    notes: Optional[str] = None

class VerifyOut(BaseModel):
    fix_id: str
    issue_id: str
    per_issue_results: List[PerIssueResult]
    overall_outcome: str  # closed | partially_closed | rejected 
    suggested_success_rate: float = Field(..., ge=0.0, le=1.0)
    created_at: Optional[str] = None
