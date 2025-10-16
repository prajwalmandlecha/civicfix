def build_prompt(description: str, location: dict, timestamp: str):
    """
    Builds the prompt for Gemini.
    Guides the model to return JSON array of issues.
    """
    prompt = (
        "You are an assistant that inspects images of urban public infrastructure. "
        "Return a JSON array of objects. Each object must contain:\n"
        " - type : short issue name (e.g., pothole, garbage_overflow, streetlight_out, waterlogging, road_crack, "
        "fallen_tree, manhole_missing, illegal_parking, graffiti, obstruction)\n"
        " - confidence : float between 0.0 and 1.0\n"
        " - severity : one of ['low','medium','high']\n"
        " - predicted_impact : single sentence string describing likely future impact\n"
        " - predicted_CO2_emissions : float value describing likely CO2 emissions impact in KG\n"
        " - predicted_fix : single sentence string describing likely fix\n"
        "Rules:\n"
        " - The image may contain multiple issues — return all unique detected issues.\n"
        " - "
        " - predicted_impact must be ONE string (not array), concise <= 30 words.\n"
        " - Return ONLY JSON, no extra text.\n\n"
        f"Context:\nDescription: {description}\n"
        f"Location: {location.get('latitude')},{location.get('longitude')}\n"
        f"Timestamp: {timestamp}\n"
    )
    return prompt
