# CivicFix Issue Identifier Service

AI-powered civic infrastructure issue detection and analysis using Google Gemini vision models. This FastAPI service processes images of urban infrastructure problems, detects multiple issue types, assesses severity, predicts environmental impact, and recommends fixes—all automatically indexed to Elasticsearch for geospatial search.

---

## 🎯 What It Does

**Input:**
- `image_url` (string): URL of the civic issue image
- `description` (string, optional): Reporter's description
- `location` (object): `{latitude: float, longitude: float}`
- `timestamp` (string): ISO 8601 timestamp with timezone
- `user_selected_labels` (array, optional): Reporter's suggested issue types
- `reported_by` (string, optional): User identifier
- `source` (string): Report source (`citizen`, `ngo`, `anonymous`)

**Processing:**
1. **Visual Analysis**: Gemini 2.5 Flash inspects the image and detects all visible civic infrastructure issues
2. **Cross-Verification**: Validates user-selected labels against actual image content (prevents false positives)
3. **Multi-Label Detection**: Identifies ALL issue types present (waterlogging, garbage, broken infrastructure, etc.)
4. **Confidence Scoring**: Each issue rated 0.0-1.0 (filters out < 0.6, flags 0.6-0.85 for review)
5. **Severity Assessment**: Assigns severity (low/medium/high) and numerical score (0.0-10.0)
6. **Impact Prediction**: Estimates future consequences and environmental CO₂ impact
7. **Fix Recommendations**: Suggests remediation strategies with confidence scores
8. **Weather Enrichment**: Fetches local weather data (Open-Meteo) to adjust severity (e.g., rain + potholes = higher risk)
9. **Evidence Retrieval**: Searches Elasticsearch for similar local issues and cross-city fixes
10. **Auto-Indexing**: Stores complete issue document in Elasticsearch with geospatial indexing

**Output:**
```json
{
  "issue_id": "uuid",
  "detected_issues": [
    {
      "type": "visible_pollution",
      "confidence": 0.95,
      "severity": "high",
      "severity_score": 8.8,
      "future_impact": "Persistent air pollution will lead to...",
      "predicted_fix": "Implement stringent emission standards...",
      "predicted_fix_confidence": 0.92,
      "auto_review_flag": false,
      "reason_for_flag": null
    }
  ],
  "auto_review": false,
  "no_issues_found": false,
  "location": {"latitude": 18.5223, "longitude": 73.8571},
  "timestamp": "2025-10-18T08:00:00+05:30"
}
```

**Elasticsearch Document Created:**
- Full issue metadata with `detected_issues` (nested), `issue_types` (array), `label_confidences`, `severity_score`
- Geospatial `location` (geo_point) for map clustering
- Weather snapshot, impact metrics, upvotes/reports counters
- Auto-caption, predicted fixes, evidence IDs

---

## 🏗️ Architecture

**Tech Stack:**
- **FastAPI**: High-performance async web framework
- **Google Gemini 2.5 Flash**: Vision-language model for multi-modal analysis
- **Elasticsearch 8.11**: Geospatial search and aggregation
- **Open-Meteo API**: Historical weather data enrichment
- **Pydantic**: Request/response validation

**Key Features:**
- **Multi-label detection**: Single image can have multiple issue types
- **Smart confidence filtering**: Auto-excludes low-confidence detections (< 0.6)
- **Review flagging**: Issues with 0.6-0.85 confidence require human verification
- **Canonical label enforcement**: Restricts to 15 predefined issue types
- **Exponential backoff**: Robust Gemini API retry logic (4 attempts)
- **Weather-aware severity**: Adjusts risk based on precipitation/temperature
- **Hybrid evidence retrieval**: Combines geospatial + semantic search

---

## 📋 Supported Issue Types (Canonical Labels)

```python
[
  "exposed_power_cables",
  "illegal_dumping_bulky_waste",
  "illegal_hoarding",
  "waterlogging",
  "encroachment_public_space",
  "illegal_construction_small",
  "visible_pollution",
  "streetlight_out",
  "overflowing_garbage_bin",
  "broken_infrastructure",
  "public_toilet_nonfunctional",
  "sewer_blockage",
  "uncollected_household_waste",
  "unregulated_construction_activity",
  "public_health_hazard"
]
```

---

## 🚀 Setup & Installation

