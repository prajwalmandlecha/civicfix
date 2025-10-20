# CivicFix Issue Verifier

The **Issue Verifier** service validates fix submissions by analyzing evidence images and comparing them against original issue reports. It uses Google Gemini's multimodal AI to assess fix quality, completeness, and authenticity.

---

## 🎯 Overview

The Issue Verifier:
- **Validates fixes** submitted by NGOs/volunteers with photographic evidence
- **Retrieves context** from Elasticsearch using kNN vector search + filters
- **Analyzes images** using Google Gemini 2.5 Flash multimodal model
- **Generates verification reports** with confidence scores and detailed assessments
- **Stores fix documents** in Elasticsearch with embeddings for future retrieval
- **Updates issue status** when fixes are verified

---

## 🚀 Quick Start (Docker - Recommended)

### Prerequisites
- Docker Desktop installed and running
- `civicfix-net` Docker network created
- Elasticsearch running on `civicfix-net` (container name: `civicfix-es`)
- Google Gemini API key ([Get one here](https://aistudio.google.com/apikey))

### 1. Build Docker Image

```powershell
# PowerShell
cd cloud/Issue_Verifier
docker build -t civicfix-issue-verifier .
```

```bash
# Linux/macOS
cd cloud/Issue_Verifier
docker build -t civicfix-issue-verifier .
```

### 2. Run Container on civicfix-net

```powershell
# PowerShell
docker run --name civicfix-issue-verifier `
  --network civicfix-net `
  -e GEMINI_API_KEY=your_gemini_api_key_here `
  -e ES_URL=http://civicfix-es:9200 `
  -p 8001:8000 `
  -d `
  civicfix-issue-verifier
```

```bash
# Linux/macOS
docker run --name civicfix-issue-verifier \
  --network civicfix-net \
  -e GEMINI_API_KEY=your_gemini_api_key_here \
  -e ES_URL=http://civicfix-es:9200 \
  -p 8001:8000 \
  -d \
  civicfix-issue-verifier
```

### 3. Verify Service is Running

```powershell
# PowerShell
# Check container status
docker ps | Select-String civicfix-issue-verifier

# Check logs
docker logs civicfix-issue-verifier

# Test API
Invoke-RestMethod -Uri "http://localhost:8001/docs" -Method Get
```

```bash
# Linux/macOS
# Check container status
docker ps | grep civicfix-issue-verifier

# Check logs
docker logs civicfix-issue-verifier

# Test API
curl http://localhost:8001/docs
```

- **API Base URL**: `http://localhost:8001`
- **Swagger UI**: `http://localhost:8001/docs`
- **OpenAPI Schema**: `http://localhost:8001/openapi.json`

---

## 🖥️ Local Development Setup (Alternative)

If you prefer to run the service locally without Docker:

### 1. Create Virtual Environment

```powershell
# PowerShell
cd cloud/Issue_Verifier
python -m venv .venv
.venv\Scripts\Activate.ps1
```

```bash
# Linux/macOS
cd cloud/Issue_Verifier
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file in the `Issue_Verifier` directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
EMBED_MODEL=gemini-embedding-001
ES_URL=http://localhost:9200
ISSUES_INDEX=issues
FIXES_INDEX=fixes
```

**Important**: When running locally (not in Docker), use `ES_URL=http://localhost:9200` to connect to Elasticsearch on your host machine.

### 4. Start the Service

```powershell
# PowerShell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

```bash
# Linux/macOS
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

---

## 🧪 Testing the Service

### Test with an Existing Issue

First, make sure you have seeded issues and fixes:

```powershell
# PowerShell - Seed data with fixes
cd ../../elastic-local
python seed.py --count 50
```

Then test the verifier with a sample fix submission:

```powershell
# PowerShell
$body = @{
  issue_id = "94cfc989-357b-4ab4-99e4-261cb810fdda"  # Replace with actual issue_id from your ES
  ngo_id = "ngo:test_org"
  image_urls = @(
    "https://storage.googleapis.com/civicfix_issues_bucket/uploads/251fd6d5887a40c38fffc4bd7d260873.jpg"
  )
  fix_description = "Cleaned up the garbage pile and disposed waste properly"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8001/verify_fix/" -Method Post -ContentType "application/json" -Body $body
$response | ConvertTo-Json -Depth 10
```

```bash
# Linux/macOS
curl -X POST http://localhost:8001/verify_fix/ \
  -H "Content-Type: application/json" \
  -d '{
    "issue_id": "94cfc989-357b-4ab4-99e4-261cb810fdda",
    "ngo_id": "ngo:test_org",
    "image_urls": [
      "https://storage.googleapis.com/civicfix_issues_bucket/uploads/251fd6d5887a40c38fffc4bd7d260873.jpg"
    ],
    "fix_description": "Cleaned up the garbage pile and disposed waste properly"
  }'
```

### Expected Response

```json
{
  "fix_id": "uuid-here",
  "issue_id": "94cfc989-357b-4ab4-99e4-261cb810fdda",
  "overall_status": "verified",
  "overall_confidence": 0.85,
  "per_issue_results": [
    {
      "issue_type": "overflowing_garbage_bin",
      "fixed": "yes",
      "confidence": 0.9,
      "notes": "Area appears clean with waste properly removed"
    }
  ],
  "created_at": "2025-10-20T12:34:56Z"
}
```

---

## 📋 API Endpoints

### `POST /verify_fix/`

Submit a fix verification request with evidence images.

**Request Body:**
```json
{
  "issue_id": "string (UUID)",
  "ngo_id": "string",
  "image_urls": ["string (URL)", ...],
  "fix_description": "string"
}
```

**Response:**
```json
{
  "fix_id": "string (UUID)",
  "issue_id": "string (UUID)",
  "overall_status": "verified | partial | rejected",
  "overall_confidence": 0.0-1.0,
  "per_issue_results": [
    {
      "issue_type": "string",
      "fixed": "yes | partial | no",
      "confidence": 0.0-1.0,
      "notes": "string"
    }
  ],
  "created_at": "ISO 8601 timestamp"
}
```

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "Issue Verifier",
  "elasticsearch": "connected",
  "gemini": "configured"
}
```

---

## 🔍 How It Works

### 1. **Hybrid Context Retrieval**
- Generates embedding from issue description + fix description
- Performs **kNN vector search** with filters on the `fixes` index
- Filters by `related_issue_types` to find relevant historical fixes
- Falls back to traditional filtered search if embeddings are unavailable

### 2. **Multimodal Analysis**
- Fetches original issue images from storage
- Combines issue images + fix evidence images
- Sends all images to Google Gemini 2.5 Flash
- Uses structured JSON prompts for consistent responses

### 3. **Verification Assessment**
- Analyzes image quality, authenticity, and completeness
- Compares before/after states
- Generates per-issue-type verification results
- Calculates overall confidence scores

### 4. **Data Storage**
- Creates fix document in `fixes` index with embedding
- Updates original issue with `evidence_ids` and status
- Links fixes to issues for future context retrieval

---

## 🛠️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | **(required)** | Google AI Studio API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model for verification |
| `EMBED_MODEL` | `gemini-embedding-001` | Model for text embeddings (3072 dims) |
| `ES_URL` | `http://localhost:9200` | Elasticsearch connection URL |
| `ISSUES_INDEX` | `issues` | Elasticsearch index for issues |
| `FIXES_INDEX` | `fixes` | Elasticsearch index for fixes |

### Docker Network Requirements

The Issue Verifier must be on the same Docker network as Elasticsearch for container-to-container communication:

```bash
# Verify network connectivity
docker network inspect civicfix-net
```

You should see:
- `civicfix-es` (Elasticsearch)
- `civicfix-issue-identifier` (optional)
- `civicfix-issue-verifier`

---

## 🐛 Troubleshooting

### Issue: "Issue not found in Elasticsearch"

**Solution:**
- Verify the issue exists: `curl http://localhost:9200/issues/_doc/{issue_id}`
- Check that issues have been seeded: `curl http://localhost:9200/issues/_count`
- Re-run seed script if needed

### Issue: "ES hybrid search failed" or "kNN vector search failed"

**Causes:**
- Fix documents don't have embeddings (text_embedding is null)
- Fixes index is empty

**Solution:**
1. Check if fixes exist and have embeddings:
```powershell
Invoke-RestMethod -Uri "http://localhost:9200/fixes/_search" -Method Post -ContentType "application/json" -Body '{"size": 1, "_source": ["fix_id", "text_embedding"]}' | ConvertTo-Json -Depth 5
```

2. Re-seed with fixes:
```bash
cd elastic-local
python seed.py --count 100  # This will generate fixes for ~30% of issues
```

3. The service will automatically fall back to traditional search if vector search fails

### Issue: "Embedding call failed"

**Causes:**
- Invalid or missing `GEMINI_API_KEY`
- API rate limits exceeded (15 RPM for free tier)
- Network connectivity issues

**Solution:**
- Verify your API key is correct
- Check Gemini API quota at [Google AI Studio](https://aistudio.google.com/)
- Add delays between requests if hitting rate limits

### Issue: Container can't connect to Elasticsearch

**Causes:**
- Containers not on same Docker network
- Incorrect `ES_URL` configuration

**Solution:**
```bash
# Verify containers are on civicfix-net
docker network inspect civicfix-net

# Use correct ES_URL for containers
ES_URL=http://civicfix-es:9200  # For Docker containers
ES_URL=http://localhost:9200    # For local development
```

### Issue: "Failed to fetch image from URL"

**Causes:**
- Image URLs are not publicly accessible
- Network/firewall blocking requests
- Invalid or expired URLs

**Solution:**
- Verify image URLs are accessible: `curl -I {image_url}`
- Use publicly accessible storage (Google Cloud Storage, AWS S3, etc.)
- Check firewall/proxy settings

---

## 📊 Performance Considerations

- **Gemini API Limits**: Free tier has ~15 RPM, 1M tokens/day
- **Image Size**: Keep images under 10MB for faster processing
- **Batch Processing**: Consider rate limiting for bulk verifications
- **Vector Search**: Requires embeddings in fix documents for optimal performance
- **Fallback Mode**: Traditional search works without embeddings but is less accurate

---

## 🔐 Security Notes

- **API Key**: Never commit `GEMINI_API_KEY` to version control
- **Network Isolation**: Use Docker networks for service isolation
- **Input Validation**: All inputs are validated via Pydantic schemas
- **Image Sources**: Verify image URLs come from trusted sources
- **Rate Limiting**: Implement rate limiting in production environments

---

## 📚 Related Services

- **Issue Identifier** (`cloud/Issue_Identifier`): Analyzes and categorizes civic issues from images
- **Elasticsearch** (`elastic-local`): Data storage and hybrid search
- **seed.py** (`elastic-local/seed.py`): Generates test data including fixes with embeddings

---

## 📖 API Documentation

Once the service is running, access interactive API documentation at:

- **Swagger UI**: `http://localhost:8001/docs`
- **ReDoc**: `http://localhost:8001/redoc`
- **OpenAPI JSON**: `http://localhost:8001/openapi.json`

---

## 🤝 Contributing

When modifying the Issue Verifier:

1. Update the Dockerfile if adding new dependencies
2. Test both Docker and local setups
3. Update this README with any new configuration or features
4. Ensure kNN vector search with fallback works correctly
5. Test with various issue types and image scenarios

---

## 📝 License

Part of the CivicFix platform. See main repository for license information.
