import json
from typing import List, Dict, Any

def build_prompt(issue_json: Dict[str, Any],
                 fix_description: str,
                 similar_fixes: List[Dict[str, Any]],
                 image_count: int) -> str:
    """
    Builds a strict JSON-output prompt for Gemini. The images are attached
    as parts in the same request and will correspond to indices 0..image_count-1.
    """
    issue_summary = {
        "issue_id": issue_json.get("issue_id"),
        "issue_types": issue_json.get("issue_types", []),
        "auto_caption": issue_json.get("auto_caption"),
        "severity_score": issue_json.get("severity_score"),
        "reported_at": issue_json.get("reported_at"),
        "created_at": issue_json.get("created_at"),
        "location": issue_json.get("location")
    }

    similar_short = []
    for s in (similar_fixes or []):
        # short summary for prompt
        short = {}
        for k in ("fix_id", "summary", "related_issue_types", "city"):
            if k in s:
                short[k] = s[k]
        similar_short.append(short)

    prompt = (
        "You are an inspector. You will be given an original issue and a set of images "
        "that show the claimed fix. Images are attached in the request and correspond "
        f"to integer indices [0..{max(0, image_count-1)}].\n\n"
        "Original issue (JSON):\n" + json.dumps(issue_summary) + "\n\n"
        "Fix description (text):\n" + (fix_description or "") + "\n\n"
        "Context - similar fixes (short):\n" + json.dumps(similar_short[:3]) + "\n\n"
        "Task: For each canonical issue_type in the original issue return exactly one object "
        "with these fields:\n"
        "- issue_type (string)  \n"
        "- original_confidence (float 0.0-1.0)  \n"
        "- fixed: one of [\"yes\",\"partial\",\"no\"]  \n"
        "- confidence: float 0.0-1.0 (how confident you are that the images show the issue is fixed)  \n"
        "- evidence_photos: list of image indices (0-based) from the attached images  \n"
        "- notes: short (<= 40 words) supporting reason/evidence\n\n"
        "Return ONLY a JSON object that matches this schema exactly:\n\n"
        "{\n"
        "  \"fix_summary\": \"<short one-line summary>\",\n"
        "  \"per_issue_results\": [ { \"issue_type\": ..., \"original_confidence\": 0.0, "
        "\"fixed\": \"yes|partial|no\", \"confidence\": 0.0, \"evidence_photos\": [0,1], \"notes\": \"...\" } ],\n"
        "  \"overall_outcome\": \"closed|partially_closed|rejected|needs_manual_review\",\n"
        "  \"suggested_success_rate\": 0.0\n"
        "}\n\n"
        "Important: be concise. Use image indices to reference evidence. Temperature 0 should be used."
    )

    return prompt
