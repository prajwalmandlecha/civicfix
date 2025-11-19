# 🏙️ CivicFix

> **AI-Powered Civic Infrastructure Management Platform**  
> Empowering citizens to report urban issues and NGOs to verify fixes using Google Gemini Vision AI, hybrid vector search, and gamification.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.118-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=flat&logo=react)](https://reactnative.dev/)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.11-005571?style=flat&logo=elasticsearch)](https://www.elastic.co/)
[![Firebase](https://img.shields.io/badge/Firebase-Admin-FFCA28?style=flat&logo=firebase)](https://firebase.google.com/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-8E75B2?style=flat&logo=google)](https://ai.google.dev/)

---

## 🎯 What is CivicFix?

CivicFix transforms civic issue management into an intelligent, community-driven ecosystem. Citizens photograph infrastructure problems—potholes, blocked drains, broken streetlights and our AI instantly identifies issue types, assesses severity based on real-time weather data, and predicts environmental impact. NGOs verify fixes through multi-issue AI validation, while a karma-based gamification system rewards civic participation.

**The Power of Hybrid Intelligence:**
- 🤖 **Gemini Vision AI** analyzes images to detect 20+ civic issue types with confidence scoring
- 🧠 **3072-dim Vector Embeddings** enable semantic search across relevant historical issues
- 🌍 **Geospatial Queries** find issues within 5km radius with precision filtering
- ⚖️ **Weather-Aware Severity** adjusts risk scores based on rainfall, temperature, and wind
- ♻️ **CO2 Impact Tracking** quantifies environmental consequences of unresolved issues

---

## 🏗️ Architecture

![CivicFix Architecture](doc/civicfix_architecture.png)

### **Microservices Flow**

#### **1. Authentication Flow**
```
📱 Client (Expo App / Web Dashboard)
    ↓ (Email + Password)
🔥 Firebase Authentication
    ↓ (Returns JWT Token)
📱 Client (Stores Token)
    ↓ (All API Requests: Authorization: Bearer <token>)
🔐 Backend Gateway (Verifies Firebase JWT)
```

#### **2. Issue Reporting Flow**
```
📱 Client
    ↓ (Upload: Image + GPS + Description + Labels)
🔐 Backend Gateway
    ↓ (Upload Image → GCS with UUID)
    ↓ (Prepare Payload: image_url, location, description, labels, user_id)
    ↓ (POST /analyze/)
🤖 Issue Identifier Service
    ↓ (Fetch Image + Weather Data)
    ↓ (Hybrid Search: kNN Vector + Geo + Term Filters)
📊 Elasticsearch (Retrieve Similar Issues & Fixes)
    ↓ (Return Context to Issue Identifier)
🤖 Issue Identifier
    ↓ (Gemini Vision AI Analysis with Context)
    ↓ (Generate 3072-dim Embedding)
    ↓ (Index New Issue Document)
📊 Elasticsearch (Store Issue + Embedding)
    ↓ (Return Analysis Results)
🔐 Backend Gateway
    ↓ (Award First Post Karma if applicable)
🎯 Firestore (Update User Metadata: karma, stats)
    ↓ (Send Response to Client)
📱 Client (Display Detected Issues)
```

#### **3. Browse Issues Flow (Feed/Map/Profile)**
```
📱 Client
    ↓ (GET /api/issues?latitude=X&longitude=Y&radius_km=5)
🔐 Backend Gateway
    ↓ (Verify Firebase Token)
    ↓ (Query Issues by Geo + Filters)
📊 Elasticsearch (Execute Geo Query + Pagination)
    ↓ (Return Matching Issues)
🔐 Backend Gateway
    ↓ (Fetch User Metadata if needed)
🎯 Firestore (Get Reporter Names, Karma)
    ↓ (Merge Data)
🔐 Backend Gateway
    ↓ (Return Enriched Issue List)
📱 Client (Render Feed/Map/Profile)
```

#### **4. Upvote/Report Flow**
```
📱 Client
    ↓ (POST /api/issues/{id}/upvote or /report)
🔐 Backend Gateway
    ↓ (Verify Firebase Token)
    ↓ (Update Upvote/Report Count)
📊 Elasticsearch (Update Issue Document)
    ↓ (Check Spam Threshold: reports.open >= 5)
    ↓ (Auto-close if spam detected)
🔐 Backend Gateway
    ↓ (Award +5 Karma to Reporter on Upvote)
🎯 Firestore (Increment Reporter's Karma)
    ↓ (Return Updated Counts)
📱 Client (Update UI)
```

#### **5. Fix Submission Flow**
```
📱 Client (NGO)
    ↓ (Upload: Multiple Images + Description + Issue ID)
🔐 Backend Gateway
    ↓ (Verify Firebase Token + NGO UserType)
    ↓ (Upload Images → GCS with UUIDs)
    ↓ (Prepare Payload: issue_id, image_urls[], description, ngo_id)
    ↓ (POST /verify_fix/)
✅ Issue Verifier Service
    ↓ (Fetch Original Issue Document)
📊 Elasticsearch (GET /issues/{issue_id})
    ↓ (Return Issue with Detected Issues List)
✅ Issue Verifier
    ↓ (Hybrid Search: Similar Fixes by Issue Type)
📊 Elasticsearch (Retrieve Fix Context)
    ↓ (Return Similar Fixes)
✅ Issue Verifier
    ↓ (Gemini Vision AI: Multi-Issue Validation)
    ↓ (Validate Each Detected Issue: yes/partial/no)
    ↓ (Generate 3072-dim Embedding for Fix)
    ↓ (Determine Overall Outcome: closed/rejected)
    ↓ (Create Fix Document)
📊 Elasticsearch (Index Fix + Update Issue Status)
    ↓ (Update: status, closed_by, closed_at, evidence_ids)
    ↓ (Return Verification Results)
🔐 Backend Gateway
    ↓ (Award Karma Based on Success Rate: +10 to +20)
🎯 Firestore (Update NGO: karma, issues_resolved, co2_saved)
    ↓ (Return Verification Response)
📱 Client (Show Fix Result Modal with Retry Option)
```

#### **6. Leaderboard Flow**
```
📱 Client
    ↓ (GET /api/leaderboard/citizens or /ngos)
🔐 Backend Gateway
    ↓ (Query Firestore: Top 10 by Karma)
🎯 Firestore (ORDER BY karma DESC LIMIT 10)
    ↓ (Return Top Users)
🔐 Backend Gateway
    ↓ (Return Leaderboard)
📱 Client (Render Rankings)
```

### **Service Responsibilities**

| Service | Port | Responsibilities | External Dependencies |
|---------|------|------------------|---------------------|
| **Backend Gateway** | 8000 | JWT verification, CRUD operations, karma management, GCS uploads, geocoding | Firebase Auth, Firestore, GCS, Nominatim |
| **Issue Identifier** | 8000 (Cloud) | Image analysis, issue detection, hybrid search, embedding generation, ES indexing | Gemini Vision API, Elasticsearch, Open-Meteo API |
| **Issue Verifier** | 8001 (Cloud) | Fix validation, multi-issue verification, fix indexing, status updates | Gemini Vision API, Elasticsearch |
| **Elasticsearch** | 9200 | Vector search (kNN), geospatial queries, full-text search, document storage | - |
| **Firestore** | - | User profiles, karma, leaderboards, real-time sync | Firebase SDK |

---

## ✨ Key Features

### 🔍 Intelligent Issue Detection
- **Multi-Label AI Recognition**: Identifies all 20 civic issue types from a single image (potholes + drainage + litter simultaneously)
- **Confidence Thresholding**: Auto-flags detections between 0.6-0.85 for manual review; rejects <0.6
- **Cross-Validation**: Verifies user-selected labels against actual image content to prevent false positives
- **Context-Aware Severity**: Weather API integration adjusts severity scores (e.g., pothole severity increases during monsoon)

### 🔎 Hybrid Search Engine
- **Vector Embeddings**: 3072-dimensional semantic representations via `gemini-embedding-001`
- **Triple-Layer Filtering**: kNN similarity + geospatial radius (5km) + term matching (issue types, status)
- **Evidence Retrieval**: Surfaces similar past issues and successful fixes to guide AI predictions
- **Real-Time Indexing**: Sub-second document insertion with automatic embedding generation

### ✅ Multi-Issue Verification
- **Comprehensive Validation**: Verifies ALL detected issues (e.g., if pothole+litter reported, fix must address both)
- **Evidence-Based Scoring**: AI references specific image indices (e.g., "Photo 2 shows pothole filled")
- **Lenient Acceptance Criteria**: Partial fixes accepted; only completely unaddressed issues trigger rejection
- **Auto-Status Management**: Updates Elasticsearch + Firestore atomically upon verification completion

### 🏆 Gamification System
- **Karma Rewards**: +10 first post, +5 per upvote, +10-20 per verified fix
- **Dual Leaderboards**: Separate rankings for citizens (issue reporters) and NGOs (fixers)
- **Spam Detection**: Auto-closes issues after 5 reports; auto-reopens closed issues after 3 re-reports
- **Profile Analytics**: Real-time stats (issues reported, CO2 saved, rank percentile)

### 🌐 Cross-Platform Access
- **Mobile App**: React Native + Expo 54 for iOS/Android with offline-first architecture
- **Web Dashboard**: Vite + vanilla JS for NGO fix uploads and map visualization
- **Real-Time Sync**: Firebase Firestore listeners for instant leaderboard updates

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **AI/ML** | Google Gemini 2.5 Flash | Vision analysis, multi-issue detection, fix verification |
| | gemini-embedding-001 | 3072-dim text embeddings for semantic search |
| | Open-Meteo API | Weather data for severity adjustments |
| **Backend** | FastAPI (Python 3.10+) | Async REST APIs with automatic OpenAPI docs |
| | Firebase Admin SDK | JWT authentication, Firestore database |
| | Google Cloud Storage | Blob storage for issue/fix images |
| | Nominatim (OSM) | Reverse geocoding with in-memory caching |
| **Database** | Elasticsearch 8.11.1 | kNN vector search, geo queries, full-text search |
| | Firestore | User profiles, karma, leaderboards |
| **Frontend** | React Native 0.81 | Native mobile UI (Expo 54 SDK) |
| | Vanilla JS + Vite | Lightweight web dashboard |
| | React Native Maps | Google Maps integration for geospatial browsing |
| **DevOps** | Docker + Compose | Containerized deployment |
| | Uvicorn | ASGI server with auto-reload |

**Key Dependencies:**
- `elasticsearch[async]==8.11.1` - Async client with kNN support
- `google-genai` - Official Gemini SDK with vision capabilities
- `firebase-admin==7.1.0` - Server-side Firebase SDK
- `pydantic==2.11.9` - Request/response validation with JSON schema
- `axios` - HTTP client with Firebase auth interceptors

---

## 📁 Project Structure

```
civicfix/
├── app/                              # 📱 React Native Mobile App (Expo 54)
│   ├── src/
│   │   ├── screens/                  # Login, Signup, Home, Upload, Profile, Leaderboard
│   │   │   ├── HomeScreen.js         # Issue feed with filters & pagination
│   │   │   ├── IssueUploadScreen.js  # Camera integration + AI analysis
│   │   │   ├── FixUploadScreen.js    # Multi-image fix submission
│   │   │   ├── LocationScreen.js     # Google Maps with geospatial clustering
│   │   │   └── ProfileScreen.js      # User stats, karma, rank display
│   │   ├── components/               # Reusable UI components
│   │   │   ├── SocialPost.js         # Issue card with upvote/report actions
│   │   │   ├── IssueDetailModal.js   # Full issue details + fix submission
│   │   │   ├── FixResultModal.js     # AI verification results with retry
│   │   │   ├── UploadProgressModal.js # Multi-step upload feedback
│   │   │   └── FilterModal.js        # Advanced filtering (status, severity, types)
│   │   ├── services/
│   │   │   ├── firebase.js           # Firebase config + auth initialization
│   │   │   ├── api.js                # Axios instance with JWT interceptors
│   │   │   └── getLocation.js        # GPS + geocoding utilities
│   │   ├── hooks/
│   │   │   ├── useImagePicker.js     # Camera/gallery selection
│   │   │   ├── useLocation.js        # Location permission + tracking
│   │   │   └── useUpload.js          # Multi-step upload state management
│   │   ├── context/
│   │   │   └── UserContext.js        # Global user state (profile, karma, location)
│   │   └── utils/
│   │       ├── issueTypeMapping.js   # Issue type constants + display names
│   │       └── notify.js             # Toast notifications
│   └── package.json                  # Expo 54, React Native 0.81, React 19
│
├── backend/                          # 🔐 Main API Gateway (FastAPI)
│   ├── main.py                       # Application entry point with lifespan events
│   ├── config/
│   │   └── settings.py               # Environment variables + config management
│   ├── core/
│   │   ├── database.py               # ES + Firebase initialization
│   │   ├── security.py               # JWT middleware + auth dependencies
│   │   └── dependencies.py           # FastAPI dependency injection exports
│   ├── routers/
│   │   ├── issues.py                 # Issue CRUD, upvote/report, geospatial queries
│   │   ├── fixes.py                  # Fix submission + verification workflow
│   │   └── users.py                  # Leaderboards, user stats, karma management
│   ├── services/
│   │   ├── analyzer_service.py       # Issue Identifier + Verifier API calls
│   │   ├── storage_service.py        # GCS upload with UUID naming
│   │   ├── geocoding_service.py      # Nominatim reverse geocoding + cache
│   │   ├── user_service.py           # Karma awards, display names
│   │   └── firestore_service.py      # Centralized Firestore operations
│   ├── models/
│   │   ├── common.py                 # Shared Pydantic models (Location, etc.)
│   │   ├── issue.py                  # Issue request/response schemas
│   │   ├── fix.py                    # Fix submission schemas
│   │   └── user.py                   # User profile models
│   └── requirements.txt              # FastAPI, Elasticsearch, Firebase Admin
│
├── cloud/                            # ☁️ AI Microservices
│   ├── Issue_Identifier/             # 🤖 Issue Detection Service (Port 8000)
│   │   ├── app/
│   │   │   ├── main.py               # /analyze/ endpoint with retry logic
│   │   │   ├── es_client.py          # Hybrid retrieval (kNN + geo + term)
│   │   │   ├── prompt_templates.py   # Gemini vision prompts
│   │   │   ├── schemas.py            # Pydantic models for detection
│   │   │   └── utils.py              # Image fetch, weather API integration
│   │   ├── Dockerfile                # Production container config
│   │   └── requirements.txt          # google-genai, elasticsearch==8.11.1
│   │
│   ├── Issue_Verifier/               # ✅ Fix Verification Service (Port 8001)
│   │   ├── app/
│   │   │   ├── main.py               # /verify_fix/ endpoint
│   │   │   ├── prompt_template.py    # Multi-issue verification prompts
│   │   │   ├── schemas.py            # VerifyIn/Out models
│   │   │   └── utils.py              # Image fetch, fix ID generation
│   │   ├── Dockerfile
│   │   └── requirements.txt          # google-genai, elasticsearch==8.11.1
│   │
│   └── cloud_sql/                    # (Optional) PostgreSQL schemas
│       └── schema.sql
│
├── elastic-local/                    # 📊 Elasticsearch Setup
│   ├── docker-compose.yml            # ES 8.11.1 single-node config
│   ├── ES-SCHEMA.md                  # Detailed index mappings + field docs
│   └── seed_civicfix.py              # Test data generator (300+ issues)
│
├── frontend/                         # 🌐 Web Dashboard
│   ├── pages/
│   │   ├── feed.js                   # Issue feed with modal details
│   │   ├── map.js                    # Google Maps with clustering
│   │   ├── upload.js                 # Citizen issue upload
│   │   ├── ngo_upload.js             # NGO fix upload
│   │   ├── profile.js                # User profile + stats
│   │   └── leaderboard.js            # Top 10 citizens + NGOs
│   ├── styles/                       # Modular CSS (dark mode support)
│   ├── index.html, feed.html, etc.   # Entry points
│   └── vite.config.js                # Build configuration
│
├── doc/
│   └── civicfix_architecture.png     # System architecture diagram
│
└── secrets/                          # 🔒 Credentials (gitignored)
    └── civicfix-*.json               # GCS + Firebase service account keys
```

**Modular Backend Architecture:**
- **Separation of Concerns**: Routers → Services → Core infrastructure
- **Dependency Injection**: FastAPI dependencies for auth, DB clients
- **Centralized Services**: Reusable Firestore, GCS, geocoding logic
- **Lifespan Management**: Async startup/shutdown for ES connections

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker Desktop | Latest | Elasticsearch containerization |
| Python | 3.10+ | Backend + AI services |
| Node.js | 16+ | Web frontend (Vite) |
| Google Gemini API Key | - | Vision AI ([Get here](https://aistudio.google.com/apikey)) |
| Firebase Project | - | Auth + Firestore ([Console](https://console.firebase.google.com)) |
| Google Cloud Project | - | Storage bucket ([Cloud Console](https://console.cloud.google.com)) |

### Environment Setup (5 minutes)

**1. Clone & Initialize**
```bash
git clone https://github.com/yourusername/civicfix.git
cd civicfix
```

**2. Firebase Configuration**
- Create project at https://console.firebase.google.com
- Enable **Email/Password** authentication
- Create **Firestore** database (start in production mode)
- Download service account JSON → save as `backend/serviceAccountKey.json`
- Copy Web SDK config for mobile app (see Mobile App section)

**3. Google Cloud Storage**
- Create bucket: `civicfix_issues_bucket`
- Download service account JSON → save to `secrets/civicfix-*.json`
- Grant bucket permissions: **Storage Object Creator**

**4. API Keys**
- Get Gemini API key: https://aistudio.google.com/apikey
- Store securely for environment variables

### Docker Deployment (Recommended)

**Start Elasticsearch**
```bash
cd elastic-local
docker-compose up -d
```

**Verify ES Running**
```bash
curl http://localhost:9200
# Should return cluster info JSON
```

**Seed Test Data** (optional but recommended)
```bash
# From project root
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1

cd elastic-local
pip install -r requirements.txt

export GEMINI_API_KEY="your_api_key_here"
export ES_URL="http://localhost:9200"

python seed_civicfix.py
# Creates 300+ issues across 20 types with realistic fixes
```

**Run Issue Identifier (Port 8000)**
```bash
cd cloud/Issue_Identifier

docker build -t civicfix-issue-identifier .

docker run -d --name civicfix-issue-identifier \
  --network host \
  -e GEMINI_API_KEY=your_api_key_here \
  -e ES_URL=http://localhost:9200 \
  civicfix-issue-identifier

# Verify: curl http://localhost:8000/docs
```

**Run Issue Verifier (Port 8001)**
```bash
cd cloud/Issue_Verifier

docker build -t civicfix-issue-verifier .

docker run -d --name civicfix-issue-verifier \
  --network host \
  -e GEMINI_API_KEY=your_api_key_here \
  -e ES_URL=http://localhost:9200 \
  civicfix-issue-verifier

# Verify: curl http://localhost:8001/docs
```

**Run Backend Gateway (Port 8000 - Development)**
```bash
cd backend

# Create .env file
cat > .env << EOF
ES_URL=http://localhost:9200
SERVICE_ACCOUNT_PATH=serviceAccountKey.json
GCS_BUCKET_NAME=civicfix_issues_bucket
ISSUE_IDENTIFIER_URL=http://localhost:8000
ISSUE_VERIFIER_URL=http://localhost:8001
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
EOF

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Run Web Frontend (Port 5173)**
```bash
cd frontend
npm install
npm run dev
```

Access at: http://localhost:5173

### Mobile App Setup

**Configure Firebase**
```javascript
// app/src/services/firebase.js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

**Update API Endpoint**
```javascript
// app/src/services/api.js
const api = axios.create({
  baseURL: "http://YOUR_BACKEND_IP:8000/api",  // Use 10.0.2.2:8000 for Android emulator
});
```

**Run Mobile App**
```bash
cd app
npm install

# iOS Simulator
npm run ios

# Android Emulator
npm run android

# Web (for testing)
npm run web
```

---

## 📡 API Reference

### Backend Gateway (`http://localhost:8000`)

#### Issue Management
```http
POST /submit-issue
  FormData: file, latitude, longitude, description, labels[], is_anonymous
  Returns: { image_url, analysis, location_coords }

GET /api/issues/?latitude={lat}&longitude={lon}&radius_km=5&limit=20
  Returns: [ { issue_id, photo_url, detected_issues[], status, severity_score, ... } ]

GET /api/issues/{issue_id}
  Returns: Full issue document with upvotes, reports, evidence_ids

POST /api/issues/{issue_id}/upvote
  Headers: Authorization: Bearer {firebase_token}
  Returns: { success, karma_awarded }

POST /api/issues/{issue_id}/report
  Body: { reason?: string }
  Returns: { success, is_spam, reports: { open, closed } }
```

#### Fix Submission
```http
POST /api/issues/{issue_id}/submit-fix
  FormData: files[], title?, description?
  Headers: Authorization: Bearer {firebase_token}
  Returns: { fix_id, verification_results, overall_outcome, suggested_success_rate }

GET /api/issues/{issue_id}/fix-details
  Returns: { fix_photo_urls, ngo_name, verification_timestamp, co2_saved }
```

#### User & Leaderboards
```http
GET /api/leaderboard/citizens
  Returns: [ { user_id, name, karma, rank } ] (Top 10)

GET /api/leaderboard/ngos
  Returns: [ { user_id, name, karma, issues_resolved } ] (Top 10)

GET /api/users/{user_id}/stats-firebase
  Headers: Authorization: Bearer {firebase_token}
  Returns: { karma, currentRank, issuesReported, issuesResolved, co2Saved }
```

### Issue Identifier (`http://localhost:8000/analyze`)

```http
POST /analyze/
  Body: {
    "image_url": "https://...",
    "description": "Large pothole on Main St",
    "location": { "latitude": 40.7128, "longitude": -74.0060 },
    "timestamp": "2025-01-15T10:30:00Z",
    "user_selected_labels": ["ROAD_POTHOLE"],
    "reported_by": "firebase_uid",
    "uploader_display_name": "John Doe",
    "source": "citizen"
  }
  
  Returns: {
    "issue_id": "uuid",
    "detected_issues": [
      {
        "type": "ROAD_POTHOLE",
        "confidence": 0.94,
        "severity": "high",
        "severity_score": 8.7,
        "future_impact": "Vehicle damage risk; increased CO2 from traffic slowdowns",
        "predicted_fix": "Asphalt patching with compaction",
        "predicted_fix_confidence": 0.89,
        "auto_review_flag": false
      }
    ],
    "auto_review": false,
    "no_issues_found": false
  }
```

### Issue Verifier (`http://localhost:8001/verify_fix`)

```http
POST /verify_fix/
  Body: {
    "issue_id": "uuid",
    "ngo_id": "firebase_uid",
    "image_urls": ["https://...", "https://..."],
    "fix_description": "Filled pothole with cold asphalt",
    "timestamp": "2025-01-16T14:00:00Z"
  }
  
  Returns: {
    "fix_id": "uuid:ngo_id",
    "per_issue_results": [
      {
        "issue_type": "ROAD_POTHOLE",
        "original_confidence": 0.94,
        "fixed": "yes",
        "confidence": 0.96,
        "evidence_photos": [0, 1],
        "notes": "Pothole completely filled and surface leveled"
      }
    ],
    "overall_outcome": "closed",  // or "rejected"
    "suggested_success_rate": 0.96
  }
```

---

## 📊 Elasticsearch Schema

**Indices:** `issues` (civic problems) | `fixes` (verified solutions)

### Issues Index
```jsonc
{
  "issue_id": "uuid",
  "status": "open|closed",
  "location": {"lat": 40.7128, "lon": -74.0060},  // geo_point for radius queries
  "text_embedding": [3072 floats],                // gemini-embedding-001 vector
  "detected_issues": [                            // nested object
    {
      "type": "ROAD_POTHOLE",
      "confidence": 0.94,
      "severity": "high",                          // low|medium|high
      "severity_score": 8.7,                       // 0-10 scale
      "future_impact": "Vehicle damage; traffic slowdowns increase CO2",
      "predicted_fix": "Asphalt patching",
      "predicted_fix_confidence": 0.89,
      "auto_review_flag": false                    // true if confidence 0.6-0.85
    }
  ],
  "issue_types": ["ROAD_POTHOLE"],                 // flattened unique types
  "severity_score": 8.7,                           // max across all detected issues
  "upvotes": {"open": 15, "closed": 3},
  "reports": {"open": 2, "closed": 0},
  "is_spam": false,                                // true if reports.open >= 5
  "evidence_ids": ["fix_uuid1"],                   // linked fix document IDs
  "photo_url": "https://storage.googleapis.com/...",
  "reported_by": "firebase_uid",
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Fixes Index
```jsonc
{
  "fix_id": "issue_uuid:ngo_uid",
  "issue_id": "issue_uuid",
  "related_issue_types": ["ROAD_POTHOLE"],
  "text_embedding": [3072 floats],
  "fix_outcomes": [                                // nested object
    {
      "issue_type": "ROAD_POTHOLE",
      "fixed": "yes",                              // yes|partial|no
      "confidence": 0.96,
      "evidence_photos": [0, 1, 2],                // image indices
      "notes": "Pothole filled with asphalt; surface leveled"
    }
  ],
  "co2_saved": 120.5,                              // inherited from original issue
  "success_rate": 0.96,
  "image_urls": ["https://storage.googleapis.com/..."],
  "created_by": "ngo_uid",
  "created_at": "2025-01-16T14:00:00Z"
}
```

**Supported Issue Types (20 Canonical):**
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

## 🎮 Gamification System

### Karma Economy

| Action | Karma Reward | Trigger |
|--------|-------------|---------|
| First issue submission | +10 | One-time bonus on account creation |
| Issue receives upvote | +5 (to reporter) | Each upvote from another user |
| Successful fix submission | +10 to +20 | Based on AI verification confidence (0.6 = +10, 1.0 = +20) |

### Spam Prevention

| Status | Threshold | Action |
|--------|-----------|--------|
| Open issue reported | 5 reports | Auto-close + mark `is_spam: true` |
| Closed issue re-reported | 3 reports | Reopen for manual review |
| Reporter karma penalty | -10 | If issue confirmed spam by admin |

### Leaderboards

**Citizens** (Top 10)
- Sorted by: `karma DESC`
- Displayed: `name`, `rank`, `issues_reported`, `total_karma`
- Eligibility: `userType == "citizen"`

**NGOs** (Top 10)
- Sorted by: `karma DESC`
- Displayed: `name`, `rank`, `issues_resolved`, `avg_success_rate`
- Eligibility: `userType == "ngo"`

**Rank Calculation:** Real-time percentile within user type cohort

---

## 🐛 Troubleshooting

### Common Issues & Solutions

**❌ Elasticsearch Connection Refused**
```bash
# Verify ES is running
curl http://localhost:9200

# Check container logs
docker logs civicfix-es

# Common fix: Restart container
docker-compose -f elastic-local/docker-compose.yml restart
```

**❌ Gemini API 429 (Rate Limit)**
```
Solution: Free tier = 15 RPM, 1M tokens/day
- Reduce seed.py count: python seed.py --count 50
- Add delays: Exponential backoff already implemented in call_gemini_with_backoff()
- Upgrade: https://ai.google.dev/pricing
```

**❌ Firebase 401 Unauthorized**
```javascript
// app/src/services/api.js
// Ensure token refresh interceptor is active
api.interceptors.request.use(async (config) => {
  const token = await auth.currentUser?.getIdToken(true);  // Force refresh
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

**❌ Image Upload 413 Entity Too Large**
```python
# backend/services/storage_service.py
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB limit

# Frontend validation
if (file.size > 10 * 1024 * 1024) {
  alert('Image must be < 10MB. Please compress or resize.');
}
```

**❌ kNN Search Dimension Mismatch**
```bash
# Verify embedding model in .env
EMBEDDING_MODEL=gemini-embedding-001  # Must be 3072-dim

# Re-index with correct embeddings
python elastic-local/seed_civicfix.py
```

**❌ Docker Container Exits Immediately**
```bash
# Check logs for specific error
docker logs civicfix-issue-identifier

# Common issues:
# 1. Missing GEMINI_API_KEY env var
# 2. Port already in use (8000, 8001, 9200)
# 3. ES_URL incorrect (use http://localhost:9200 for host network)
```

---

## 📚 Additional Resources

- **Gemini API Docs:** https://ai.google.dev/docs
- **Elasticsearch 8.11 Guide:** https://www.elastic.co/guide/en/elasticsearch/reference/8.11/
- **Firebase Admin SDK:** https://firebase.google.com/docs/admin/setup
- **React Native Docs:** https://reactnative.dev/
- **FastAPI Tutorial:** https://fastapi.tiangolo.com/tutorial/
- **Expo SDK 54:** https://docs.expo.dev/

---

## 📄 License

MIT License - Educational & demonstration purposes. Ensure compliance with third-party service terms:
- Google Cloud Platform (Gemini, GCS, Google Maps)
- Firebase (Authentication, Firestore)
- Elasticsearch (Apache 2.0)
- OpenStreetMap Nominatim (ODbL)

---

## 🤝 Contributing

We welcome contributions! To get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request with detailed description

**Contribution Guidelines:**
- Follow existing code style (Pydantic models, async/await patterns)
- Add tests for new features
- Update README for API changes
- Include screenshots for UI changes

**Bug Reports & Feature Requests:**  
Open an issue on GitHub with:
- Clear description
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment details (OS, Python version, etc.)

---
