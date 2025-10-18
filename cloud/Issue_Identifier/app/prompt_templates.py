from typing import List, Dict, Any


def _compact_evidence_snippets(evidence: List[Dict[str, Any]], kind: str) -> str:
    lines = []
    for e in evidence:
        eid = e.get("id") or e.get("fix_id") or e.get("issue_id") or "unknown"
        types = e.get("issue_types") or e.get("related_issue_types") or []
        score = e.get("severity_score") or e.get("co2_saved") or None
        short = e.get("short") or e.get("summary") or ""
        lines.append(f"- {kind}:{eid} | types:{types} | score:{score} | {short}")
    return "\n".join(lines)


def build_prompt(
    description: str,
    location: Dict[str, float],
    timestamp: str,
    user_selected_labels: List[str],
    issues_evidence: List[Dict] = None,
    fixes_evidence: List[Dict] = None,
    weather_summary: str = "",
    canonical_labels: List[str] = None,
):
    """
    Build strict JSON-return prompt for Gemini/Vertex.
    The prompt instructs the model to validate user labels, optionally add labels
    from the canonical set, drop labels < 0.6, and return only the requested JSON schema.
    """

    issues_snip = _compact_evidence_snippets(issues_evidence or [], "issue")
    fixes_snip = _compact_evidence_snippets(fixes_evidence or [], "fix")
    labels_text = ", ".join(canonical_labels) if canonical_labels else "Provided labels"

    prompt = (
        "You are an Issue Identifier assistant for city civic reports. You will be given:\n"
        "- an image (INSPECT VISUALLY - this is critical)\n"
        "- reporter description\n"
        "- reporter's selected labels (may be empty, single, or multiple)\n"
        "- location and timestamp\n"
        "- recent weather summary relevant to the location/time\n"
        "- short local evidence snippets (past similar issues/fixes)\n\n"
        "You MUST return EXACTLY one JSON object (no extra text) with the schema described below.\n\n"
        "SCHEMA (return exactly this JSON shape):\n"
        "{\n"
        "  \"auto_caption\": string|null,\n"
        "  \"detected_issues\": [\n"
        "    {\n"
        "      \"type\": string,\n"
        "      \"confidence\": float (0.0-1.0),\n"
        "      \"severity\": \"low\"|\"medium\"|\"high\",\n"
        "      \"severity_score\": float (0.0-10.0),\n"
        "      \"future_impact\": string (<=60 words),\n"
        "      \"predicted_fix\": string,\n"
        "      \"predicted_fix_confidence\": float (0.0-1.0),\n"
        "      \"auto_review_flag\": boolean,\n"
        "      \"reason_for_flag\": string|null\n"
        "    }\n"
        "  ],\n"
        "  \"severity_score\": float|null,\n"
        "  \"fate_risk_co2\": float|null,\n"
        "  \"sources\": [string],\n"
        "  \"no_issues_found\": boolean\n"
        "}\n\n"
        "INSTRUCTIONS:\n"
        "1) VISUALLY INSPECT THE IMAGE and identify ALL civic infrastructure issues present.\n"
        "2) Cross-verify user-selected labels with what you see in the image:\n"
        "   - If user selected a label and it's visible in the image, include it with appropriate confidence.\n"
        "   - If user selected a label but it's NOT visible in the image, EXCLUDE it (do not include false positives).\n"
        "3) Detect and add ANY additional issues visible in the image that the user did not mention.\n"
        f"4) You MUST use ONLY labels from this canonical list: {labels_text}\n"
        "5) Assign confidence (0.0-1.0) for each detected issue:\n"
        "   - >= 0.85: High confidence, no review needed\n"
        "   - 0.6-0.85: Medium confidence, set auto_review_flag=true\n"
        "   - < 0.6: Low confidence, EXCLUDE from results\n"
        "6) DO NOT return any label with confidence < 0.6. Server will also filter.\n"
        "7) Ensure returned labels are UNIQUE (no duplicates) and in lower-case with underscores.\n"
        "8) Use the weather summary when reasoning about severity (e.g., heavy rain increases risk for potholes/waterlogging).\n"
        "9) If NO issues with confidence >= 0.6 are detected, set \"no_issues_found\": true and return empty detected_issues array.\n"
        "10) Keep future_impact concise (<=60 words). Do not include extraneous commentary.\n\n"
        "INPUT DATA:\n\n"
        f"Description: {description or 'No description provided'}\n"
        f"User-selected labels: {user_selected_labels if user_selected_labels else 'None - please detect all issues from image'}\n"
        f"Location (lat,lon): {location.get('latitude')},{location.get('longitude')}\n"
        f"Timestamp: {timestamp}\n"
        f"Weather: {weather_summary}\n\n"
        "Local recent issues:\n"
        f"{issues_snip or '- none'}\n\n"
        "Local recent fixes:\n"
        f"{fixes_snip or '- none'}\n\n"
        "Return ONLY the JSON object as specified above."
    )
    return prompt