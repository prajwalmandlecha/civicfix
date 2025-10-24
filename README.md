# 🏙️ CivicFix - AI-Powered Civic Issue Management Platform

CivicFix is a comprehensive platform that empowers citizens to report civic infrastructure issues and enables NGOs/volunteers to verify fixes using AI-powered image analysis and hybrid retrieval systems. Built with Google Gemini Vision AI, Elasticsearch, Firebase, and React Native.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Setup](#environment-setup)
  - [Running with Docker](#running-with-docker)
  - [Running Locally](#running-locally)
- [Services](#services)
- [API Documentation](#api-documentation)
- [Elasticsearch Schema](#elasticsearch-schema)
- [Mobile App](#mobile-app)
- [Karma System](#karma-system)
- [Troubleshooting](#troubleshooting)

---

## 🌟 Overview

CivicFix addresses the challenge of civic infrastructure management through a three-tier AI-powered system:

1. **Issue Detection**: Citizens upload photos of civic issues (potholes, drainage problems, etc.). Google Gemini Vision AI analyzes images to detect issue types, assess severity, and predict environmental impact.

2. **Hybrid Retrieval**: Elasticsearch's kNN vector search (3072-dim embeddings) combined with geospatial and term filtering retrieves relevant past issues and solutions.

3. **Fix Verification**: NGOs/volunteers submit fix evidence. Gemini validates each fix against original issues with multi-issue verification.

4. **Gamification**: Karma-based leaderboard system rewards active citizens and effective fixers.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Client Applications                          │
├────────────────────────────┬─────────────────────────────────────────┤
│   React Native Mobile App  │   Web Frontend (Vite + HTML/JS)         │
│   - Firebase Auth          │   - Map visualization                   │
│   - Image upload           │   - Issue browsing                      │
│   - Issue reporting        │   - Feed & Leaderboard                  │
└────────────────────────────┴─────────────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────────────┐
│                      Backend Gateway (FastAPI)                       │
│   Port: 3001                                                         │
│   - Firebase auth middleware                                         │
│   - GCS image upload                                                 │
│   - Karma management (Firestore)                                     │
│   - Leaderboards (citizens/NGOs)                                     │
│   - Issue CRUD + upvote/report                                       │
└──────────────────────────────────────────────────────────────────────┘
                              |
        ┌─────────────────────┴──────────────────────┐
        ↓                     ↓                      ↓
┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐
│ Issue          │  │ Issue            │  │ Elasticsearch   │
│ Identifier     │  │ Verifier         │  │ (8.11.1)        │
│ (FastAPI)      │  │ (FastAPI)        │  │                 │
│ Port: 8000     │  │ Port: 8001       │  │ Port: 9200      │
│                │  │                  │  │                 │
│ - Gemini 2.5   │  │ - Gemini 2.5     │  │ Indices:        │
│   Flash Vision │  │   Flash Vision   │  │ - issues        │
│ - Image        │  │ - Multi-issue    │  │ - fixes         │
│   analysis     │  │   verification   │  │                 │
│ - Severity     │  │ - Outcome        │  │ Features:       │
│   scoring      │  │   determination  │  │ - kNN search    │
│ - Weather      │  │ - CO2 tracking   │  │ - geo_distance  │
│   integration  │  │                  │  │ - 3072-dim      │
│ - Hybrid       │  │ - Hybrid         │  │   embeddings    │
│   retrieval    │  │   retrieval      │  │                 │
└────────────────┘  └──────────────────┘  └─────────────────┘
        ↓                     ↓
┌────────────────────────────────────────────────────────────┐
│          Google Gemini API (gemini-2.5-flash)              │
│          Embedding Model (gemini-embedding-001)            │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                   Firebase Services                        │
│   - Authentication (email/password)                        │
│   - Firestore (users, karma, profiles)                     │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│          Google Cloud Storage (civicfix_issues_bucket)     │
│          - Issue images                                    │
│          - Fix verification images                         │
└────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### Core Capabilities
- **AI-Powered Issue Detection**: Gemini Vision automatically identifies 19+ civic issue types from images
- **Hybrid Search**: kNN vector embeddings (3072-dim) + geospatial + term filters for contextual retrieval
- **Weather-Aware Severity**: Dynamic severity scoring based on weather conditions (rainfall, wind, temperature)
- **Multi-Issue Verification**: Validates ALL detected issues in fix submissions, not just primary issue
- **CO2 Impact Tracking**: Estimates environmental impact of unresolved issues and fixes
- **Spam Detection**: Automatic flagging after configurable report thresholds (default: 5 reports)
- **Karma System**: Gamified rewards for reporting, upvoting, and fixing issues
- **Geospatial Search**: Find issues within 5km radius with coordinate-based filtering
- **Leaderboards**: Separate rankings for citizens and NGOs based on contributions

### Issue Types Supported (19 Canonical Labels)
```
DRAIN_BLOCKAGE, FALLEN_TREE, FLOODING_SURFACE, GRAFFITI_VANDALISM,
GREENSPACE_MAINTENANCE, ILLEGAL_CONSTRUCTION_DEBRIS, 
MANHOLE_MISSING_OR_DAMAGED, POWER_POLE_LINE_DAMAGE,
PUBLIC_INFRASTRUCTURE_DAMAGED, PUBLIC_TOILET_UNSANITARY,
ROAD_POTHOLE, SIDEWALK_DAMAGE, SMALL_FIRE_HAZARD,
STRAY_ANIMALS, STREETLIGHT_OUTAGE, TRAFFIC_OBSTRUCTION,
TRAFFIC_SIGN_DAMAGE, WASTE_BULKY_DUMP, WASTE_LITTER_SMALL,
WATER_LEAK_SURFACE
```

---

## 🛠️ Tech Stack

### Backend Services
- **FastAPI** (Python 3.10+) - REST APIs for all services
- **Elasticsearch 8.11.1** - Hybrid search with kNN vectors, geospatial queries
- **Google Gemini 2.5 Flash** - Vision AI for image analysis
- **gemini-embedding-001** - 3072-dimensional text embeddings
- **Firebase Admin SDK** - Authentication and Firestore database
- **Google Cloud Storage** - Image storage
- **Open-Meteo API** - Weather data integration

### Frontend
- **React Native + Expo** - Cross-platform mobile app
- **React 19** - Web frontend components
- **Vite** - Frontend build tool
- **Express.js** - Map server for Elasticsearch integration
- **Axios** - HTTP client with Firebase auth interceptors

### Infrastructure
- **Docker + Docker Compose** - Containerized deployment
- **Python dotenv** - Environment variable management
- **Nominatim** - Reverse geocoding (OpenStreetMap)

---

## 📁 Project Structure

```
civicfix/
├── app/                          # React Native Mobile App
│   ├── src/
│   │   ├── screens/              # Login, Signup, Home, Upload, Profile, etc.
│   │   ├── components/           # Reusable UI components
│   │   ├── services/             # Firebase auth, API client
│   │   └── App.js                # Main app entry point
│   └── package.json              # Expo 54, React Native 0.81
│
├── backend/                      # Main API Gateway
│   ├── main.py                   # FastAPI server (port 3001)
│   └── requirements.txt          # Firebase Admin, AsyncElasticsearch, GCS
│
├── cloud/                        # AI Microservices
│   ├── Issue_Identifier/         # Issue detection service
│   │   ├── app/
│   │   │   ├── main.py           # FastAPI endpoint (/analyze/)
│   │   │   ├── es_client.py      # Hybrid retrieval logic
│   │   │   ├── prompt_templates.py # Gemini prompts
│   │   │   ├── schemas.py        # Pydantic models
│   │   │   └── utils.py          # Image fetch, weather API
│   │   ├── Dockerfile
│   │   └── requirements.txt      # Google GenAI SDK, Elasticsearch
│   │
│   ├── Issue_Verifier/           # Fix verification service
│   │   ├── app/
│   │   │   ├── main.py           # FastAPI endpoint (/verify_fix/)
│   │   │   ├── prompt_template.py # Multi-issue verification prompt
│   │   │   ├── schemas.py        # Pydantic models
│   │   │   └── utils.py          # Image fetch helpers
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   └── cloud_sql/                # Cloud SQL schema (PostgreSQL)
│       └── schema.sql
│
├── elastic-local/                # Elasticsearch Setup
│   ├── docker-compose.yml        # ES 8.11.1 single-node config
│   ├── ES-SCHEMA.md              # Index mappings documentation
│   └── seed.py                   # Test data generation script
│
├── frontend/                     # Web Frontend
│   ├── pages/                    # Feed, Map, Upload, Profile, Leaderboard
│   ├── server/                   # Express.js ES integration server
│   ├── index.html, feed.html, etc.
│   └── vite.config.js
│
├── trash/                        # Experimental Services
│   ├── issue_upvotes.py          # Upvote/Report/Fix submission service
│   └── .env                      # ES credentials, Issue Verifier URL
│
├── secrets/                      # Credentials (gitignored)
│   └── civicfix-********.json    # GCS service account key
│
└── README.md                     # This file
```

---

## 🚀 Getting Started

### Prerequisites

- **Docker Desktop** (for containerized deployment)
- **Python 3.10+** (for local development & seeding)
- **Node.js 16+** (for frontend/backend)
- **Google Gemini API Key** ([Get one here](https://aistudio.google.com/apikey))
- **Firebase Project** with Authentication and Firestore enabled
- **Google Cloud Project** with Storage bucket created

### Environment Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd civicfix
```

2. **Set up Firebase**
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Email/Password authentication
   - Create Firestore database
   - Download service account JSON (for backend)
   - Get Web SDK config (for mobile app)

3. **Set up Google Cloud Storage**
   - Create a storage bucket (e.g., `civicfix_issues_bucket`)
   - Download service account credentials JSON
   - Place in `secrets/` directory

4. **Get Gemini API Key**
   - Visit https://aistudio.google.com/apikey
   - Create API key
   - Save for environment configuration

---

### Running with Docker

#### 1. Create Docker Network
```bash
docker network create civicfix-net
```

#### 2. Start Elasticsearch
```bash
cd elastic-local
docker-compose up -d
```

Verify Elasticsearch is running:
```bash
curl http://localhost:9200
```

#### 3. Seed Test Data
```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export GEMINI_API_KEY="your_gemini_api_key_here"
export ES_URL="http://localhost:9200"

# Seed 300 issues and fixes
python seed.py --count 300
```

Verify seeded data:
```bash
curl http://localhost:9200/issues/_count
curl http://localhost:9200/fixes/_count
```

#### 4. Build and Run Issue Identifier
```bash
cd ../cloud/Issue_Identifier

# Build Docker image
docker build -t civicfix-issue-identifier .

# Run container
docker run --name civicfix-issue-identifier \
  --network civicfix-net \
  -e GEMINI_API_KEY=your_gemini_api_key_here \
  -e ES_URL=http://civicfix-es:9200 \
  -p 8000:8000 \
  civicfix-issue-identifier
```

Verify service:
```bash
curl http://localhost:8000/docs
```

#### 5. Build and Run Issue Verifier
```bash
cd ../Issue_Verifier

# Build Docker image
docker build -t civicfix-issue-verifier .

# Run container
docker run --name civicfix-issue-verifier \
  --network civicfix-net \
  -e GEMINI_API_KEY=your_gemini_api_key_here \
  -e ES_URL=http://civicfix-es:9200 \
  -p 8001:8000 \
  civicfix-issue-verifier
```

Verify service:
```bash
curl http://localhost:8001/docs
```

---

### Running Locally (Development Mode)

#### Backend Gateway (FastAPI)
```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Create .env file with:
# ES_URL=http://localhost:9200
# FIREBASE_CREDENTIALS_PATH=../secrets/civicfix-******.json
# GCS_BUCKET_NAME=civicfix_issues_bucket

# Run server
uvicorn main:app --reload --host 0.0.0.0 --port 3001
```

#### Issue Identifier (Local)
```bash
cd cloud/Issue_Identifier

# Create virtual environment and install
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Create .env file:
# GEMINI_API_KEY=your_key_here
# ES_URL=http://localhost:9200
# GEMINI_MODEL=gemini-2.5-flash
# EMBEDDING_MODEL=gemini-embedding-001

# Run service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Issue Verifier (Local)
```bash
cd cloud/Issue_Verifier

# Setup similar to Issue Identifier
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Create .env file (same as Issue Identifier)

# Run service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

#### Web Frontend
```bash
# Frontend UI
cd frontend
npm install
npm run dev  # Runs on http://localhost:5173

# Map Server (separate terminal)
cd frontend/server
npm install
npm start  # Runs on http://localhost:3001
```

#### Mobile App (React Native)
```bash
cd app

# Install dependencies
npm install

# Update src/services/firebase.js with your Firebase config
# Update src/services/api.js with your backend URL

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run on web
npm run web
```

---

## 🔧 Services

### Issue Identifier (Port 8000)

**Purpose**: AI-powered civic issue detection from images

**Key Features**:
- Gemini Vision image analysis
- 19 canonical issue type detection
- Confidence scoring (0.6-1.0 threshold)
- Severity assessment (0-10 scale) with weather adjustments
- Future impact prediction
- Hybrid retrieval of similar past issues and fixes
- Automatic review flagging for medium-confidence detections
- 3072-dim embedding generation for each issue

**Endpoints**:
- `POST /analyze/` - Analyze issue image and create ES document

**Request Schema**:
```json
{
  "image_url": "string",
  "description": "string",
  "location": {"latitude": float, "longitude": float},
  "timestamp": "ISO 8601 string",
  "user_selected_labels": ["DRAIN_BLOCKAGE", ...],
  "reported_by": "firebase_uid",
  "source": "citizen|anonymous",
  "uploader_display_name": "string"
}
```

**Response**: Detected issues with types, confidence, severity scores, predicted fixes

---

### Issue Verifier (Port 8001)

**Purpose**: Verify fix submissions against original issues

**Key Features**:
- Multi-issue verification (validates ALL detected issues)
- Evidence-based assessment using image indices
- Lenient "yes" criteria (partial fixes accepted)
- Strict "no" criteria (only when completely unfixed)
- Outcome determination: `closed` (all fixed) or `rejected` (any unfixed)
- CO2 savings calculation
- Success rate scoring
- Hybrid retrieval of similar fixes for context
- Auto-updates issue status in Elasticsearch

**Endpoints**:
- `POST /verify_fix/` - Verify fix submission with images

**Request Schema**:
```json
{
  "issue_id": "uuid",
  "ngo_id": "firebase_uid",
  "image_urls": ["url1", "url2", ...],
  "fix_description": "string",
  "timestamp": "ISO 8601 string"
}
```

**Response**: Per-issue verification results, overall outcome, suggested success rate

---

### Backend Gateway (Port 3001)

**Purpose**: Main API gateway with Firebase auth and Firestore integration

**Key Features**:
- Firebase JWT authentication middleware
- GCS image upload with UUID naming
- Karma management system (Firestore)
- Leaderboard rankings (top 10 citizens/NGOs)
- Issue CRUD operations
- Upvote/report tracking with spam detection
- Fix submission workflow
- Geocoding with Nominatim + caching
- User statistics and rank calculation

**Key Endpoints**:
```
POST   /submit-issue           # Upload issue, call Issue Identifier
GET    /api/issues             # List issues (geo-filtered, paginated)
GET    /api/issues/{id}        # Get single issue
POST   /api/issues/{id}/upvote # Upvote issue (+5 karma to reporter)
POST   /api/issues/{id}/report # Report spam (threshold: 3 reports)
POST   /api/issues/{id}/submit-fix # Submit fix, call Issue Verifier
GET    /api/issues/latest      # Latest 20 issues
GET    /api/leaderboard/citizens # Top 10 citizens by karma
GET    /api/leaderboard/ngos   # Top 10 NGOs by karma
GET    /api/users/{uid}/stats  # User statistics
```

---

### Elasticsearch (Port 9200)

**Indices**:

#### `issues` Index
- **Fields**: issue_id, reported_by, status, location (geo_point), description, text_embedding (3072-dim), detected_issues (nested), issue_types, severity_score, upvotes, reports, is_spam, evidence_ids
- **Search Types**: kNN vector, geo_distance (5km), term filters, date range

#### `fixes` Index
- **Fields**: fix_id, issue_id, created_by, title, description, image_urls, co2_saved, success_rate, related_issue_types, fix_outcomes (nested), text_embedding (3072-dim)
- **Search Types**: kNN vector, term filters on related_issue_types

---

## 📚 API Documentation

Interactive API docs available at:
- Issue Identifier: `http://localhost:8000/docs`
- Issue Verifier: `http://localhost:8001/docs`
- Backend Gateway: `http://localhost:3001/docs` (if FastAPI endpoint added)

---

## 🗄️ Elasticsearch Schema

Full schema documentation in `elastic-local/ES-SCHEMA.md`

### Issues Index Key Fields
```jsonc
{
  "issue_id": "uuid",
  "status": "open|closed|verified",
  "location": {"lat": float, "lon": float},
  "text_embedding": [3072 floats],  // gemini-embedding-001
  "detected_issues": [
    {
      "type": "ROAD_POTHOLE",
      "confidence": 0.92,
      "severity": "high",
      "severity_score": 8.5,
      "future_impact": "text",
      "predicted_fix": "text",
      "auto_review_flag": false
    }
  ],
  "issue_types": ["ROAD_POTHOLE", ...],
  "severity_score": 8.5,
  "upvotes": {"open": 15, "closed": 3},
  "reports": {"open": 2, "closed": 0},
  "is_spam": false,
  "evidence_ids": ["fix_id1", ...]
}
```

### Fixes Index Key Fields
```jsonc
{
  "fix_id": "issue_id:ngo_id",
  "related_issue_types": ["ROAD_POTHOLE"],
  "text_embedding": [3072 floats],
  "fix_outcomes": [
    {
      "issue_type": "ROAD_POTHOLE",
      "fixed": "yes",
      "confidence": 0.95,
      "evidence_photos": [0, 1, 2],
      "notes": "Pothole filled completely"
    }
  ],
  "co2_saved": 120.5,
  "success_rate": 0.95
}
```

---

## 📱 Mobile App

Built with **React Native + Expo 54**, the mobile app provides a native experience for iOS and Android.

### Features
- Firebase email/password authentication
- Camera integration with `expo-image-picker`
- Map-based issue browsing (`@react-native-maps`)
- Issue submission with location tagging
- Profile management with karma display
- Leaderboard view
- Issue feed with upvote/report actions

### Configuration
Update `app/src/services/firebase.js` with your Firebase config:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  // ... other config
};
```

Update `app/src/services/api.js` with your backend URL:
```javascript
const api = axios.create({
  baseURL: "http://YOUR_BACKEND_IP:3001",
});
```

---

## 🏆 Karma System

CivicFix uses a gamified karma system to encourage civic participation:

### Karma Rewards
- **+10 karma**: First issue submission
- **+5 karma**: Issue receives upvote (to reporter)
- **+10-20 karma**: Successful fix submission (based on outcome quality)

### Spam Prevention
- **3 reports threshold**: Issue automatically closed
- **3 reports on closed issue**: Issue reopened for review
- **Configurable threshold**: Modify in `backend/main.py` or `trash/issue_upvotes.py` (currently 5)

### Leaderboards
- **Citizens**: Ranked by issues reported + upvotes received
- **NGOs**: Ranked by fixes submitted + success rates
- **Top 10**: Displayed on web and mobile app

---

## 🐛 Troubleshooting

### Elasticsearch Connection Issues
**Problem**: Services can't connect to ES
**Solution**:
- For Docker: Ensure all services on `civicfix-net` network
  ```bash
  docker network inspect civicfix-net
  ```
- Use `http://civicfix-es:9200` for containers
- Use `http://localhost:9200` for host-based scripts
- Check ES logs: `docker logs civicfix-es`

### Gemini API Rate Limits
**Problem**: 429 errors or quota exceeded
**Solution**:
- Free tier: 15 RPM, 1M tokens/day
- Add exponential backoff (already implemented in `call_gemini_with_backoff()`)
- Consider upgrading to paid tier
- Reduce seed count when testing

### kNN Search Failures
**Problem**: "dimension mismatch" or empty results
**Solution**:
- Verify embedding dimension is 3072 (`gemini-embedding-001`)
- Check `text_embedding` field exists in ES mapping
- Re-run seed script to regenerate embeddings
- Verify ES version supports kNN (8.0+)

### Firebase Auth Issues
**Problem**: 401 Unauthorized in mobile app
**Solution**:
- Verify Firebase config in `app/src/services/firebase.js`
- Check token expiration (refresh token logic)
- Ensure backend has correct service account JSON path
- Test with Postman using valid JWT token

### Image Upload Failures
**Problem**: GCS upload errors or 413 Entity Too Large
**Solution**:
- Check GCS credentials JSON path in backend `.env`
- Verify bucket permissions (Storage Object Creator role)
- Ensure images < 10MB (recommended)
- Check network connectivity to `storage.googleapis.com`

### Docker Container Won't Start
**Problem**: Container exits immediately
**Solution**:
- Check logs: `docker logs <container_name>`
- Verify environment variables are set
- Ensure ports 8000, 8001, 9200 not already in use
- Check Docker network: `docker network ls`

### Seed Script Errors
**Problem**: Embedding generation fails or timeouts
**Solution**:
- Verify `GEMINI_API_KEY` is valid
- Reduce `--count` to avoid rate limits
- Check internet connectivity
- Ensure ES is running before seeding
- Use `--fixes-ratio 0.3` to control fix density

---

## 📖 Additional Resources

- **Gemini API Docs**: https://ai.google.dev/docs
- **Elasticsearch Guide**: https://www.elastic.co/guide/en/elasticsearch/reference/8.11/
- **Firebase Docs**: https://firebase.google.com/docs
- **React Native Expo**: https://docs.expo.dev/
- **FastAPI Docs**: https://fastapi.tiangolo.com/

---

## 📄 License

This project is for educational and demonstration purposes. Please ensure you comply with all third-party service terms (Google Cloud, Firebase, Elasticsearch) when deploying.

---

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request with detailed description

For bugs or feature requests, open an issue on GitHub.

---

**Built with ❤️ for better cities**
