"""
CivicFix API Gateway - Refactored Main Application

This is the refactored entry point demonstrating the modular structure.
The original main.py has been reorganized into:
- config/settings.py: Configuration management
- core/: Database clients and security
- models/: Pydantic models
- services/: Business logic
- routers/: API route handlers
- utils/: Utility functions

To use this refactored version:
1. Complete migration of all endpoints to routers/
2. Test thoroughly
3. Rename main.py to main_old.py
4. Rename this file to main.py
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Configuration
from config.settings import settings

# Core infrastructure
from core.database import (
    initialize_firebase,
    initialize_elasticsearch,
    close_elasticsearch,
)
from core.security import verify_firebase_token_middleware

# Routers (to be created)
# from routers import issues, fixes, users, leaderboard, map_routes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for startup and shutdown events.
    """
    # Startup
    logger.info("Starting CivicFix API Gateway...")
    
    # Initialize Firebase and Firestore
    default_app, db = initialize_firebase()
    app.state.firebase_app = default_app
    app.state.firestore_db = db
    
    # Initialize Elasticsearch
    es_client = await initialize_elasticsearch()
    app.state.es_client = es_client
    
    if not default_app or not db:
        logger.error("Firebase/Firestore initialization failed!")
    if not es_client:
        logger.error("Elasticsearch initialization failed!")
    
    logger.info("✓ Application startup complete")
    
    yield
    
    # Shutdown
    logger.info("Shutting down CivicFix API Gateway...")
    await close_elasticsearch()
    logger.info("✓ Application shutdown complete")


# Initialize FastAPI app
app = FastAPI(
    title="CivicFix API Gateway",
    description="Modular API for civic issue reporting and management",
    version="2.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add authentication middleware
app.middleware("http")(verify_firebase_token_middleware)

# Include routers
# app.include_router(issues.router, prefix="/api", tags=["Issues"])
# app.include_router(fixes.router, prefix="/api", tags=["Fixes"])
# app.include_router(users.router, prefix="/api", tags=["Users"])
# app.include_router(leaderboard.router, prefix="/api", tags=["Leaderboard"])
# app.include_router(map_routes.router, prefix="/api", tags=["Map"])


@app.get("/")
async def root():
    """Health check endpoint"""
    from core.database import get_elasticsearch_client, get_firestore_client
    
    es_client = get_elasticsearch_client()
    db = get_firestore_client()
    
    if not es_client:
        from fastapi import HTTPException
        raise HTTPException(503, "Database unavailable")
    
    try:
        if not await es_client.ping():
            from fastapi import HTTPException
            raise HTTPException(503, "Database no response")
    except Exception as e:
        logger.error(f"ES ping fail: {e}")
        from fastapi import HTTPException
        raise HTTPException(503, "Database connection error")

    firebase_status = "connected" if (app.state.firebase_app and db) else "disconnected"

    return {
        "message": "CivicFix API Gateway - Running (Refactored)",
        "version": "2.0.0",
        "db_status": "connected",
        "firebase_status": firebase_status,
        "firebase_app": app.state.firebase_app is not None,
        "firestore_client": db is not None,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

