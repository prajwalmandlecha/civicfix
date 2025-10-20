# CivicFix Project Setup

This guide will help you start CivicFix services: Elasticsearch, Issue Identifier, backend API, and frontend app.

---

## Prerequisites
- Docker Desktop installed and running
- Python 3.10+ (for seeding data)
- Node.js 16+ (for frontend/backend)
- Google Gemini API key ([Get one here](https://aistudio.google.com/apikey))

---

## 🚀 Quick Start

### 1. Create Docker Network

First, create a shared Docker network for service communication:

```powershell
# PowerShell
docker network create civicfix-net
```

```bash
# Linux/macOS
docker network create civicfix-net
```

### 2. Start Elasticsearch

Navigate to the `elastic-local` directory and start Elasticsearch:

```powershell
# PowerShell
cd elastic-local
docker-compose up -d
```

```bash
# Linux/macOS/WSL
cd elastic-local
docker-compose up -d
```

**Verify Elasticsearch is running:**
```powershell
# PowerShell
Invoke-RestMethod -Uri "http://localhost:9200" -Method Get
```

```bash
# Linux/macOS
curl http://localhost:9200
```

- Elasticsearch will be available at `http://localhost:9200`

### 3. Seed Elasticsearch with Test Data

Navigate to `elastic-local` and run the seed script:

```powershell
# PowerShell
cd elastic-local
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Set your Gemini API key
$env:GEMINI_API_KEY="your_gemini_api_key_here"
$env:ES_URL="http://localhost:9200"

# Seed 300 documents (adjust count as needed)
python seed.py --count 300
```

```bash
# Linux/macOS
cd elastic-local
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Set your Gemini API key
export GEMINI_API_KEY="your_gemini_api_key_here"
export ES_URL="http://localhost:9200"

# Seed 300 documents (adjust count as needed)
python seed.py --count 300
```

**Verify seeded data:**
```powershell
# PowerShell
Invoke-RestMethod -Uri "http://localhost:9200/issues/_count" -Method Get
```

```bash
# Linux/macOS
curl http://localhost:9200/issues/_count
```

### 4. Start Issue Identifier Service (Docker)

Build and run the Issue Identifier container:

```powershell
# PowerShell
cd ../cloud/Issue_Identifier

# Build the Docker image
docker build -t civicfix-issue-identifier .

# Run the container on civicfix-net network
docker run --name civicfix-issue-identifier --network civicfix-net -e GEMINI_API_KEY=your_gemini_api_key_here -e ES_URL=http://civicfix-es:9200 -p 8000:8000 civicfix-issue-identifier
```

```bash
# Linux/macOS
cd ../cloud/Issue_Identifier

# Build the Docker image
docker build -t civicfix-issue-identifier .

# Run the container on civicfix-net network
docker run --name civicfix-issue-identifier --network civicfix-net -e GEMINI_API_KEY=your_gemini_api_key_here -e ES_URL=http://civicfix-es:9200 -p 8000:8000 civicfix-issue-identifier
```

**Alternative: Run Locally (without Docker)**

If you prefer to run the service locally:

```powershell
# PowerShell
cd cloud/Issue_Identifier
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Create .env file with:
# GEMINI_API_KEY=your_key_here
# ES_URL=http://localhost:9200

# Start the service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Issue Identifier API will be available at `http://localhost:8000`
- API docs at `http://localhost:8000/docs`

### 5. Start Issue Verifier Service (Docker)

Build and run the Issue Verifier container:

```powershell
# PowerShell
cd ../Issue_Verifier

# Build the Docker image
docker build -t civicfix-issue-verifier .

# Run the container on civicfix-net network
docker run --name civicfix-issue-verifier --network civicfix-net -e GEMINI_API_KEY=your_gemini_api_key_here -e ES_URL=http://civicfix-es:9200 -p 8001:8000 civicfix-issue-verifier
```

```bash
# Linux/macOS
cd ../Issue_Verifier

# Build the Docker image
docker build -t civicfix-issue-verifier .

# Run the container on civicfix-net network
docker run --name civicfix-issue-verifier --network civicfix-net -e GEMINI_API_KEY=your_gemini_api_key_here -e ES_URL=http://civicfix-es:9200 -p 8001:8000 civicfix-issue-verifier
```

**Alternative: Run Locally (without Docker)**

If you prefer to run the service locally:

```powershell
# PowerShell
cd cloud/Issue_Verifier
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Create .env file with:
# GEMINI_API_KEY=your_key_here
# ES_URL=http://localhost:9200

# Start the service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

- Issue Verifier API will be available at `http://localhost:8001`
- API docs at `http://localhost:8001/docs`

### 6. Test the Issue Identifier

Test the service with a sample request:

```powershell
# PowerShell
$body = @{
  image_url = "https://storage.googleapis.com/civicfix_issues_bucket/uploads/251fd6d5887a40c38fffc4bd7d260873.jpg"
  description = "roadside garbage"
  location = @{ latitude = 18.5223; longitude = 73.8571 }
  timestamp = "2025-10-19T16:00:00+05:30"
  user_selected_labels = @()
  reported_by = "user:test"
  source = "citizen"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8000/analyze/" -Method Post -ContentType "application/json" -Body $body
$response | ConvertTo-Json

# Verify the issue was indexed in Elasticsearch
Invoke-RestMethod -Uri "http://localhost:9200/issues/_search" -Method Post -ContentType "application/json" -Body "{`"query`": {`"term`": {`"issue_id`": `"$($response.issue_id)`"}}}" | ConvertTo-Json -Depth 10
```

```bash
# Linux/macOS
curl -X POST http://localhost:8000/analyze/ \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://storage.googleapis.com/civicfix_issues_bucket/uploads/251fd6d5887a40c38fffc4bd7d260873.jpg",
    "description": "roadside garbage",
    "location": {"latitude": 18.5223, "longitude": 73.8571},
    "timestamp": "2025-10-19T16:00:00+05:30",
    "user_selected_labels": [],
    "reported_by": "user:test",
    "source": "citizen"
  }'
