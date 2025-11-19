"""
Service for interacting with external AI analysis services (Issue Identifier and Verifier).
"""

import logging
import requests
from typing import Dict, Any, Optional, List
from config.settings import settings

logger = logging.getLogger(__name__)


def analyze_issue(
    photo_url: str,
    location_dict: Dict[str, float],
    timestamp: str,
    description: str = "",
    user_selected_labels: List[str] = None,
    reported_by: str = "anonymous",
    source: str = "citizen",
    uploader_display_name: str = "Anonymous"
) -> Optional[Dict[str, Any]]:
    """
    Send issue to AI analyzer service for detection and classification.
    
    Args:
        photo_url: URL of the issue photo
        location_dict: Location dictionary with lat/lon
        timestamp: ISO timestamp string
        description: User-provided description
        user_selected_labels: User-selected issue types
        reported_by: User ID of the reporter
        source: Source type (citizen, anonymous, etc.)
        uploader_display_name: Display name of the uploader
        
    Returns:
        Optional[Dict]: Analysis response from AI service
    """
    if user_selected_labels is None:
        user_selected_labels = []
    
    payload = {
        "image_url": photo_url,
        "location": location_dict,
        "timestamp": timestamp,
        "description": description,
        "user_selected_labels": user_selected_labels,
        "reported_by": reported_by,
        "source": source,
        "uploader_display_name": uploader_display_name,
    }

    try:
        logger.info(f"Sending issue to analyzer at {settings.CLOUD_ANALYZER_URL}")
        response = requests.post(
            f"{settings.CLOUD_ANALYZER_URL}/analyze/",
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
        
        analysis_result = response.json()
        logger.info(f"Received analysis response: {analysis_result}")
        
        return analysis_result
        
    except requests.exceptions.Timeout:
        logger.error("Analyzer service timeout")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling analyzer service: {e}")
        return None
    except Exception as e:
        logger.exception(f"Unexpected error in analyze_issue: {e}")
        return None


def verify_fix(
    issue_id: str,
    after_image_urls: List[str],
    fix_description: str,
    ngo_id: str
) -> Optional[Dict[str, Any]]:
    """
    Send fix to AI verifier service for validation.
    
    Args:
        issue_id: ID of the issue being fixed
        after_image_urls: List of URLs of fix photos
        fix_description: Description of the fix
        ngo_id: ID of the NGO submitting the fix
        
    Returns:
        Optional[Dict]: Verification response from AI service
    """
    from datetime import datetime
    
    payload = {
        "issue_id": issue_id,
        "image_urls": after_image_urls,
        "fix_description": fix_description,
        "ngo_id": ngo_id,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

    try:
        logger.info(f"Sending fix verification to {settings.VERIFIER_URL}")
        response = requests.post(
            f"{settings.VERIFIER_URL}/verify_fix/",
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
        
        verification_result = response.json()
        logger.info(f"Received verification response: {verification_result}")
        
        return verification_result
        
    except requests.exceptions.Timeout:
        logger.error("Verifier service timeout")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling verifier service: {e}")
        return None
    except Exception as e:
        logger.exception(f"Unexpected error in verify_fix: {e}")
        return None

