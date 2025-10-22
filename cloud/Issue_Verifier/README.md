# Issue Verifier Service

AI-powered fix verification service using Google Gemini 2.5 Flash vision model. Validates fix submissions by analyzing evidence images and comparing them against original issue reports.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Cloud Run Deployment](#cloud-run-deployment)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

The **Issue Verifier** service validates civic issue fixes by:
- Analyzing evidence images using Google Gemini Vision AI
- Comparing fix evidence against original issue reports
- Providing confidence scores for 19 canonical issue types
- Automatically updating issue status in Elasticsearch
- Tracking CO2 impact savings

**Key Features:**
- ✅ Visual verification with AI-powered image analysis
- ✅ Hybrid search (kNN vector + filtered queries)
- ✅ Confidence Scoring: Provides granular confidence scores for each issue type
- ✅ Automatic CO2 impact tracking
- ✅ Robust JSON parsing with error recovery
- ✅ Comprehensive issue status management

---

## 📦 Prerequisites

### Required Services

| Service | Version | Purpose |
|---------|---------|---------|
| Python | 3.11+ | Runtime environment |
| Elasticsearch | 8.11+ | Data storage with vector search |
| Google Gemini API | 2.5 Flash | Vision AI analysis |

### Elasticsearch Indices

```bash
# Required indices
- issues  (civic issue reports)
- fixes   (verified fix submissions)
```

### API Keys

```bash
# Get your Gemini API key
https://makersuite.google.com/app/apikey
```

---

## 🚀 Local Development

### Step 1: Install Dependencies

```bash
cd cloud/Issue_Verifier
pip install -r requirements.txt
```

### Step 2: Configure Environment

```bash
# Copy example configuration
cp .env.example .env

# Edit .env file
nano .env
```

**Environment Variables:**

```bash
GEMINI_API_KEY=<your_gemini_api_key>
GEMINI_MODEL=gemini-2.5-flash
EMBED_MODEL=gemini-embedding-001
ES_URL=http://localhost:9200
ES_USER=<your_elastic_user>
ES_PASSWORD=<your_password>
```

### Step 3: Run Service

```bash
# Development mode (auto-reload)
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Production mode
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### Step 4: Verify

```bash
# Open browser
http://localhost:8001/docs
```

---

## 🐳 Docker Deployment

### Build Image

```bash
cd cloud/Issue_Verifier
docker build -t civicfix-issue-verifier .
```

### Run Container (Linux/Mac)

```bash
docker run -d \
  --name civicfix-issue-verifier \
  -e GEMINI_API_KEY=<your_gemini_api_key> \
  -e GEMINI_MODEL=gemini-2.5-flash \
  -e EMBED_MODEL=gemini-embedding-001 \
  -e ES_URL=<your-es-url> \
  -e ES_USER=<your-elastic-username> \
  -e ES_PASSWORD=<your_password> \
  -p 8001:8001 \
  civicfix-issue-verifier
```

### Run Container (Windows PowerShell)

```powershell
docker run -d `
  --name civicfix-issue-verifier `
  -e GEMINI_API_KEY=<your_gemini_api_key> `
  -e GEMINI_MODEL=gemini-2.5-flash `
  -e EMBED_MODEL=gemini-embedding-001 `
  -e ES_URL=<your-es-url> `
  -e ES_USER=<your-elastic-username> `
  -e ES_PASSWORD=<your_password> `
  -p 8001:8001 `
  civicfix-issue-verifier
```

### Container Management

```bash
# View logs
docker logs -f civicfix-issue-verifier

# Stop container
docker stop civicfix-issue-verifier

# Remove container
docker rm civicfix-issue-verifier

# Restart container
docker restart civicfix-issue-verifier
```

---

## ☁️ Cloud Run Deployment

### Prerequisites

```bash
# Install gcloud CLI
https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### Step 1: Set Variables

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-central1
export SERVICE_NAME=issue-verifier
export IMAGE_TAG=gcr.io/$PROJECT_ID/$SERVICE_NAME:latest
```

### Step 2: Build & Push Image

```bash
cd cloud/Issue_Verifier

# Build for Cloud Run (linux/amd64)
docker build --platform linux/amd64 -t $IMAGE_TAG .

# Configure Docker authentication
gcloud auth configure-docker

# Push to Container Registry
docker push $IMAGE_TAG
```

### Step 3: Deploy Service

```bash
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_TAG \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=<your_gemini_api_key> \
  --set-env-vars GEMINI_MODEL=gemini-2.5-flash \
  --set-env-vars EMBED_MODEL=gemini-embedding-001 \
  --set-env-vars ES_URL=<your-elastic-url> \
  --set-env-vars ES_USER=<your-elastic-username> \
  --set-env-vars ES_PASSWORD=<your_password> \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --port 8001
```

### Step 4: Get Service URL

```bash
gcloud run services describe $SERVICE_NAME \
  --region $REGION \
  --format 'value(status.url)'
```

### Using Secret Manager (Recommended)

```bash
# Create secrets
echo -n "<your_gemini_api_key>" | \
  gcloud secrets create gemini-api-key --data-file=-

echo -n "<your_password>" | \
  gcloud secrets create es-password --data-file=-

# Deploy with secrets
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_TAG \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest,ES_PASSWORD=es-password:latest \
  --set-env-vars GEMINI_MODEL=gemini-2.5-flash \
  --set-env-vars EMBED_MODEL=gemini-embedding-001 \
  --set-env-vars ES_URL=<your-elastic-url> \
  --set-env-vars ES_USER=<your-elastic-username> \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --port 8001
```

### Update Deployment

```bash
# Rebuild image
docker build --platform linux/amd64 -t $IMAGE_TAG .
docker push $IMAGE_TAG

# Redeploy
gcloud run deploy $SERVICE_NAME --image $IMAGE_TAG --region $REGION
```

---

## 📡 API Reference

### Base URLs

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:8001` |
| Cloud Run | `https://YOUR_SERVICE-XXXXXXX-uc.a.run.app` |

### Interactive Documentation

| Tool | URL |
|------|-----|
| Swagger UI | `/docs` |
| ReDoc | `/redoc` |

---

### POST `/verify_fix/`

**Purpose:** Verify a fix submission with evidence images

#### Request

```bash
curl -X POST "http://localhost:8001/verify_fix/" \
  -H "Content-Type: application/json" \
  -d '{
    "issue_id": "1cb01e54-2403-4219-a0db-421e0086e1aa",
    "ngo_id": "ngo123",
    "image_urls": [
      "https://storage.googleapis.com/bucket/fix1.jpg",
      "https://storage.googleapis.com/bucket/fix2.jpg"
    ],
    "fix_description": "Filled the pothole with tar and fixed it",
    "timestamp": "2025-10-21T10:46:00Z"
  }'
```

#### Request Schema

```json
{
  "issue_id": "string (required)",
  "ngo_id": "string (required)",
  "image_urls": ["string (required, min 1 URL)"],
  "fix_description": "string (optional)",
  "timestamp": "string (ISO format)"
}
```

#### Response (200 OK)

```json
{
  "fix_id": "74f13c6e-87e3-4469-b43e-e2c8ef1ad0ca",
  "issue_id": "1cb01e54-2403-4219-a0db-421e0086e1aa",
  "per_issue_results": [
    {
      "issue_type": "road_pothole",
      "original_confidence": 1.0,
      "fixed": "yes",
      "confidence": 1.0,
      "evidence_photos": [0, 1],
      "notes": "Pothole filled with fresh asphalt, fully resolved"
    }
  ],
  "overall_outcome": "closed",
  "suggested_success_rate": 1.0,
  "created_at": "2025-10-21T16:04:11.833791+00:00"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `fix_id` | string | Unique fix identifier |
| `issue_id` | string | Original issue ID |
| `per_issue_results` | array | Results per issue type |
| `overall_outcome` | string | `closed`, `partially_closed`, `rejected`, `needs_manual_review` |
| `suggested_success_rate` | float | Success rate (0.0-1.0) |
| `created_at` | string | Timestamp (ISO format) |

#### Per Issue Result

| Field | Type | Description |
|-------|------|-------------|
| `issue_type` | string | Issue type (19 canonical types) |
| `original_confidence` | float | Original detection confidence |
| `fixed` | string | `yes`, `partial`, `no` |
| `confidence` | float | Verification confidence (0.0-1.0) |
| `evidence_photos` | array | Image indices used as evidence |
| `notes` | string | AI explanation (≤40 words) |

#### Error Responses

| Code | Reason | Example |
|------|--------|---------|
| `400` | Bad request | Missing image_urls |
| `404` | Issue not found | Invalid issue_id |
| `500` | Server error | Gemini API failure |

---

## 🎯 Canonical Issue Types

| Type | Description |
|------|-------------|
| `DRAIN_BLOCKAGE` | Blocked drainage systems |
| `FALLEN_TREE` | Fallen trees blocking paths |
| `FLOODING_SURFACE` | Surface flooding |
| `GRAFFITI_VANDALISM` | Vandalism and graffiti |
| `GREENSPACE_MAINTENANCE` | Overgrown vegetation |
| `ILLEGAL_CONSTRUCTION_DEBRIS` | Illegal construction waste |
| `MANHOLE_MISSING_OR_DAMAGED` | Missing/damaged manholes |
| `POWER_POLE_LINE_DAMAGE` | Electrical infrastructure damage |
| `PUBLIC_INFRASTRUCTURE_DAMAGED` | General infrastructure damage |
| `PUBLIC_TOILET_UNSANITARY` | Unsanitary public restrooms |
| `ROAD_POTHOLE` | Road potholes |
| `SIDEWALK_DAMAGE` | Damaged sidewalks |
| `SMALL_FIRE_HAZARD` | Fire hazards |
| `STRAY_ANIMALS` | Stray animal issues |
| `STREETLIGHT_OUTAGE` | Non-functional streetlights |
| `TRAFFIC_OBSTRUCTION` | Traffic obstructions |
| `TRAFFIC_SIGN_DAMAGE` | Damaged traffic signs |
| `WASTE_BULKY_DUMP` | Bulky waste dumping |
| `WASTE_LITTER_SMALL` | Small litter and trash |
| `WATER_LEAK_SURFACE` | Water pipe leaks |

---

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | ✅ | - | Google Gemini API key |
| `GEMINI_MODEL` | ❌ | `gemini-2.5-flash` | Gemini model name |
| `EMBED_MODEL` | ❌ | `gemini-embedding-001` | Embedding model |
| `ES_URL` | ❌ | `http://localhost:9200` | Elasticsearch URL |
| `ES_USER` | ❌ | `elastic` | ES username |
| `ES_PASSWORD` | ❌ | - | ES password |

### Resource Recommendations

| Environment | CPU | Memory | Instances |
|-------------|-----|--------|-----------|
| Development | 1 core | 512MB | 1 |
| Production | 2 cores | 2GB | 5-10 |
| High Load | 4 cores | 4GB | 10+ |

---

## 🔧 Troubleshooting

### Issue: Cannot Connect to Elasticsearch

**Symptoms:**
```
ConnectionError: Connection refused
```

**Solutions:**
1. Verify ES_URL is correct
2. Check Elasticsearch is running: `curl -k -u elastic:password https://your-es:9200`
3. Verify network connectivity from container/service
4. Check firewall rules

---

### Issue: Authentication Failed

**Symptoms:**
```
401 Unauthorized
```

**Solutions:**
1. Verify ES_USER and ES_PASSWORD
2. Test credentials: `curl -k -u elastic:password https://your-es:9200/_cluster/health`
3. Check user permissions in Elasticsearch

---

### Issue: Issue Not Found

**Symptoms:**
```
404: Issue <id> not found
```

**Solutions:**
1. Verify issue exists in `issues` index
2. Check issue_id field matches exactly
3. Query ES directly: `curl -k -u elastic:password https://your-es:9200/issues/_search?q=issue_id:YOUR_ID`

---

### Issue: Image Download Failed

**Symptoms:**
```
400: Could not fetch image url
```

**Solutions:**
1. Ensure image URLs are publicly accessible
2. Test URL in browser or curl
3. Check image format (JPEG, PNG, WebP supported)
4. Verify no authentication required for images

---

### Issue: Gemini API Error

**Symptoms:**
```
500: Model call failed
```

**Solutions:**
1. Verify GEMINI_API_KEY is valid
2. Check API quota: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas
3. Ensure images are < 20MB each
4. Check API key has Gemini API enabled

---

### Debug Mode

```bash
# Local development
LOG_LEVEL=DEBUG uvicorn app.main:app --host 0.0.0.0 --port 8001

# Docker
docker run -e LOG_LEVEL=DEBUG ... civicfix-issue-verifier

# Cloud Run (add to deployment)
--set-env-vars LOG_LEVEL=DEBUG
```

---

## 📊 Data Flow

### Verification Process

```
┌─────────────┐
│   Client    │
│  (Submit    │
│   Fix)      │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  1. Fetch Original Issue (ES)           │
│     - Get issue details                  │
│     - Extract fate_risk_co2              │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  2. Download Evidence Images             │
│     - Validate URLs                      │
│     - Fetch image bytes                  │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  3. Retrieve Context (Hybrid Search)     │
│     - kNN vector search                  │
│     - Filter by issue types              │
│     - Get similar fixes                  │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  4. Gemini Vision Analysis               │
│     - Send images + context              │
│     - Get verification results           │
│     - Parse JSON response                │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  5. Store Fix Document (fixes index)     │
│     - Create fix record                  │
│     - Set co2_saved = fate_risk_co2      │
│     - Store fix_outcomes                 │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  6. Update Issue (issues index)          │
│     - Update status                      │
│     - Set co2_kg_saved = fate_risk_co2   │
│     - Add fix_id to evidence_ids         │
│     - Update timestamps                  │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────┐
│  Response   │
│  (Results)  │
└─────────────┘
```

### CO2 Tracking Flow

```
Original Issue:
  fate_risk_co2: 18.5 kg  (potential CO2 if not fixed)
  co2_kg_saved: 0.0 kg    (not yet fixed)

After Fix Verification:
  Fix Document:
    co2_saved: 18.5 kg    (from issue's fate_risk_co2)
  
  Issue Update:
    co2_kg_saved: 18.5 kg (updated when closed)
    status: "closed"
```

---

## 📂 Project Structure

```
Issue_Verifier/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app & endpoints
│   ├── schemas.py           # Pydantic models
│   ├── prompt_template.py   # Gemini prompts
│   └── utils.py             # Helper functions
├── .env                     # Environment config (gitignored)
├── .env.example             # Environment template
├── Dockerfile               # Docker configuration
├── requirements.txt         # Python dependencies
├── README.md               # Original README
└── DEPLOYMENT.md           # This file
```

---

## 🔗 Related Documentation

- [Elasticsearch API](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [Google Gemini API](https://ai.google.dev/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Google Cloud Run](https://cloud.google.com/run/docs)

---

**Last Updated:** October 21, 2025  
**Version:** 1.0.0
