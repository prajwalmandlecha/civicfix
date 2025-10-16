import os
import uuid
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from google.cloud import storage

# Load .env
load_dotenv()

BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
if not BUCKET_NAME:
    raise RuntimeError("GCS_BUCKET_NAME must be set in .env")

# Create storage client (uses GOOGLE_APPLICATION_CREDENTIALS env variable)
storage_client = storage.Client()

app = FastAPI(title="GCS Image Uploader")


@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    # Optional: restrict to images
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    # Create unique object name
    ext = ""
    if "." in (file.filename or ""):
        ext = "." + file.filename.rsplit(".", 1)[1]
    object_name = f"uploads/{uuid.uuid4().hex}{ext}"
    
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    
    # Upload to GCS
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(object_name)
    blob.upload_from_string(data, content_type=file.content_type)
    
    # Public URL (works if bucket is public)
    public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{object_name}"
    
    return JSONResponse({"object_name": object_name, "public_url": public_url})

@app.post("/upload_video")
async def upload_video(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    # Optional: restrict to video files
    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(status_code=400, detail="Only video files are allowed")
    ext = ""
    if "." in (file.filename or ""):
        ext = "." + file.filename.rsplit(".", 1)[1]
    object_name = f"fix-videos/{uuid.uuid4().hex}{ext}"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(object_name)
    blob.upload_from_string(data, content_type=file.content_type)
    public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{object_name}"
    return JSONResponse({"object_name": object_name, "public_url": public_url})
