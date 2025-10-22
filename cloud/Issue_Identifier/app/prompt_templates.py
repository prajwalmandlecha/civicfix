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
    Weather data is included as context to help assess severity and impact.
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
        "- last 24h weather summary (for context on severity assessment)\n"
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
        "1) VISUALLY INSPECT THE IMAGE and identify civic infrastructure issues present.\n"
        "2) **CRITICAL: Return MAXIMUM 5 most significant issue types only.** Prioritize by:\n"
        "   - Safety hazards (electrical, structural, drainage)\n"
        "   - Health risks (waste, sewage)\n"
        "   - Accessibility problems (potholes, broken infrastructure)\n"
        "   - Environmental issues (pollution, dumping)\n"
        "3) Cross-verify user-selected labels with what you see in the image:\n"
        "   - If user selected a label and it's visible in the image, include it with appropriate confidence.\n"
        "   - If user selected a label but it's NOT visible in the image, EXCLUDE it (do not include false positives).\n"
        "4) Detect and add ANY additional issues visible in the image that the user did not mention.\n"
        f"5) You MUST use ONLY labels from this canonical list: {labels_text}\n"
        "6) Assign confidence (0.0-1.0) for each detected issue:\n"
        "   - >= 0.85: High confidence, no review needed\n"
        "   - 0.6-0.85: Medium confidence, set auto_review_flag=true\n"
        "   - < 0.6: Low confidence, EXCLUDE from results\n"
        "7) DO NOT return any label with confidence < 0.6. Server will also filter.\n"
        "8) Ensure returned labels are UNIQUE (no duplicates) and in lower-case with underscores.\n\n"
        "9) **SEVERITY ASSESSMENT RULES** (use these base guidelines, then adjust for weather):\n"
        "   \n"
        "   HIGH severity (8.0-10.0): Immediate safety/health hazards\n"
        "   - electrical_hazard, gas_leak, structural_damage_building, structural_damage_bridge\n"
        "   - sewage_overflow, fallen_tree (blocking road), landslide\n"
        "   - drainage_flooding (active), sinkhole\n"
        "   \n"
        "   MEDIUM severity (4.0-7.9): Significant but not immediate danger\n"
        "   - pothole_small, pothole_large, broken_pavement, damaged_road_markings\n"
        "   - drain_blockage, waste_bulky_dump, illegal_construction\n"
        "   - encroachment_footpath, fallen_tree (not blocking), damaged_signage\n"
        "   - broken_bench_furniture, water_main_leak\n"
        "   \n"
        "   LOW severity (0.0-3.9): Minor issues, aesthetic concerns\n"
        "   - waste_litter_small, graffiti_vandalism, faded_road_markings\n"
        "   - overgrown_vegetation, damaged_dustbin\n"
        "   \n"
        "10) Use weather summary to ADJUST severity within the category:\n"
        "    - Heavy rain (>20mm) + drainage/pothole issues: upgrade severity by 1.5-2.0 points\n"
        "    - High winds (>15m/s) + tree/structural issues: upgrade severity by 1.5-2.0 points\n"
        "    - Extreme temps + asphalt/concrete issues: upgrade severity by 0.5-1.0 points\n"
        "11) Assign severity_score (0.0-10.0) based on:\n"
        "    - Base category (from step 9)\n"
        "    - Weather adjustments (from step 10)\n"
        "    - Visible extent/scale in image\n"
        "    - Multiple related issues in same location\n"
        "12) If NO issues with confidence >= 0.6 are detected, set \"no_issues_found\": true and return empty detected_issues array.\n"
        "13) Keep future_impact concise (<=60 words). Do not include extraneous commentary.\n\n"
        "INPUT DATA:\n\n"
        f"Description: {description or 'No description provided'}\n"
        f"User-selected labels: {user_selected_labels if user_selected_labels else 'None - please detect all issues from image'}\n"
        f"Location (lat,lon): {location.get('latitude')},{location.get('longitude')}\n"
        f"Timestamp: {timestamp}\n"
        f"Weather (last 24h): {weather_summary}\n\n"
        "Local recent issues:\n"
        f"{issues_snip or '- none'}\n\n"
        "Local recent fixes:\n"
        f"{fixes_snip or '- none'}\n\n"
        "Return ONLY the JSON object as specified above."
    )
    return prompt