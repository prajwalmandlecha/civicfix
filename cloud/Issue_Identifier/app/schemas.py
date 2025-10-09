from pydantic import BaseModel, Field
from typing import Literal

class Location(BaseModel):
    latitude: float
    longitude: float

class ReportIn(BaseModel):
    image_url: str
    description: str = ""
    location: Location
    timestamp: str

class Issue(BaseModel):
    type: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: Literal["low", "medium", "high"]
    predicted_impact: str

class AnalyzeOut(BaseModel):
    issues: list[Issue]
    location: Location
    timestamp: str
