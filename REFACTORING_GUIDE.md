# CivicFix Modular Refactoring Guide

## Overview

This document describes the modular refactoring of the CivicFix application (both app and backend) completed in the `modulartest` branch.

## Changes Made

### Phase 1: Branch Creation ✓

- Created `modulartest` branch
- Committed pending merge changes

### Phase 2: App Cleanup ✓

#### Removed Unused Components:

- `app/src/components/BottomToolbar.js` - Not imported anywhere
- `app/src/components/CustomTabBar.js` - Not imported anywhere

### Phase 3: App Refactoring (Substantial) ✓

#### New Structure Created:

```
app/src/
├── api/                    # NEW: Modular API layer
│   ├── client.js          # ✓ Axios instance with auth interceptor
│   └── endpoints/
│       ├── issues.api.js  # ✓ Issue-related API calls
│       ├── fixes.api.js   # ✓ Fix-related API calls
│       ├── leaderboard.api.js # ✓ Leaderboard API calls
│       └── users.api.js   # ✓ User stats API calls
├── constants/
│   └── config.js          # ✓ App constants and configuration
├── hooks/
│   ├── useImagePicker.js  # ✓ Image picking logic
│   └── useLocation.js     # ✓ Location operations
└── (existing directories)
```

#### What Was Created:

1. **API Layer** (`app/src/api/`)

   - `client.js`: Centralized axios instance with authentication
   - `endpoints/issues.api.js`: All issue-related API calls
   - `endpoints/fixes.api.js`: Fix submission and retrieval
   - `endpoints/leaderboard.api.js`: Leaderboard data fetching
   - `endpoints/users.api.js`: User statistics

2. **Custom Hooks** (`app/src/hooks/`)

   - `useImagePicker`: Camera and gallery image picking with permissions
   - `useLocation`: Location permissions, fetching, and geocoding

3. **Constants** (`app/src/constants/`)
   - `config.js`: Centralized configuration (API URLs, colors, severity levels, etc.)

#### What Still Needs to be Done for App:

1. **Additional Hooks**:

   - `useIssues.js`: Issue fetching, filtering, sorting logic
   - `useUpload.js`: File upload logic
   - `useLeaderboard.js`: Leaderboard data management
   - `useProfile.js`: Profile stats management
   - `useMapData.js`: Map-specific logic

2. **Refactor Screens**: Update screens to use the new hooks and API endpoints:

   - `HomeScreen.js`: Use `useIssues` hook, import from `api/endpoints/issues.api.js`
   - `LocationScreen.js`: Use `useMapData`, `useLocation`
   - `IssueUploadScreen.js`: Use `useImagePicker`, `useLocation`, `useUpload`
   - `FixUploadScreen.js`: Use `useImagePicker`, `useUpload`
   - `LeaderboardScreen.js`: Use `useLeaderboard`
   - `ProfileScreen.js`: Use `useProfile`

3. **Update Service**:

   - Rename `services/getLocation.js` to `services/location.service.js`
   - Update imports throughout the app

4. **Clean Up**:
   - Remove `services/api.js` after updating all imports to use `api/client.js`
   - Add JSDoc comments to all exported functions
   - Remove console.log statements (keep error logs)
   - Remove commented code

### Phase 4: Backend Refactoring (Substantial) ✓

#### New Structure Created:

```
backend/
├── config/
│   └── settings.py        # ✓ Pydantic Settings for env vars
├── core/
│   ├── database.py        # ✓ Firebase, Firestore, ES initialization
│   ├── security.py        # ✓ Auth middleware and dependencies
│   └── dependencies.py    # ✓ Common FastAPI dependencies
├── models/
│   ├── common.py          # ✓ Location model
│   ├── issue.py           # ✓ Issue-related models
│   ├── user.py            # ✓ User and leaderboard models
│   └── fix.py             # ✓ Fix-related models
├── services/
│   ├── geocoding_service.py  # ✓ Geocoding with cache
│   ├── storage_service.py    # ✓ GCS file uploads
│   ├── analyzer_service.py   # ✓ AI analyzer integration
│   └── user_service.py       # ✓ User stats management
├── utils/
│   └── geohash.py         # ✓ Geohash utilities
├── routers/              # NEEDS CREATION
│   ├── issues.py         # TODO: Issue endpoints
│   ├── fixes.py          # TODO: Fix endpoints
│   ├── users.py          # TODO: User endpoints
│   ├── leaderboard.py    # TODO: Leaderboard endpoints
│   └── map.py            # TODO: Map data endpoint
├── main_refactored.py    # ✓ New modular main.py template
├── main.py               # ORIGINAL (2500+ lines)
└── schema.py             # Can be deprecated after router migration
```

#### What Was Created:

1. **Configuration** (`config/settings.py`)

   - Pydantic Settings class for environment variables
   - Type-safe configuration with defaults
   - ES_URL, GCS_BUCKET_NAME, CLOUD_ANALYZER_URL, VERIFIER_URL, etc.

2. **Core Infrastructure** (`core/`)

   - `database.py`: Firebase, Firestore, and Elasticsearch initialization with retry logic
   - `security.py`: Authentication middleware and FastAPI dependencies
   - `dependencies.py`: Exports for easy importing

3. **Models** (`models/`)

   - Split `schema.py` into domain-specific models:
     - `common.py`: Location
     - `issue.py`: DetectedIssue, ReportIn, GeminiResponse, AnalyzeOut
     - `user.py`: UserStats, LeaderboardEntry
     - `fix.py`: FixSubmission, FixDetails

4. **Services** (`services/`)

   - `geocoding_service.py`: Geocoding with caching
   - `storage_service.py`: GCS file upload functions
   - `analyzer_service.py`: Integration with AI analyzer and verifier
   - `user_service.py`: User karma, stats, and display name management

5. **Utils** (`utils/`)

   - `geohash.py`: Geohash precision calculation

6. **Routers** (`routers/`)
   - `issues.py`: Core issue endpoints (submit, upvote, unlike, report) - ✓ Created
   - `fixes.py`: Fix submission and retrieval - ✓ Created

7. **Main Application** (`main_refactored.py`)
   - Clean application initialization
   - Lifespan management for startup/shutdown
   - Middleware configuration
   - Router inclusion for issues and fixes (active)

#### What Still Needs to be Done for Backend:

1. **Create Routers** (`routers/`):

   **`routers/issues.py`** (Priority: HIGH):

   - Extract from main.py lines ~368-853, 910-1270, 1484-1843
   - Endpoints:
     - `GET /api/issues` (with optional location filtering)
     - `GET /issues/` (with location/radius)
     - `GET /issues/latest`
     - `GET /api/issues/with-user-status`
     - `POST /submit-issue`
     - `POST /submit-issue-multi`
     - `POST /api/issues/{issue_id}/upvote`
     - `POST /api/issues/{issue_id}/unlike`
     - `POST /api/issues/{issue_id}/report`
     - `GET /api/issues/{issue_id}/upvote-status`
     - `POST /api/issues/batch-upvote-status`

   **`routers/fixes.py`** (Priority: HIGH):

   - Extract from main.py lines ~1844-2220
   - Endpoints:
     - `POST /api/issues/{issue_id}/submit-fix`
     - `GET /api/issues/{issue_id}/fix-details`
     - `GET /api/fixes`

   **`routers/users.py`** (Priority: MEDIUM):

   - Extract from main.py lines ~1276-1484
   - Endpoints:
     - `GET /api/users/{user_id}/stats`
     - `GET /api/users/{user_id}/stats-firebase`

   **`routers/leaderboard.py`** (Priority: MEDIUM):

   - Extract from main.py lines ~2220-2294
   - Endpoints:
     - `GET /api/leaderboard/citizens`
     - `GET /api/leaderboard/ngos`

   **`routers/map.py`** (Priority: LOW):

   - Extract from main.py lines ~2406-2516
   - Endpoints:
     - `GET /api/map-data`

