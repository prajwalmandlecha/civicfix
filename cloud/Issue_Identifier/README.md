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
- `reported_by` (string): User identifier
- `uploader_display_name` (string): User display name
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
- **Canonical label enforcement**: Restricts to 19 predefined issue types
- **Exponential backoff**: Robust Gemini API retry logic (4 attempts)
- **Weather-aware severity**: Adjusts risk based on precipitation/temperature
- **Hybrid evidence retrieval**: Combines geospatial + semantic search

---

## 📋 Supported Issue Types (Canonical Labels)

```python
[
  "DRAIN_BLOCKAGE",
  "FALLEN_TREE",
  "FLOODING_SURFACE",
  "GRAFFITI_VANDALISM",
  "GREENSPACE_MAINTENANCE",
  "ILLEGAL_CONSTRUCTION_DEBRIS",
  "MANHOLE_MISSING_OR_DAMAGED",
  "POWER_POLE_LINE_DAMAGE",
  "PUBLIC_INFRASTRUCTURE_DAMAGED",
  "PUBLIC_TOILET_UNSANITARY",
  "ROAD_POTHOLE",
  "SIDEWALK_DAMAGE",
  "SMALL_FIRE_HAZARD",
  "STRAY_ANIMALS",
  "STREETLIGHT_OUTAGE",
  "TRAFFIC_OBSTRUCTION",
  "TRAFFIC_SIGN_DAMAGE",
  "WASTE_BULKY_DUMP",
  "WASTE_LITTER_SMALL"
]
```

---

## 🚀 Setup & Installation

