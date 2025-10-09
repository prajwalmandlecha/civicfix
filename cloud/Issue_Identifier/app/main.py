import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import ValidationError

from app.schemas import ReportIn, AnalyzeOut, Issue
from app.prompt_templates import build_prompt
from app.utils import fetch_image_bytes

# Gemini SDK
from google import genai
from google.genai import types

load_dotenv()

logger = logging.getLogger("uvicorn.error")

# Gemini API key & model
API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

client = genai.Client(api_key=API_KEY)

app = FastAPI(title="Civic Issue Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/analyze/", response_model=AnalyzeOut)
def analyze(report: ReportIn):
    try:
        image_bytes, mime_type = fetch_image_bytes(report.image_url)
    except Exception as e:
        logger.exception("Image fetch failed")
        raise HTTPException(status_code=400, detail=f"Could not fetch image: {e}")

    prompt = build_prompt(report.description, report.location.dict(), report.timestamp)

    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    try:
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=list[Issue],
        )

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[image_part, prompt],
            config=config,
        )

        parsed = response.parsed

        issues_parsed = []
        for item in parsed:
            if isinstance(item, dict):
                issue_obj = Issue(**item)
            else:
                issue_obj = Issue.parse_obj(item)
            issues_parsed.append(issue_obj)

        out = AnalyzeOut(
            issues=issues_parsed,
            location=report.location,
            timestamp=report.timestamp
        )
        return out

    except ValidationError as ve:
        logger.exception("Schema validation error")
        raise HTTPException(status_code=500, detail=f"Model returned invalid schema: {ve}")
    except Exception as e:
        logger.exception("Gemini API call failed")
        raise HTTPException(status_code=500, detail=f"Model call failed: {e}")
