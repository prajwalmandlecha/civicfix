from pydantic import BaseModel, Field
from typing import Literal, List, Optional, Dict, Any


class Location(BaseModel):
    latitude: float
    longitude: float


class ReportIn(BaseModel):
    image_url: str
    description: str = ""
    location: Location
    timestamp: str
    user_selected_labels: List[str] = []
    reported_by: Optional[str] = None
    source: Optional[str] = "citizen"  # citizen | anonymous


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


class WeatherSummary(BaseModel):
    """
    Selected weather attributes relevant for civic issues.
    """
    precipitation_24h_mm: Optional[float] = None
    temperature_c_avg: Optional[float] = None
    windspeed_max_ms: Optional[float] = None
    relative_humidity_avg: Optional[float] = None
    snowfall_24h_mm: Optional[float] = None
    weather_note: Optional[str] = None


class GeminiResponse(BaseModel):
    auto_caption: Optional[str] = None
    detected_issues: Optional[List[DetectedIssue]] = []
    severity_score: Optional[float] = None
    fate_risk_co2: Optional[float] = None
    sources: Optional[List[str]] = []
    no_issues_found: Optional[bool] = False


class AnalyzeOut(BaseModel):
    issue_id: Optional[str] = None
    detected_issues: Optional[List[DetectedIssue]] = []
    auto_review: bool = False
    no_issues_found: bool = False
    location: Optional[Location] = None
    timestamp: Optional[str] = None
