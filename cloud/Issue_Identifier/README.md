# Civic Issue Analyzer (FastAPI + Gemini)

## What it does
- Accepts: `image_url`, `description`, `location{latitude,longitude}`, `timestamp`
- Uses Google Gemini via the Google GenAI Python SDK
- Returns JSON array of detected civic issues (multi-label), each with:
  - `type`, `confidence` (0..1), `severity` (low/medium/high), and `predicted_impact` (single string).

## Setup

1. Create a `.env` file (or copy from `.env.example`) and set:
   - `GEMINI_API_KEY=your_gemini_api_key_here`
   (No Vertex AI setup required)

2. Install & run locally:
   ```bash
   python -m venv .venv
   # For Linux/macOS (WSL):
   source .venv/bin/activate
   # For Windows PowerShell:
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   # Set environment variable for Gemini API key:
   # Linux/macOS (WSL):
   export GEMINI_API_KEY=your_gemini_api_key_here
   # Windows PowerShell:
   $env:GEMINI_API_KEY="your_gemini_api_key_here"
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
---

## Example: Test the API

### PowerShell
```powershell
$body = @{
      image_url   = "https://storage.googleapis.com/civicfix_issues_bucket/uploads/example.png";
      description = "Near school entrance, rainy day";
      location    = @{ latitude = 18.5204; longitude = 73.8567 };
      timestamp   = "2025-10-09T20:37:33+05:30"
} | ConvertTo-Json -Depth 3

$response = Invoke-RestMethod -Uri "http://localhost:8000/analyze/" `
      -Method POST `
      -ContentType "application/json" `
      -Body $body
$response | ConvertTo-Json -Depth 5
```

### WSL/Linux/macOS (curl)
```bash
curl -X POST http://localhost:8000/analyze/ \
   -H "Content-Type: application/json" \
   -d '{
      "image_url": "https://storage.googleapis.com/civicfix_issues_bucket/uploads/example.png",
      "description": "Near school entrance, rainy day",
      "location": {"latitude": 18.5204, "longitude": 73.8567},
      "timestamp": "2025-10-09T20:37:33+05:30"
   }'
```

---
3. Docker:
   ```bash
   docker build -t civic-issue-analyzer .
   docker run -e GEMINI_API_KEY=$GEMINI_API_KEY -p 8000:8000 civic-issue-analyzer
   ```