### Prerequisites
- Python 3.10+
- Elasticsearch 8.11 running on `localhost:9200`
- Google Gemini API key ([Get one here](https://aistudio.google.com/apikey))

### 1. Environment Setup

**Create virtual environment:**
```bash
python -m venv .venv
```

**Activate:**
```bash
# Linux/macOS/WSL:
source .venv/bin/activate

# Windows PowerShell:
.venv\Scripts\Activate.ps1
```

**Install dependencies:**
```bash
pip install -r requirements.txt
```

### 2. Configuration

**Create `.env` file:**
```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
ES_URL=http://localhost:9200
```

**Or set environment variables directly:**
```bash
# Linux/macOS/WSL:
export GEMINI_API_KEY="your_key_here"

# Windows PowerShell:
$env:GEMINI_API_KEY="your_key_here"
```

### 3. Run the Service

**Development mode (with auto-reload):**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

**Production mode:**
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 4
```

**Docker:**
```bash
docker build -t civicfix-issue-identifier .
docker run -e GEMINI_API_KEY=$GEMINI_API_KEY -p 8000:8001 civicfix-issue-identifier
```

**Service will be available at:** `http://localhost:8000`  
**API docs (Swagger UI):** `http://localhost:8000/docs`

---

## 📡 API Usage Examples

### Example 1: Image with Multiple Issues (No User Labels)

**PowerShell:**
```powershell
$body = @{
  image_url = "https://images.indianexpress.com/2025/01/delhi-civic-issues.png"
  description = ""
  location = @{ latitude = 18.5223; longitude = 73.8571 }
  timestamp = "2025-10-18T08:00:00+05:30"
  user_selected_labels = @()
  reported_by = "user:123"
  source = "citizen"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://localhost:8000/analyze/" -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 10
```

**cURL:**
```bash
curl -X POST http://localhost:8000/analyze/ \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://images.indianexpress.com/2025/01/delhi-civic-issues.png",
    "description": "",
    "location": {"latitude": 18.5223, "longitude": 73.8571},
    "timestamp": "2025-10-18T08:00:00+05:30",
    "user_selected_labels": [],
    "reported_by": "user:123",
    "source": "citizen"
  }'
```

**Response:**
```json
{
  "issue_id": "a7cebf69-ffa5-4b5b-8f3e-102feb87e50b",
  "detected_issues": [
    {
      "type": "visible_pollution",
      "confidence": 0.95,
      "severity": "high",
      "severity_score": 8.8,
      "future_impact": "Persistent air pollution will lead to increased respiratory and cardiovascular diseases...",
      "predicted_fix": "Implement stringent emission standards for vehicles and industries...",
      "predicted_fix_confidence": 0.92,
      "auto_review_flag": false
    },
    {
      "type": "uncollected_household_waste",
      "confidence": 0.98,
      "severity": "high",
      "severity_score": 9.3,
      "future_impact": "Accumulation of waste creates breeding grounds for pests and disease vectors...",
      "predicted_fix": "Establish regular and efficient waste collection schedules...",
      "predicted_fix_confidence": 0.97,
      "auto_review_flag": false
    },
    {
      "type": "broken_infrastructure",
      "confidence": 0.9,
      "severity": "high",
      "severity_score": 9.5,
      "future_impact": "Failure of water supply infrastructure leads to chronic water shortages...",
      "predicted_fix": "Conduct immediate repairs and maintenance of water pipelines...",
      "predicted_fix_confidence": 0.92,
      "auto_review_flag": false
    },
    {
      "type": "public_health_hazard",
      "confidence": 0.95,
      "severity": "high",
      "severity_score": 9.6,
      "future_impact": "A combination of severe air pollution, uncollected waste, and inadequate water supply...",
      "predicted_fix": "Implement integrated urban planning addressing waste management...",
      "predicted_fix_confidence": 0.95,
      "auto_review_flag": false
    }
  ],
  "auto_review": false,
  "no_issues_found": false,
  "location": {"latitude": 18.5223, "longitude": 73.8571},
  "timestamp": "2025-10-18T08:00:00+05:30"
}
```

### Example 2: User-Selected Label Verification

**PowerShell:**
```powershell
$body = @{
  image_url = "https://example.com/waterlogging.jpg"
  description = "Severe flooding near school"
  location = @{ latitude = 18.5295; longitude = 73.8518 }
  timestamp = "2025-10-18T08:00:00+05:30"
  user_selected_labels = @("waterlogging")
  reported_by = "user:1234"
  source = "citizen"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://localhost:8000/analyze/" -Method Post -ContentType "application/json" -Body $body
```

**Result:** Gemini verifies "waterlogging" is present, assigns confidence, and may add other detected issues.

---

## 🔍 How Confidence & Review Flags Work

| Confidence Range | Behavior | Auto-Review Flag |
|------------------|----------|------------------|
| **>= 0.85** | High confidence - issue auto-approved | `false` |
| **0.6 - 0.85** | Medium confidence - needs human review | `true` |
| **< 0.6** | Low confidence - **excluded from results** | N/A (filtered out) |

**Document-level `auto_review` flag:**  
Set to `true` if **ANY** detected issue has `auto_review_flag=true` (i.e., confidence 0.6-0.85).

---

## 📊 Elasticsearch Integration

**Index:** `issues`

**Key Fields:**
- `issue_id` (keyword): Unique UUID
- `location` (geo_point): Lat/lon for geospatial queries
- `issue_types` (keyword array): All detected types
- `detected_issues` (nested): Full details per issue type
- `label_confidences` (object): `{type: confidence}` map
- `severity_score` (float): Max severity across all issues (0-10)
- `impact_score` (float): Calculated priority (0-100)
- `visibility_radius_m` (integer): Geofence radius for relevance
- `weather` (object): Snapshot from Open-Meteo

**Sample Query (Get Issue by ID):**
```powershell
Invoke-RestMethod -Uri "http://localhost:9200/issues/_search" -Method Post -ContentType "application/json" -Body '{"query": {"term": {"issue_id": "a7cebf69-ffa5-4b5b-8f3e-102feb87e50b"}}}' | ConvertTo-Json -Depth 10
```

---

## 🧪 Testing & Validation

**Check service health:**
```bash
curl http://localhost:8000/
```

**Run with test image:**
```bash
python -c "
import requests
r = requests.post('http://localhost:8000/analyze/', json={
    'image_url': 'https://images.indianexpress.com/2025/01/delhi-civic-issues.png',
    'location': {'latitude': 18.52, 'longitude': 73.85},
    'timestamp': '2025-10-18T08:00:00+05:30',
    'user_selected_labels': [],
    'source': 'citizen'
})
print(r.json())
"
```

**Check Elasticsearch indexing:**
```bash
curl http://localhost:9200/issues/_count
```

---

## 🛠️ Development

**Project Structure:**
```
cloud/Issue_Identifier/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app & /analyze endpoint
│   ├── schemas.py           # Pydantic models
│   ├── prompt_templates.py  # Gemini prompt builder
│   ├── utils.py             # Weather, image fetch, impact calc
│   └── es_client.py         # Elasticsearch operations
├── requirements.txt
├── Dockerfile
├── .env.example
└── README.md
```

**Key Functions:**
- `analyze()`: Main endpoint handler
- `call_gemini_with_backoff()`: Retry logic for API calls
- `build_prompt()`: Constructs Gemini vision prompt
- `compute_impact_and_radius()`: Priority scoring algorithm
- `index_issue()`: ES document creation

---

## 🐛 Troubleshooting

**Issue:** `GenAI client not initialized`  
**Fix:** Set `GEMINI_API_KEY` environment variable

**Issue:** `Model returned unparsable response`  
**Fix:** Check `model_response_debug.json` in project root for raw Gemini output

**Issue:** `Failed to index issue into ES`  
**Fix:** Verify Elasticsearch is running on `localhost:9200` and index exists

**Issue:** `no_issues_found: true` for images with clear problems  
**Fix:** Ensure image URL is direct image link (not article page). Test with known working image URLs.

---

## 📝 Notes

- **Weather data**: Uses Open-Meteo free tier (rate limit: ~10k requests/day)
- **Image fetch**: Service downloads image to memory (max ~10MB recommended)
- **Gemini limits**: Free tier ~15 RPM, 1M tokens/day
- **ES mapping**: Auto-created on first index, but `seed.py` can pre-create schema

---

## 📄 License

Part of the CivicFix platform. See main repository for license details.

---

## 🤝 Contributing

This service is part of the larger CivicFix ecosystem. For contributions:
1. Test changes with diverse civic issue images
2. Ensure Elasticsearch schema compatibility
3. Validate confidence thresholds with real data
4. Update canonical labels list only after thorough review

---
