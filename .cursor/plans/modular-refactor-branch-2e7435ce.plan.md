<!-- 2e7435ce-e097-4bdb-ab1f-3fee46ada300 10c62874-752b-4727-aff2-e57bccfc797e -->
# Modular Refactor Plan

## Phase 1: Branch Creation & Setup

- Create `modulartest` branch from current state
- Ensure working tree is clean (commit or stash staged changes)

## Phase 2: App Cleanup - Remove Unused Code

### Components to Remove:

- `BottomToolbar.js` - Not imported anywhere, replaced by React Navigation tabs
- `CustomTabBar.js` - Not imported anywhere, using default tab bar

### Deep Code Analysis & Cleanup:

- Audit all screen files for:
  - Commented-out code blocks
  - Unused imports
  - Unused state variables
  - Unused helper functions
  - Console.log statements (keep critical error logs only)
  - Duplicate code patterns
- Check service files for unused exports
- Remove unused utility functions
- Clean up context providers for unused values

## Phase 3: App Refactoring (Modular Architecture)

### Structure:

```
app/src/
├── api/              # NEW: API layer
│   ├── endpoints/
│   │   ├── issues.api.js
│   │   ├── auth.api.js
│   │   ├── leaderboard.api.js
│   │   └── fixes.api.js
│   └── client.js     # Axios instance (from current api.js)
├── components/       # UI components (existing, cleaned)
├── context/          # Context providers (existing)
├── hooks/            # Custom hooks (existing + new)
│   ├── useIssues.js      # NEW: Issue data fetching
│   ├── useLocation.js    # NEW: Location logic
│   ├── useImagePicker.js # NEW: Image picker logic
│   └── subscribeToAuthState.js (existing)
├── screens/          # Screen components (refactored)
├── services/         # Core services
│   ├── firebase.js   # (existing)
│   └── location.service.js # (refactored from getLocation.js)
├── utils/            # Pure utility functions (existing)
└── constants/        # NEW: App constants
    └── config.js
```

### Key Refactoring Tasks:

**1. Extract API Layer** (`app/src/api/`)

- Split `api.js` into modular endpoint files
- Create `client.js` with axios instance and interceptor
- Create `endpoints/issues.api.js` with all issue-related API calls
- Create `endpoints/auth.api.js` for authentication
- Create `endpoints/leaderboard.api.js` for leaderboard data
- Create `endpoints/fixes.api.js` for fix submissions

**2. Create Custom Hooks** (`app/src/hooks/`)

- `useIssues.js` - Encapsulate issue fetching, filtering, sorting logic
- `useLocation.js` - Extract location permission, fetching, geocoding logic
- `useImagePicker.js` - Extract camera/gallery picking logic with permissions
- `useUpload.js` - Extract file upload logic

**3. Refactor Screens** (extract business logic to hooks/services)

- **HomeScreen.js**: Move filter logic to `useIssues`, move post fetching to hook
- **LocationScreen.js**: Extract map logic to `useMapData` hook, move marker filtering
- **IssueUploadScreen.js**: Use `useImagePicker`, `useLocation`, `useUpload` hooks
- **FixUploadScreen.js**: Use `useImagePicker`, `useUpload` hooks
- **LeaderboardScreen.js**: Create `useLeaderboard` hook
- **ProfileScreen.js**: Create `useProfile` hook for stats fetching
- Keep screens focused on UI rendering only

**4. Refactor Services**

- Rename `getLocation.js` to `location.service.js`
- Extract geocoding logic into separate functions
- Add proper error handling and types (JSDoc comments)

**5. Create Constants**

- Extract hardcoded URLs, API endpoints, configuration into `constants/config.js`

## Phase 4: Backend Refactoring (Modular FastAPI Architecture)

### Target Structure:

```
backend/
├── main.py           # App initialization, lifespan, middleware only
├── requirements.txt
├── config/           # NEW
│   └── settings.py   # Environment variables, configuration
├── core/             # NEW: Core functionality
│   ├── security.py   # Auth middleware, token verification
│   ├── database.py   # Firebase, Firestore, ES clients
│   └── dependencies.py # FastAPI dependencies
├── models/           # NEW: Pydantic models (from schema.py)
│   ├── issue.py
│   ├── user.py
│   ├── fix.py
│   └── common.py
├── routers/          # NEW: API routes by feature
│   ├── issues.py     # Issue CRUD, submit, report, upvote
│   ├── fixes.py      # Fix submission, retrieval
│   ├── users.py      # User stats, profile
│   ├── leaderboard.py
│   └── map.py        # Map data endpoint
├── services/         # NEW: Business logic layer
│   ├── issue_service.py
│   ├── fix_service.py
│   ├── user_service.py
│   ├── geocoding_service.py
│   ├── storage_service.py  # GCS uploads
│   └── analyzer_service.py # External API calls
└── utils/            # NEW: Helper functions
    └── geohash.py
```