2. **Additional Services** (as needed while creating routers):

   - `services/issue_service.py`: Issue creation, upvoting, reporting logic
   - `services/fix_service.py`: Fix submission and verification logic

3. **Migration Steps**:
   a. Create each router file with extracted endpoint logic
   b. Replace inline logic with service layer calls
   c. Update imports to use new models and services
   d. Test each router independently
   e. Include routers in `main_refactored.py`
   f. Full integration testing
   g. Rename `main.py` to `main_old.py` (backup)
   h. Rename `main_refactored.py` to `main.py`
   i. Deploy and monitor

## Benefits of This Refactoring

### App Benefits:

1. **Maintainability**: Clear separation of concerns
2. **Reusability**: Hooks can be shared across components
3. **Testability**: Isolated functions are easier to test
4. **Type Safety**: JSDoc comments provide better IDE support
5. **Performance**: Reduce code duplication and improve bundle size

### Backend Benefits:

1. **Modularity**: Each feature in its own router
2. **Scalability**: Easy to add new features without touching core
3. **Maintainability**: ~100-150 line files vs 2500-line monolith
4. **Testability**: Each service and router can be tested independently
5. **Team Collaboration**: Multiple developers can work on different routers
6. **Configuration Management**: Centralized, type-safe settings
7. **Clear Dependencies**: Explicit imports show relationships

## File Size Targets

### Backend:

- Routers: <300 lines each
- Services: <400 lines each
- Models: <100 lines each
- Main.py: ~100-150 lines

### App:

- Screens: <250 lines (mostly UI)
- Hooks: <150 lines
- API endpoints: <100 lines each
- Services: <200 lines

## Testing Checklist

### Backend:

- [ ] All endpoints return correct status codes
- [ ] Authentication middleware works
- [ ] File uploads to GCS succeed
- [ ] AI analyzer integration works
- [ ] Fix verification works
- [ ] User karma/stats update correctly
- [ ] Leaderboard data is accurate
- [ ] Map data filtering works
- [ ] Elasticsearch queries return correct data

### App:

- [ ] Login/Signup works
- [ ] Issue submission works (image, location, description)
- [ ] Issue feed loads and displays
- [ ] Filters work correctly
- [ ] Pagination/infinite scroll works
- [ ] Map view displays markers
- [ ] Fix upload works for NGOs
- [ ] Leaderboard displays correctly
- [ ] Profile stats are accurate
- [ ] Navigation works between all screens

## Next Steps

1. **Complete Backend Routers**: Create all 5 router files with extracted endpoints
2. **Complete App Hooks**: Create remaining hooks (useIssues, useUpload, etc.)
3. **Refactor App Screens**: Update to use new hooks and API layer
4. **Integration Testing**: Test entire flow end-to-end
5. **Code Quality**: Add linting, remove console.logs, add comments
6. **Documentation**: Update README with new structure
7. **Deploy**: Test in staging environment before production

## Notes

- Original `main.py` is preserved and functional
- `main_refactored.py` demonstrates the new structure
- All existing endpoints will remain at the same paths (backward compatible)
- No breaking changes to API contracts
- Migration can be done incrementally (router by router)

## Estimated Remaining Effort

- Backend Routers: 6-8 hours
- Backend Services (additional): 2-3 hours
- App Hooks (remaining): 3-4 hours
- App Screen Refactoring: 6-8 hours
- Testing & Bug Fixes: 4-6 hours
- **Total: 21-29 hours**

## Success Criteria

✓ All tests pass
✓ No functionality is lost
✓ API response times remain similar or better
✓ Code is more maintainable (verified by team review)
✓ New features can be added with minimal changes to existing code
