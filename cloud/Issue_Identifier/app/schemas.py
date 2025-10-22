from pydantic import BaseModel, Field
from typing import Literal, List, Optional


class Location(BaseModel):
    latitude: float
    longitude: float
    timestamp: Optional[str] = None


class ReportIn(BaseModel):
    image_url: str
    description: str = ""
    location: Location
    timestamp: str
    user_selected_labels: List[str] = []
    reported_by: Optional[str] = "anonymous"
    uploader_display_name: Optional[str] = "anonymous"
    source: Optional[str] = "anonymous"  # citizen | anonymous


class DetectedIssue(BaseModel):
    type: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: Literal["low", "medium", "high"]
    severity_score: float = Field(..., ge=0.0, le=10.0)
    future_impact: str
    predicted_fix: str
    predicted_fix_confidence: float = Field(..., ge=0.0, le=1.0)
    auto_review_flag: bool = False
    reason_for_flag: Optional[str] = None


class AnalyzeOut(BaseModel):
    issue_id: Optional[str] = None
    detected_issues: Optional[List[DetectedIssue]] = []
    auto_review: bool = False
    no_issues_found: bool = False
    location: Optional[Location] = None
    timestamp: Optional[str] = None
