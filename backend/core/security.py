"""
Authentication and authorization middleware and dependencies.
"""

import logging
from typing import Optional
from fastapi import Request, HTTPException
from firebase_admin import auth

logger = logging.getLogger(__name__)


async def verify_firebase_token_middleware(request: Request, call_next):
    """
    Middleware to verify Firebase authentication token for protected routes.
    
    Args:
        request: FastAPI request object
        call_next: Next middleware/route handler
        
    Returns:
        Response from next handler
        
    Raises:
        HTTPException: If authentication fails
    """
    from core.database import default_app, db
    
    # Public paths that don't require authentication
    public_paths = [
        "/",
        "/docs",
        "/openapi.json",
        "/api/issues",
        "/issues/",
        "/issues/latest",
        "/favicon.ico",
    ]
    
    if request.url.path in public_paths or request.method == "OPTIONS":
        response = await call_next(request)
        return response
    
    if not default_app or not db:
        logger.error(
            f"Firebase not initialized. Path: {request.url.path}, "
            f"default_app: {default_app is not None}, db: {db is not None}"
        )
        raise HTTPException(503, "Auth service unavailable - Firebase not initialized")
    
    auth_header = request.headers.get("Authorization")
    logger.debug(f"Authorization header received: {auth_header}")
    
    if not auth_header or not auth_header.startswith("Bearer "):
        logger.warning(f"Missing/invalid Auth header for: {request.url.path}")
        raise HTTPException(401, "Missing/invalid auth token")
    
    id_token = auth_header.split("Bearer ")[1]
    decoded_token = None
    
    try:
        decoded_token = auth.verify_id_token(id_token, check_revoked=True)
        request.state.user = decoded_token
        logger.info(f"Token OK for UID: {decoded_token.get('uid')}")
    except auth.RevokedIdTokenError:
        logger.warning(
            f"Token revoked for UID: {decoded_token.get('uid') if decoded_token else 'unknown'}"
        )
        raise HTTPException(status_code=401, detail="Token has been revoked.")
    except auth.UserDisabledError:
        logger.warning(
            f"User disabled for UID: {decoded_token.get('uid') if decoded_token else 'unknown'}"
        )
        raise HTTPException(status_code=403, detail="User account disabled.")
    except (ValueError, auth.InvalidIdTokenError) as e:
        logger.error(f"Invalid token: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token.")
    except Exception as e:
        logger.exception(f"An unexpected error occurred during token verification: {e}")
        raise HTTPException(
            status_code=500, detail="Could not verify authentication token."
        )
    
    response = await call_next(request)
    return response


async def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency to get current authenticated user from request state.
    
    Args:
        request: FastAPI request object
        
    Returns:
        dict: User data from decoded token
        
    Raises:
        HTTPException: If user not authenticated
    """
    if not hasattr(request.state, "user") or not request.state.user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return request.state.user


async def get_optional_user(request: Request) -> Optional[dict]:
    """
    FastAPI dependency to optionally get current authenticated user.
    Returns None if no user is authenticated (for public endpoints).
    
    Args:
        request: FastAPI request object
        
    Returns:
        Optional[dict]: User data or None
    """
    return getattr(request.state, "user", None)