### Prerequisites
- Docker Desktop installed and running
- Python 3.10+
- Google Gemini API key ([Get one here](https://aistudio.google.com/apikey))
- Elasticsearch 8.11 (see deployment options below)

---

## 🐳 Docker Deployment with Local Elasticsearch

This setup runs both Elasticsearch and Issue Identifier in the same Docker network for optimal performance.

### Step 1: Start Local Elasticsearch with Docker Compose

Navigate to the elastic-local directory and start Elasticsearch:

```powershell
# PowerShell
cd ../../elastic-local
docker-compose up -d

# Verify Elasticsearch is running
curl http://localhost:9200
```

```bash
# Linux/macOS/WSL
cd ../../elastic-local
docker-compose up -d

# Verify Elasticsearch is running
curl http://localhost:9200
```

**Expected response:**
```json
{
  "name" : "civicfix-es",
  "cluster_name" : "docker-cluster",
  "version" : {
    "number" : "8.11.1"
  }
}
```

### Step 2: Create Docker Network

Create a custom bridge network for inter-container communication:

```bash
# Create network (if not already created by docker-compose)
docker network create civicfix-net

# Connect Elasticsearch to the network (if not already connected)
docker network connect civicfix-net civicfix-es
```

### Step 3: Build and Run Issue Identifier Container

Navigate to the Issue Identifier directory:

```powershell
# PowerShell
cd ../cloud/Issue_Identifier

# Build the Docker image
docker build -t civicfix-issue-identifier .

# Run the container on civicfix-net network
docker run -d --name civicfix-issue-identifier `
  --network civicfix-net `
  -e GEMINI_API_KEY=your_gemini_api_key_here `
  -e GEMINI_MODEL=gemini-2.5-flash `
  -e EMBEDDING_MODEL=gemini-embedding-001 `
  -e ES_URL=http://civicfix-es:9200 `
  -p 8000:8000 `
  civicfix-issue-identifier

# Check logs
docker logs -f civicfix-issue-identifier
```

```bash
# Linux/macOS/WSL
cd ../cloud/Issue_Identifier

# Build the Docker image
docker build -t civicfix-issue-identifier .

# Run the container on civicfix-net network
docker run -d --name civicfix-issue-identifier \
  --network civicfix-net \
  -e GEMINI_API_KEY=your_gemini_api_key_here \
  -e GEMINI_MODEL=gemini-2.5-flash \
  -e EMBEDDING_MODEL=gemini-embedding-001 \
  -e ES_URL=http://civicfix-es:9200 \
  -p 8000:8000 \
  civicfix-issue-identifier

# Check logs
docker logs -f civicfix-issue-identifier
```

**Service will be available at:**
- API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- Elasticsearch: `http://localhost:9200`

---

## 🐳 Docker Deployment with Remote Elasticsearch VM

If you have Elasticsearch running on a remote VM with HTTPS and authentication:

```powershell
# PowerShell
docker run -d --name civicfix-issue-identifier `
  -e GEMINI_API_KEY=your_gemini_api_key_here `
  -e GEMINI_MODEL=gemini-2.5-flash `
  -e EMBEDDING_MODEL=gemini-embedding-001 `
  -e ES_URL=https://your-vm-ip:9200 `
  -e ES_USER=elastic `
  -e ES_PASSWORD=your_elasticsearch_password `
  -p 8000:8000 `
  civicfix-issue-identifier
```

```bash
# Linux/macOS/WSL
docker run -d --name civicfix-issue-identifier \
  -e GEMINI_API_KEY=your_gemini_api_key_here \
  -e GEMINI_MODEL=gemini-2.5-flash \
  -e EMBEDDING_MODEL=gemini-embedding-001 \
  -e ES_URL=https://your-vm-ip:9200 \
  -e ES_USER=elastic \
  -e ES_PASSWORD=your_elasticsearch_password \
  -p 8000:8000 \
  civicfix-issue-identifier
```

---

## ☁️ Cloud Run Deployment (Google Cloud)

Deploy the Issue Identifier service to Google Cloud Run for production.

### Prerequisites
- Google Cloud account with billing enabled
- `gcloud` CLI installed and authenticated
- Docker installed locally
- Elasticsearch VM or Cloud Elasticsearch instance accessible from Cloud Run

### Step 1: Configure Environment

Create a `.env.production` file:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
EMBEDDING_MODEL=gemini-embedding-001
ES_URL=https://your-es-vm-external-ip:9200
ES_USER=elastic
ES_PASSWORD=your_elasticsearch_password
```

### Step 2: Build and Push Docker Image to Google Container Registry

```bash
# Set your project ID
export PROJECT_ID=your-gcp-project-id

# Configure Docker to use gcloud as credential helper
gcloud auth configure-docker

# Build the image for Cloud Run
docker build -t gcr.io/$PROJECT_ID/civicfix-issue-identifier:latest .

# Push to Google Container Registry
docker push gcr.io/$PROJECT_ID/civicfix-issue-identifier:latest
```

### Step 3: Deploy to Cloud Run

```bash
# Deploy with environment variables
gcloud run deploy civicfix-issue-identifier \
  --image gcr.io/$PROJECT_ID/civicfix-issue-identifier:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="GEMINI_API_KEY=your_gemini_api_key_here,GEMINI_MODEL=gemini-2.5-flash,EMBEDDING_MODEL=gemini-embedding-001,ES_URL=https://your-es-vm-ip:9200,ES_USER=elastic,ES_PASSWORD=your_elasticsearch_password" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300s \
  --max-instances 10 \
  --min-instances 1 \
  --port 8000
```

**Recommended settings:**
- **Memory**: 2Gi (handles image processing + Gemini API calls)
- **CPU**: 2 vCPU (parallel API operations)
- **Timeout**: 300s (5 minutes for complex image analysis)
- **Max instances**: 10 (scale based on traffic)
- **Min instances**: 1 (keep warm for faster responses)

### Step 4: Secure Environment Variables (Recommended)

For production, use Google Secret Manager instead of plain env vars:

```bash
# Create secrets
echo -n "your_gemini_api_key" | gcloud secrets create gemini-api-key --data-file=-
echo -n "your_es_password" | gcloud secrets create es-password --data-file=-

# Deploy with secrets
gcloud run deploy civicfix-issue-identifier \
  --image gcr.io/$PROJECT_ID/civicfix-issue-identifier:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest,ES_PASSWORD=es-password:latest" \
  --set-env-vars="GEMINI_MODEL=gemini-2.5-flash,EMBEDDING_MODEL=gemini-embedding-001,ES_URL=https://your-es-vm-ip:9200,ES_USER=elastic" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300s \
  --max-instances 10 \
  --min-instances 1 \
  --port 8000
```

### Step 5: Configure VPC Access (If ES is in Private Network)

If your Elasticsearch VM is in a private VPC:

```bash
# Create VPC connector
gcloud compute networks vpc-access connectors create civicfix-connector \
  --region us-central1 \
  --network default \
  --range 10.8.0.0/28

# Deploy with VPC access
gcloud run deploy civicfix-issue-identifier \
  --image gcr.io/$PROJECT_ID/civicfix-issue-identifier:latest \
  --vpc-connector civicfix-connector \
  --vpc-egress all-traffic \
  [... other flags ...]
```

### Step 6: Test Cloud Run Deployment

```bash
# Get the service URL
export SERVICE_URL=$(gcloud run services describe civicfix-issue-identifier --region us-central1 --format 'value(status.url)')

# Test the endpoint
curl -X POST $SERVICE_URL/analyze/ \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/issue.jpg",
    "description": "Test issue",
    "location": {"latitude": 18.5204, "longitude": 73.8567},
    "timestamp": "2025-10-21T10:00:00Z",
    "user_selected_labels": ["pothole_large"],
    "reported_by": "test_user",
    "uploader_display_name": "Test User",
    "source": "citizen"
  }'
```

### Step 7: Monitor and Scale

```bash
# View logs
gcloud run services logs read civicfix-issue-identifier --region us-central1

# Update scaling
gcloud run services update civicfix-issue-identifier \
  --region us-central1 \
  --min-instances 2 \
  --max-instances 20

# Update resources
gcloud run services update civicfix-issue-identifier \
  --region us-central1 \
  --memory 4Gi \
  --cpu 4
```

**Cloud Run Pricing Estimate (us-central1):**
- Request: $0.40 per million requests
- CPU: $0.00002400 per vCPU-second
- Memory: $0.00000250 per GiB-second
- Example: 10,000 requests/day with 2 vCPU, 2GiB, avg 5s per request ≈ $15-20/month

---

## 💻 Local Development (without Docker)

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
EMBEDDING_MODEL=gemini-embedding-001

# For local Elasticsearch (HTTP without authentication):
ES_URL=http://localhost:9200

# For remote Elasticsearch VM (HTTPS with authentication):
# ES_URL=https://your-es-vm-ip:9200
# ES_USER=elastic
# ES_PASSWORD=your_elasticsearch_password_here
```

**Elasticsearch Setup:**

**Option 1: Local Elasticsearch (no authentication)**
- Use `ES_URL=http://localhost:9200`
- No need to set `ES_USER` and `ES_PASSWORD`

**Option 2: Remote Elasticsearch VM (with HTTPS & authentication)**
- Use `ES_URL=https://your-vm-ip:9200`
- Set `ES_USER=elastic` (or your username)
- Set `ES_PASSWORD=your_password`
- The service will automatically use SSL and basic authentication

**Testing Elasticsearch Connection:**

**Local (HTTP):**
```bash
curl http://localhost:9200
```

**Remote (HTTPS with auth):**
```bash
curl -k -u elastic:your_password https://your-vm-ip:9200
```

**Note:** For local development, use `ES_URL=http://localhost:9200` (not `civicfix-es`).

### 3. Run the Service

**Development mode (with auto-reload):**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

**Production mode:**
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

**Service will be available at:** `http://localhost:8000`  
**API docs (Swagger UI):** `http://localhost:8000/docs`

---

## 🧪 Testing Your Setup

### Quick Test with Sample Issue

**PowerShell:**
```powershell
$body = @{
  image_url = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSZSXrPAgJBktPfO2yhnuWpTGL5CncwZ76lxQ&s"
  description = "garbage dump with stray animals"
  location = @{ latitude = 18.5589; longitude = 73.8087 }
  timestamp = "2025-10-21T10:00:00Z"
  user_selected_labels = @("stray_animals")
  reported_by = "test_user"
  uploader_display_name = "Test User"
  source = "citizen"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8000/analyze/" -Method Post -ContentType "application/json" -Body $body
$response | ConvertTo-Json -Depth 10

# Verify in Elasticsearch (Local Docker)
Invoke-RestMethod -Uri "http://localhost:9200/issues/_search" -Method Post -ContentType "application/json" -Body "{`"query`": {`"term`": {`"issue_id`": `"$($response.issue_id)`"}}}" | ConvertTo-Json -Depth 10

