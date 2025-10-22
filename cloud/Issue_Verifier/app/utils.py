import requests
import os
import io
import uuid
from datetime import datetime, timezone
from typing import Tuple, List, Dict, Any

def fetch_image_bytes(url: str, timeout: int = 10) -> Tuple[bytes, str]:
    """
    Fetch image from public URL. Returns bytes and MIME type.
    """
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    content_type = resp.headers.get("Content-Type", "image/jpeg")
    mime = content_type.split(";")[0].strip()
    return resp.content, mime

def make_fix_id(issue_id: str, ngo_id: str) -> str:
    return str(uuid.uuid4())

def safe_parse_json(raw: str):
    import json
    return json.loads(raw)
