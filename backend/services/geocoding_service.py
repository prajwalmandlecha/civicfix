"""
Geocoding service for location-related operations.
"""

import logging
from typing import Optional, Dict
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

logger = logging.getLogger(__name__)

# Global geocoding cache
geocode_cache: Dict[str, str] = {}


def geocode_location(location_text: str) -> Optional[Dict]:
    """
    Geocode a location string to coordinates using Nominatim.
    
    Args:
        location_text: Address or location string to geocode
        
    Returns:
        Optional[Dict]: Dictionary with latitude and longitude, or None if failed
    """
    if not location_text or not location_text.strip():
        logger.warning("Empty location text provided")
        return None

    # Check cache
    if location_text in geocode_cache:
        cached_result = geocode_cache[location_text]
        logger.info(f"Using cached geocode for: {location_text}")
        return cached_result

    geolocator = Nominatim(user_agent="civicfix_backend")

    try:
        location = geolocator.geocode(location_text, timeout=10)
        if location:
            result = {
                "latitude": location.latitude,
                "longitude": location.longitude
            }
            # Cache the result
            geocode_cache[location_text] = result
            logger.info(f"Successfully geocoded: {location_text} -> {result}")
            return result
        else:
            logger.warning(f"No geocoding result found for: {location_text}")
            return None

    except GeocoderTimedOut:
        logger.error(f"Geocoding timed out for: {location_text}")
        return None

    except GeocoderServiceError as e:
        logger.error(f"Geocoder service error for '{location_text}': {e}")
        return None

    except Exception as e:
        logger.exception(f"Unexpected error during geocoding for '{location_text}': {e}")
        return None

