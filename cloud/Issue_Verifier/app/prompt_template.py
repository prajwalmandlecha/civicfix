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
        short = {
            "fix_id": s.get("fix_id"),
            "title": s.get("title"),
            "description": s.get("description"),
            "related_issue_types": s.get("related_issue_types", []),
            "success_rate": s.get("success_rate")
        }
        similar_short.append(short)

    prompt = (
        "You are a fix verification inspector. You will be given:\n"
        "- Original issue report with detected issue types and severity scores\n"
        "- Fix description from the NGO/fixer\n"
        "- Evidence images showing the claimed fix\n"
        "- Context of similar fixes in the area\n\n"
        f"Images are attached in the request and correspond to integer indices [0..{max(0, image_count-1)}].\n\n"
        "Original issue (JSON):\n" + json.dumps(issue_summary) + "\n\n"
        "Fix description (text):\n" + (fix_description or "No description provided") + "\n\n"
        "Context - similar fixes:\n" + json.dumps(similar_short[:3]) + "\n\n"
        "VERIFICATION RULES:\n"
        "1. **Verify ALL issues** that were originally detected (from issue_types list)\n"
        "2. Since Issue Identifier returns maximum 3 main issues, analyze each one thoroughly\n"
        "3. For each detected issue type, determine fix status:\n"
        "   - \"yes\": Issue is COMPLETELY or SUBSTANTIALLY resolved (including partial fixes that show clear improvement)\n"
        "   - \"no\": Issue is NOT resolved at all (no visible improvement or work done)\n"
        "4. Be LENIENT with \"yes\" - if you see ANY reasonable attempt to fix the issue, mark it as \"yes\"\n"
        "5. Reserve \"no\" ONLY for cases where:\n"
        "   - No fix work is visible in the images\n"
        "   - The issue clearly remains unaddressed\n"
        "   - Evidence shows the problem still exists\n\n"
        "6. overall_outcome decision:\n"
        "   - \"closed\" if ALL detected issues have fixed=\"yes\" (completely or substantially fixed)\n"
        "   - \"rejected\" if ANY issue has fixed=\"no\" (strictly not fixed at all)\n\n"
        "Task: For each issue_type in the original issue, return exactly one object with these fields:\n"
        "- issue_type (string): The issue type from the original report\n"
        "- original_confidence (float 0.0-1.0): Confidence from original detection\n"
        "- fixed: \"yes\" (resolved/substantially improved) or \"no\" (not fixed at all)\n"
        "- confidence: float 0.0-1.0 (your confidence in this assessment)\n"
        "- evidence_photos: list of image indices (0-based) that show the fix work\n"
        "- notes: short explanation (<= 40 words) with specific evidence\n\n"
        "Return ONLY a JSON object that matches this schema exactly:\n\n"
        "{\n"
        "  \"fix_summary\": \"<short one-line summary of what was fixed/partially fixed and what was not fixed>\",\n"
        "  \"per_issue_results\": [\n"
        "    {\n"
        "      \"issue_type\": \"...\",\n"
        "      \"original_confidence\": 0.0,\n"
        "      \"fixed\": \"yes\" | \"no\",\n"
        "      \"confidence\": 0.0,\n"
        "      \"evidence_photos\": [0, 1,..],\n"
        "      \"notes\": \"...\"\n"
        "    }\n"
        "  ],\n"
        "  \"overall_outcome\": \"closed\" | \"rejected\",\n"
        "  \"suggested_success_rate\": 0.0\n"
        "}\n\n"
        "DECISION LOGIC FOR overall_outcome:\n"
        "- Check ALL detected issues (regardless of severity level)\n"
        "- If ALL issues have fixed=\"yes\" → overall_outcome=\"closed\"\n"
        "- If ANY issue has fixed=\"no\" → overall_outcome=\"rejected\"\n"
        "- Be generous: partial fixes, ongoing work, or substantial improvement = \"yes\"\n"
        "- Be strict with \"no\": only when absolutely no fix work is visible\n\n"
        "EXAMPLES:\n"
        "  Mark as \"yes\" (fixed):\n"
        "- Pothole 80% filled (not perfect but substantially better)\n"
        "- Drain partially cleared (water flow improved)\n"
        "- Litter mostly removed (area noticeably cleaner)\n"
        "- Graffiti painted over (even if paint doesn't match perfectly)\n\n"
        "  Mark as \"no\" (not fixed):\n"
        "- Pothole still completely unfilled\n"
        "- Drain still fully blocked\n"
        "- Litter still covering the area\n"
        "- Graffiti completely untouched\n\n"
        "Important: Be fair and practical. Use image indices to reference evidence. Set temperature to 0 for deterministic results."
    )

    return prompt