### Key Backend Refactoring Tasks:

**1. Configuration Management** (`config/settings.py`)

- Move all environment variables to Pydantic Settings class
- Centralize ES_URL, BUCKET_NAME, CLOUD_ANALYZER_URL, VERIFIER_URL, etc.

**2. Core Infrastructure** (`core/`)

- `database.py`: Initialize Firebase, Firestore, Elasticsearch clients
- `security.py`: Move auth middleware logic, create `get_current_user` dependency
- `dependencies.py`: Common FastAPI dependencies

**3. Models Reorganization** (`models/`)

- Split `schema.py` into domain models:
  - `issue.py`: ReportIn, DetectedIssue, AnalyzeOut
  - `user.py`: User stats models
  - `fix.py`: Fix submission models
  - `common.py`: Location, shared types

**4. Service Layer** (`services/`)

- Extract business logic from route handlers:
  - `issue_service.py`: Issue creation, validation, reporting, upvoting logic
  - `fix_service.py`: Fix submission, verification logic
  - `user_service.py`: User stats calculation, leaderboard logic
  - `geocoding_service.py`: Move `geocode_location` function + cache
  - `storage_service.py`: GCS upload functions
  - `analyzer_service.py`: Calls to CLOUD_ANALYZER_URL and VERIFIER_URL

**5. Router Layer** (`routers/`)

Split main.py's 20+ endpoints into feature routers:

- `issues.py`: 
  - GET `/api/issues`, `/issues/`, `/issues/latest`, `/api/issues/with-user-status`
  - POST `/submit-issue`, `/submit-issue-multi`
  - POST `/api/issues/{id}/upvote`, `/api/issues/{id}/unlike`, `/api/issues/{id}/report`
  - GET `/api/issues/{id}/upvote-status`
  - POST `/api/issues/batch-upvote-status`
- `fixes.py`:
  - POST `/api/issues/{id}/submit-fix`
  - GET `/api/issues/{id}/fix-details`
  - GET `/api/fixes`
- `users.py`:
  - GET `/api/users/{id}/stats`
  - GET `/api/users/{id}/stats-firebase`
- `leaderboard.py`:
  - GET `/api/leaderboard/citizens`
  - GET `/api/leaderboard/ngos`
- `map.py`:
  - GET `/api/map-data`

**6. Refactor main.py**

- Keep only: FastAPI app initialization, CORS, lifespan events, router inclusion
- Remove all endpoint definitions (move to routers)
- Remove all business logic (move to services)
- ~100-150 lines max

**7. Utilities**

- Extract `get_geohash_precision` to `utils/geohash.py`

## Phase 5: Code Quality & Validation

### Backend:

- Ensure all imports resolve correctly
- Add docstrings to service functions
- Verify no circular imports
- Test that server starts without errors (`uvicorn main:app`)

### App:

- Verify all imports resolve
- Check no missing dependencies
- Ensure no broken navigation
- Add JSDoc comments to exported functions

### Both:

- Remove all debug print/console.log statements
- Ensure consistent code formatting
- No unused imports or variables (check with linter if available)

## Implementation Notes

- **File Size Target**: 
  - Backend routers: <300 lines each
  - Backend services: <400 lines each
  - App screens: <250 lines each (mostly UI)
  - App hooks: <150 lines each

- **Imports**: Use absolute imports where possible in backend, relative in app (React Native convention)

- **Error Handling**: Maintain existing error handling patterns, improve where needed

- **Backward Compatibility**: All API endpoints must maintain same paths and response formats

### To-dos

- [ ] Create modulartest branch and prepare workspace
- [ ] Remove unused components (BottomToolbar, CustomTabBar) and clean up code
- [ ] Create modular API layer with endpoint files
- [ ] Extract business logic into custom hooks
- [ ] Refactor screens to use hooks and remove business logic
- [ ] Create backend folder structure (config, core, models, routers, services, utils)
- [ ] Create configuration management (settings.py)
- [ ] Extract core infrastructure (database, security, dependencies)
- [ ] Split schema.py into domain models
- [ ] Extract business logic into service layer
- [ ] Split endpoints into feature routers
- [ ] Refactor main.py to use routers and remove business logic
- [ ] Validate imports, test startup, clean up code quality