# Verify in Elasticsearch (Remote VM with auth)
$headers = @{Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("elastic:your_password"))}
Invoke-RestMethod -Uri "https://your-vm-ip:9200/issues/_search" -Method Post -ContentType "application/json" -Body "{`"query`": {`"term`": {`"issue_id`": `"$($response.issue_id)`"}}}" -Headers $headers -SkipCertificateCheck | ConvertTo-Json -Depth 10
```

**cURL:**
```bash
# Test the endpoint
curl -X POST http://localhost:8000/analyze/ \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSZSXrPAgJBktPfO2yhnuWpTGL5CncwZ76lxQ&s",
    "description": "garbage dump with stray animals",
    "location": {"latitude": 18.5589, "longitude": 73.8087},
    "timestamp": "2025-10-21T10:00:00Z",
    "user_selected_labels": ["stray_animals"],
    "reported_by": "test_user",
    "uploader_display_name": "Test User",
    "source": "citizen"
  }'

# Verify in Elasticsearch (Local Docker)
curl -X POST http://localhost:9200/issues/_search?pretty \
  -H "Content-Type: application/json" \
  -d '{"query": {"match_all": {}}, "size": 1, "sort": [{"created_at": "desc"}]}'

# Verify in Elasticsearch (Remote VM with auth)
curl -k -u elastic:your_password -X POST https://your-vm-ip:9200/issues/_search?pretty \
  -H "Content-Type: application/json" \
  -d '{"query": {"match_all": {}}, "size": 1, "sort": [{"created_at": "desc"}]}'
```

**Expected logs in Docker:**
```
INFO: Using kNN hybrid search with vector similarity (3072 dims) for lat=18.5589, lon=73.8087
INFO: ES returned 0-5 evidence issues within 5km and 180 days
INFO: Found X evidence issues: ['...']
INFO: 127.0.0.1:xxxxx - "POST /analyze/ HTTP/1.1" 200 OK
```

**Expected response:**
```json
{
  "issue_id": "abc-123-...",
  "detected_issues": [
    {
      "type": "waste_bulky_dump",
      "confidence": 0.98,
      "severity": "high",
      "severity_score": 8.5,
      "future_impact": "...",
      "predicted_fix": "...",
      "predicted_fix_confidence": 0.95,
      "auto_review_flag": false,
      "reason_for_flag": null
    },
    {
      "type": "stray_animals",
      "confidence": 0.95,
      "severity": "medium",
      "severity_score": 7.0,
      "future_impact": "...",
      "predicted_fix": "...",
      "predicted_fix_confidence": 0.9,
      "auto_review_flag": false,
      "reason_for_flag": null
    }
  ],
  "auto_review": false,
  "no_issues_found": false,
  "location": {"latitude": 18.5589, "longitude": 73.8087},
  "timestamp": "2025-10-21T10:00:00Z"
}
```

---

## 🛑 Stopping Services

### Docker Setup (Local Elasticsearch)

**Stop all containers:**
```powershell
# PowerShell
docker stop civicfix-issue-identifier civicfix-es
docker rm civicfix-issue-identifier

# Stop Elasticsearch with docker-compose
cd ../../elastic-local
docker-compose down
```

```bash
# Linux/macOS/WSL
docker stop civicfix-issue-identifier civicfix-es
docker rm civicfix-issue-identifier

# Stop Elasticsearch with docker-compose
cd ../../elastic-local
docker-compose down
```

**Remove Docker network (optional):**
```bash
docker network rm civicfix-net
```

### Docker Setup (Remote Elasticsearch)

```bash
# Only stop Issue Identifier (ES is on remote VM)
docker stop civicfix-issue-identifier
docker rm civicfix-issue-identifier
```

### Cloud Run Setup

```bash
# Delete the Cloud Run service
gcloud run services delete civicfix-issue-identifier --region us-central1

# Delete the Docker image from GCR (optional)
gcloud container images delete gcr.io/$PROJECT_ID/civicfix-issue-identifier:latest

# Delete secrets (optional)
gcloud secrets delete gemini-api-key
gcloud secrets delete es-password

# Delete VPC connector (if created)
gcloud compute networks vpc-access connectors delete civicfix-connector --region us-central1
```

---

## 🔍 Verifying Your Setup

### Docker Setup Verification

**Check Docker network:**
```bash
docker network inspect civicfix-net
```
Both `civicfix-es` and `civicfix-issue-identifier` should be listed.

**Check containers are running:**
```bash
docker ps
```
Should show both `civicfix-es` and `civicfix-issue-identifier` with status "Up".

**Check Elasticsearch:**
```bash
# Local Docker
curl http://localhost:9200/_cat/indices?v

# Remote VM
curl -k -u elastic:password https://your-vm-ip:9200/_cat/indices?v
```

**Check Issue Identifier logs:**
```bash
docker logs civicfix-issue-identifier
```

You should see:
```
INFO: Elasticsearch client initialized with authentication for https://...
INFO: Application startup complete.
```

**Test connectivity between containers:**
```bash
# Execute shell in Issue Identifier container
docker exec -it civicfix-issue-identifier /bin/sh

# Test ES connection from inside container
curl http://civicfix-es:9200
# Should return ES cluster info
```

### Cloud Run Verification

**Check service status:**
```bash
gcloud run services describe civicfix-issue-identifier --region us-central1
```

**Check recent logs:**
```bash
gcloud run services logs read civicfix-issue-identifier --region us-central1 --limit 50
```

**Test health:**
```bash
export SERVICE_URL=$(gcloud run services describe civicfix-issue-identifier --region us-central1 --format 'value(status.url)')
curl $SERVICE_URL/
```

---

## 📡 API Usage Examples

### Example: Image with Multiple Issues (No User Labels)

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

Invoke-RestMethod -Uri "http://localhost:8000/analyze/" -Method Post -ContentType "application/json" -Body $body

# Check the entire content of issue
Invoke-RestMethod -Uri "http://localhost:9200/issues/_search" -Method Post -ContentType "application/json" -Body '{"query": {"term": {"issue_id": "<issue_id returned from the response>"}}}' |
ForEach-Object {
    if ($_.hits) {
        $_.hits.hits | ForEach-Object {
            if ($_. _source.text_embedding) { $_._source.text_embedding = '[...]' }
        }
    }
    $_
} | ConvertTo-Json -Depth 10
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
    "uploader_display_name": "Test User",
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
    'reported_by': 'test_user',
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
│   ├── utils.py             # Weathe
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
