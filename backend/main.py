import json
from typing import List, Tuple
import uuid
import logging 
import requests
from fastapi import FastAPI, File, Form, Request, HTTPException, UploadFile, status
from google.genai import types
from firebase_admin import auth, credentials, initialize_app
from dotenv import load_dotenv
import os
from google.cloud import storage
from google import genai
from pydantic import ValidationError
from fastapi.middleware.cors import CORSMiddleware

from schema import AnalyzeOut, Issue, Location, ReportIn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

cred = credentials.Certificate("serviceAccountKey.json")
default_app = initialize_app(cred)

load_dotenv()

BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")
if not BUCKET_NAME:
    raise RuntimeError("GCS_BUCKET_NAME must be set in .env")
API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
CLOUD_ANALYZER_URL = os.getenv("CLOUD_ANALYZER_URL", "http://localhost:8001")  # URL of your cloud service
# CLOUD_ANALYZER_URL = "http://localhost:8001"

client = genai.Client(api_key=API_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

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

@app.post("/submit-issue")
async def submit_issue(file: UploadFile = File(...), locationstr: str = Form(...), description: str = Form(...) ):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    try:
        location_data = json.loads(locationstr)
        location = Location(**location_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid location format")



    file.filename = f"issues/{uuid.uuid4()}"

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(file.filename)
    blob.upload_from_string(data, content_type=file.content_type)
    public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{file.filename}"

    try:
        logger.info(f"Sending request to cloud analyzer: {CLOUD_ANALYZER_URL}/analyze/")
        analyzer_response = requests.post(
            f"{CLOUD_ANALYZER_URL}/analyze/",
            json={
                "image_url": public_url,
                "description": description,
                "location": location.model_dump(),
                "timestamp": str(location.timestamp)
            },
            timeout=30
        )
        analyzer_response.raise_for_status()
        analysis_result = analyzer_response.json()
        logger.info(f"Cloud analyzer response: {analysis_result}")
        
        issues = analysis_result.get("issues", [])
        
    except requests.exceptions.RequestException as e:
        logger.exception("Failed to call cloud analyzer")
        raise HTTPException(status_code=500, detail=f"Analysis service error: {str(e)}")

    return {
        "image_url": public_url,
        "issues": issues,
        "location": location,
    }

# async def analyze_image(
#     image_bytes: bytes,
#     mime_type: str,
#     description: str,
#     location: dict,
#     timestamp: str
# )-> List[Issue]:
#     logger.info(f"Starting image analysis - mime_type: {mime_type}, description: {description[:50]}...")
#     prompt = build_prompt(description, location, timestamp)
#     image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

#     config = types.GenerateContentConfig(
#         response_mime_type="application/json",  
#         response_schema=list[Issue],
#     )

#     try:
#         logger.info("Calling Gemini API...")
#         response = client.models.generate_content(
#             model=GEMINI_MODEL,
#             contents=[image_part, prompt],
#             config=config,
#         )
        
#         logger.info(f"Gemini raw response: {response}")
#         logger.info(f"Gemini response text: {response.text if hasattr(response, 'text') else 'N/A'}")
        
#         parsed = response.parsed
#         logger.info(f"Parsed response type: {type(parsed)}, length: {len(parsed) if hasattr(parsed, '__len__') else 'N/A'}")
        
#         # response.parsed already returns Issue objects, no need to parse again
#         if not parsed:
#             logger.warning("No issues detected in image")
#             return []
        
#         # Convert to list if it's not already
#         issues_parsed = list(parsed) if not isinstance(parsed, list) else parsed
#         logger.info(f"Returning {len(issues_parsed)} issues: {[issue.type for issue in issues_parsed]}")
        
#         return issues_parsed
#     except ValidationError as ve:
#         logger.exception("Schema validation error")
#         raise HTTPException(
#             status_code=500, 
#             detail=f"Model returned invalid schema: {ve}"
#         )
#     except Exception as e:
#         logger.exception("Gemini analysis failed")
#         raise HTTPException(
#             status_code=500, 
#             detail=f"Analysis failed: {e}"
#         )



# @app.post("/analyze", response_model=AnalyzeOut)
# async def analyze(report: ReportIn):
#     try:
#         image_bytes, mime_type = fetch_image_bytes(report.image_url)
#     except Exception as e:
#         logger.exception("Image fetch failed")
#         raise HTTPException(status_code=400, detail=f"Could not fetch image: {e}")
#     prompt = build_prompt(report.description, report.location.dict(), report.timestamp)
#     image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

#     try:
#             config = types.GenerateContentConfig(
#                 response_mime_type="application/json",
#                 response_schema=list[Issue],
#             )

#             response = client.models.generate_content(
#                 model=GEMINI_MODEL,
#                 contents=[image_part, prompt],
#                 config=config,
#             )

#             parsed = response.parsed

#             issues_parsed = []
#             for item in parsed:
#                 if isinstance(item, dict):
#                     issue_obj = Issue(**item)
#                 else:
#                     issue_obj = Issue.parse_obj(item)
#                 issues_parsed.append(issue_obj)

#             out = AnalyzeOut(
#                 issues=issues_parsed,
#                 location=report.location,
#                 timestamp=report.timestamp
#             )
#             return out
#     except ValidationError as ve:
#         logger.exception("Schema validation error")
#         raise HTTPException(status_code=500, detail=f"Model returned invalid schema: {ve}")
#     except Exception as e:
#         logger.exception("Image fetch failed")
#         raise HTTPException(status_code=400, detail=f"Could not fetch image: {e}")
    

# def fetch_image_bytes(url: str, timeout: int = 10) -> Tuple[bytes, str]:
#     """
#     Fetch image from URL. Returns bytes and MIME type.
#     Raises requests.HTTPError on failure.
#     """
#     resp = requests.get(url, timeout=timeout)
#     resp.raise_for_status()
#     content_type = resp.headers.get("Content-Type", "image/jpeg")
#     mime = content_type.split(";")[0].strip()
#     return resp.content, mime

# def build_prompt(description: str, location: dict, timestamp: str):
#     """
#     Builds the prompt for Gemini.
#     Guides the model to return JSON array of issues.
#     """
#     prompt = (
#         "You are an assistant that inspects images of urban public infrastructure. "
#         "Return a JSON array of objects. Each object must contain:\n"
#         " - type : short issue name (e.g., pothole, garbage_overflow, streetlight_out, waterlogging, road_crack, "
#         "fallen_tree, manhole_missing, illegal_parking, graffiti, obstruction)\n"
#         " - confidence : float between 0.0 and 1.0\n"
#         " - severity : one of ['low','medium','high']\n"
#         " - predicted_impact : single sentence string describing likely future impact\n\n"
#         "Rules:\n"
#         " - The image may contain multiple issues — return all detected.\n"
#         " - predicted_impact must be ONE string (not array), concise <= 30 words.\n"
#         " - Return ONLY JSON, no extra text.\n\n"
#         f"Context:\nDescription: {description}\n"
#         f"Location: {location.get('latitude')},{location.get('longitude')}\n"
#         f"Timestamp: {timestamp}\n"
#     )
#     return prompt




    

# @app.post("/upload-issue")
# async def upload_issue(file: UploadFile = File(...)):
#     if not file:
#         raise HTTPException(status_code=400, detail="No file uploaded")
    
#     if not (file.content_type or "").startswith("image/"):
#         raise HTTPException(status_code=400, detail="Only image files are allowed")

#     file.filename = f"uploads/{uuid.uuid4()}"

#     data = await file.read()
#     if not data:
#         raise HTTPException(status_code=400, detail="File is empty")
    
#     bucket = storage_client.bucket(BUCKET_NAME)
#     blob = bucket.blob(file.filename)
#     blob.upload_from_string(data, content_type=file.content_type)
#     public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{file.filename}"


#     return {"url": public_url, "message": "File uploaded successfully"}

# @app.get("/test-gemini")
# async def test_gemini():
#     """Simple endpoint to verify Gemini API connectivity by sending 'Hi'."""
#     try:
#         # Send a simple prompt to Gemini using the correct 'contents' parameter
#         result = client.models.generate_content(
#             model=GEMINI_MODEL,
#             contents=["Hi"]  # ✅ Corrected from 'prompt' to 'contents'
#         )
        
#         # ✅ Simpler and more reliable way to get the response text
#         response_text = result.text
        
#         return {"success": True, "response": response_text}
#     except Exception as e:
#         # It's helpful to log the exception for debugging
#         logger.exception("Gemini API test failed") 
#         raise HTTPException(status_code=500, detail=f"Error communicating with Gemini API: {e}")    