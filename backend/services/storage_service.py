"""
Google Cloud Storage service for file uploads.
"""

import logging
import uuid
from typing import Optional
from google.cloud import storage
from fastapi import UploadFile
from config.settings import settings

logger = logging.getLogger(__name__)


async def upload_file_to_gcs(file: UploadFile, folder: str = "issues") -> Optional[str]:
    """
    Upload a file to Google Cloud Storage.
    
    Args:
        file: FastAPI UploadFile object
        folder: Folder path in the bucket
        
    Returns:
        Optional[str]: Public URL of uploaded file, or None if failed
    """
    if not settings.GCS_BUCKET_NAME:
        logger.error("GCS_BUCKET_NAME not configured")
        return None

    try:
        # Initialize GCS client
        storage_client = storage.Client()
        
        # Get bucket (handle bucket/folder structure in name)
        bucket_parts = settings.GCS_BUCKET_NAME.split("/", 1)
        bucket_name = bucket_parts[0]
        base_folder = bucket_parts[1] if len(bucket_parts) > 1 else ""
        
        bucket = storage_client.bucket(bucket_name)
        
        # Generate unique filename
        file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        
        # Construct full path
        if base_folder:
            blob_name = f"{base_folder}/{folder}/{unique_filename}"
        else:
            blob_name = f"{folder}/{unique_filename}"
        
        blob = bucket.blob(blob_name)
        
        # Upload file
        contents = await file.read()
        blob.upload_from_string(contents, content_type=file.content_type or "image/jpeg")
        
        # Make blob publicly accessible
        blob.make_public()
        
        public_url = blob.public_url
        logger.info(f"File uploaded successfully to GCS: {public_url}")
        
        return public_url
        
    except Exception as e:
        logger.error(f"Error uploading file to GCS: {e}", exc_info=True)
        return None


async def upload_multiple_files_to_gcs(
    files: list[UploadFile], 
    folder: str = "fixes"
) -> list[str]:
    """
    Upload multiple files to Google Cloud Storage.
    
    Args:
        files: List of FastAPI UploadFile objects
        folder: Folder path in the bucket
        
    Returns:
        list[str]: List of public URLs of uploaded files
    """
    uploaded_urls = []
    
    for file in files:
        url = await upload_file_to_gcs(file, folder)
        if url:
            uploaded_urls.append(url)
        else:
            logger.warning(f"Failed to upload file: {file.filename}")
    
    return uploaded_urls

