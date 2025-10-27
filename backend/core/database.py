"""
Database initialization and client management for Firebase, Firestore, and Elasticsearch.
"""

import logging
import asyncio
import os
from typing import Optional, Dict, Any
from firebase_admin import credentials, initialize_app, firestore
import firebase_admin
from elasticsearch import AsyncElasticsearch
from config.settings import settings, ES_URL_HTTP

logger = logging.getLogger(__name__)

# Global clients
default_app: Optional[firebase_admin.App] = None
db: Optional[firestore.Client] = None
es_client: Optional[AsyncElasticsearch] = None


def initialize_firebase() -> tuple:
    """
    Initialize Firebase Admin SDK and Firestore client.
    
    Returns:
        tuple: (firebase_app, firestore_client)
    """
    global default_app, db
    
    try:
        # Check if Firebase is already initialized
        try:
            default_app = firebase_admin.get_app()
            logger.info("✓ Firebase app already initialized, reusing existing instance")
        except ValueError:
            # Firebase not initialized yet, initialize it
            service_account_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), 
                settings.SERVICE_ACCOUNT_PATH
            )
            logger.info(f"Attempting to load Firebase credentials from: {service_account_path}")

            if not os.path.exists(service_account_path):
                raise FileNotFoundError(
                    f"serviceAccountKey.json not found at {service_account_path}"
                )

            cred = credentials.Certificate(service_account_path)
            default_app = initialize_app(cred)
            logger.info("✓ Firebase Admin initialized successfully")

        # Initialize Firestore DB client (synchronous)
        db = firestore.client()
        logger.info("✓ Firestore client initialized successfully")

    except Exception as fb_err:
        logger.error(f"✗ Failed to initialize Firebase Admin: {fb_err}", exc_info=True)
        default_app = None
        db = None

    return default_app, db


async def initialize_elasticsearch() -> Optional[AsyncElasticsearch]:
    """
    Initialize Elasticsearch async client with retry logic.
    
    Returns:
        AsyncElasticsearch: Elasticsearch client or None if failed
    """
    global es_client
    
    # Build connection kwargs
    es_connection_kwargs: Dict[str, Any] = {}
    if settings.ES_USER and settings.ES_PASS:
        es_connection_kwargs["basic_auth"] = (settings.ES_USER, settings.ES_PASS)
    if not settings.ES_VERIFY_CERTS:
        es_connection_kwargs["verify_certs"] = False
        es_connection_kwargs["ssl_context"] = None
    elif settings.ES_CA_CERT:
        es_connection_kwargs["ca_certs"] = settings.ES_CA_CERT

    logger.info(f"Connecting to ES at {settings.ES_URL}")

    # Try HTTPS first, then HTTP if it fails
    urls_to_try = [settings.ES_URL]
    if settings.ES_URL.startswith("https://"):
        urls_to_try.append(ES_URL_HTTP)

    for url in urls_to_try:
        logger.info(f"Trying ES connection to {url}")
        es_client = AsyncElasticsearch(
            hosts=[url],
            http_compress=True,
            request_timeout=45,
            **es_connection_kwargs,
        )

        for i in range(3):
            try:
                info = await es_client.info()
                cluster_name = info.body.get("cluster_name", "Unknown")
                logger.info(f"Successfully connected to ES cluster: {cluster_name} at {url}")
                return es_client
            except ConnectionError as ce:
                logger.warning(f"Attempt {i+1} ES connect fail (ConnErr) to {url}: {ce}")
            except TimeoutError:
                logger.warning(f"Attempt {i+1} ES connect fail (Timeout) to {url}.")
            except Exception as e:
                logger.error(f"Attempt {i+1} ES connect fail (Other) to {url}: {e}")
            if i < 2:
                await asyncio.sleep(2 * (i + 1))

        # Close the failed client before trying next URL
        await es_client.close()
        es_client = None

    logger.error("Failed ES connect after multiple attempts to all URLs.")
    return None


async def close_elasticsearch():
    """Close Elasticsearch client connection."""
    global es_client
    if es_client:
        await es_client.close()
        logger.info("ES connection closed.")
        es_client = None


def get_firestore_client() -> Optional[firestore.Client]:
    """Get Firestore client instance."""
    return db


def get_elasticsearch_client() -> Optional[AsyncElasticsearch]:
    """Get Elasticsearch client instance."""
    return es_client

