"""
Common FastAPI dependencies.
"""

from fastapi import Depends
from core.security import get_current_user, get_optional_user

# Export dependencies for easy import
__all__ = ["get_current_user", "get_optional_user"]

