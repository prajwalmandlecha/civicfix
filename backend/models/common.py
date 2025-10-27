"""
Common models used across the application.
"""

from pydantic import BaseModel


class Location(BaseModel):
    """Geographic location coordinates"""
    latitude: float
    longitude: float

