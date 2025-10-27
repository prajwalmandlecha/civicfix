"""
Configuration settings for the CivicFix Backend API.
Centralized environment variable management using Pydantic Settings.
"""

import os
from typing import Optional
try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Firebase Service Account
    SERVICE_ACCOUNT_PATH: str = "serviceAccountKey.json"
    
    # Google Cloud Storage
    GCS_BUCKET_NAME: Optional[str] = None
    
    # External Services
    CLOUD_ANALYZER_URL: str = "http://localhost:8001"
    VERIFIER_URL: str = "http://localhost:8002"
    
    # Elasticsearch Configuration
    ES_URL: str = "http://localhost:9200"
    ES_USER: Optional[str] = None
    ES_PASS: Optional[str] = None
    ES_VERIFY_CERTS: bool = True
    ES_CA_CERT: Optional[str] = None
    
    # Application Settings
    SPAM_REPORT_THRESHOLD: int = 3
    REOPEN_REPORT_THRESHOLD: int = 3
    
    # CORS Settings
    CORS_ORIGINS: list = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "https://civicfix-web.web.app",
        "https://civicfix-web.firebaseapp.com",
    ]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Create settings instance
settings = Settings()

# Compute ES HTTP URL for fallback
ES_URL_HTTP = (
    settings.ES_URL.replace("https://", "http://")
    if settings.ES_URL.startswith("https://")
    else settings.ES_URL
)

