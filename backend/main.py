import uuid
from fastapi import FastAPI, File, Request, HTTPException, UploadFile, status
from firebase_admin import auth, credentials, initialize_app
from dotenv import load_dotenv
import os
from google.cloud import storage


cred = credentials.Certificate("serviceAccountKey.json")
default_app = initialize_app(cred)

load_dotenv()

BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
if not BUCKET_NAME:
    raise RuntimeError("GCS_BUCKET_NAME must be set in .env")

app = FastAPI()

storage_client = storage.Client()

# @app.middleware("http")
# async def verify_firebase_token(request: Request):
#     auth_header = request.headers.get("Authorization")
#     if not auth_header or not auth_header.startswith("Bearer "):
#         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    
#     id_token = auth_header.split("Bearer ")[1]
#     try:
#         decoded_token = auth.verify_id_token(id_token)
#         print("Token verified successfully:", decoded_token)
#         return decoded_token
#     except Exception as e:
#         print(f"Error verifying token: {e}")
#         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.post("/upload-issue")
async def upload_issue(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    file.filename = f"temp/{uuid.uuid4()}"

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(file.filename)
    blob.upload_from_string(data, content_type=file.content_type)
    public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{file.filename}"


    return {"url": public_url, "message": "File uploaded successfully"}