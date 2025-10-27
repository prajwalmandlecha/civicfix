"""Core infrastructure module"""
from .database import (
    initialize_firebase,
    initialize_elasticsearch,
    close_elasticsearch,
    get_firestore_client,
    get_elasticsearch_client,
)
from .security import (
    verify_firebase_token_middleware,
    get_current_user,
    get_optional_user,
)

__all__ = [
    "initialize_firebase",
    "initialize_elasticsearch",
    "close_elasticsearch",
    "get_firestore_client",
    "get_elasticsearch_client",
    "verify_firebase_token_middleware",
    "get_current_user",
    "get_optional_user",
]

