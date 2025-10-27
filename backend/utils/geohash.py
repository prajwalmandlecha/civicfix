"""
Geohash utility functions for spatial operations.
"""


def get_geohash_precision(zoom: float) -> int:
    """
    Determine geohash precision based on map zoom level.
    
    Args:
        zoom: Map zoom level
        
    Returns:
        int: Geohash precision (1-12)
    """
    if zoom <= 5:
        return 3  # Continental view
    elif zoom <= 8:
        return 4  # Country/region view
    elif zoom <= 11:
        return 5  # City view
    elif zoom <= 14:
        return 6  # Neighborhood view
    else:
        return 6  # Street view - always show points at this level