```

### 7. Start the Backend Server (API)

Navigate to the backend server directory:

```bash
cd frontend/server
npm install  # Only needed the first time or after dependency changes
npm start
```

- This will start the backend API (typically on `http://localhost:3001`)

### 8. Start the Frontend

Open a new terminal and run:

```bash
cd frontend
npm install  # Only needed the first time or after dependency changes
npm run dev
```

- This will start the frontend (typically on `http://localhost:5173`)

---

## 🛑 Stopping Services

**Stop all Docker containers:**
```powershell
# PowerShell
docker stop civicfix-issue-verifier civicfix-issue-identifier civicfix-es
docker rm civicfix-issue-verifier civicfix-issue-identifier
cd elastic-local
docker-compose down
```

```bash
# Linux/macOS
docker stop civicfix-issue-verifier civicfix-issue-identifier civicfix-es
docker rm civicfix-issue-verifier civicfix-issue-identifier
cd elastic-local
docker-compose down
```

**Stop backend and frontend:**
- Press `Ctrl+C` in their respective terminals

---

## 🔍 Verifying Your Setup

1. **Elasticsearch**: `http://localhost:9200` (should return cluster info)
2. **Issue Identifier**: `http://localhost:8000/docs` (Swagger UI)
3. **Issue Verifier**: `http://localhost:8001/docs` (Swagger UI)
4. **Backend API**: `http://localhost:3001` (API endpoints)
5. **Frontend**: `http://localhost:5173` (Web UI)

**Check Docker network:**
```powershell
docker network inspect civicfix-net
```
You should see `civicfix-es`, `civicfix-issue-identifier`, and `civicfix-issue-verifier` listed.

---

## 📝 Notes

- **Docker network**: All services (Elasticsearch, Issue Identifier, Issue Verifier) must be on `civicfix-net` for communication
- **Seeding data**: Run `seed.py` to populate Elasticsearch with test issues and fixes
- **ES_URL**: Use `http://civicfix-es:9200` for Docker containers, `http://localhost:9200` for local scripts
- **Gemini API limits**: Free tier has ~15 RPM, 1M tokens/day
- **Fix documents**: seed.py generates fixes for ~30% of issues by default (configurable with `--fixes-ratio`)

---

## 🐛 Troubleshooting

**Issue Identifier can't connect to Elasticsearch:**
- Verify both containers are on `civicfix-net`: `docker network inspect civicfix-net`
- Check ES_URL is set to `http://civicfix-es:9200` for Docker containers

**Issue Verifier can't find fix documents:**
- Make sure you ran seed.py after creating the fixes index
- Verify fixes exist: `curl http://localhost:9200/fixes/_count`
- Re-run seed.py if needed to generate fix documents with embeddings

**Seed script can't connect:**
- Use `ES_URL=http://localhost:9200` for host-based scripts
- Verify Elasticsearch is running: `curl http://localhost:9200`

**Port conflicts:**
- If port 8000 or 9200 is in use, stop conflicting services or change ports in docker-compose.yml/run commands