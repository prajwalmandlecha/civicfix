# CivicFix Cloud SQL API

A FastAPI backend for CivicFix that provides CRUD operations for user profiles, issues, and issue votes using Google Cloud SQL (PostgreSQL).

## Setup

### Prerequisites
- Python 3.8+
- Google Cloud SQL instance
- Cloud SQL Proxy
- Virtual environment

### Installation
```bash
pip install -r requirements.txt
```

### Configuration
Update `.env` file in the project root to include your database connection details:
```env
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=your_db_name
DB_HOST=127.0.0.1
DB_PORT=5432
```

### Running Cloud SQL Proxy

#### Windows (PowerShell)
```powershell
# From the project root, run:
./cloud/cloud_sql/cloud-sql-proxy.exe --credentials-file=./secrets/civicfix-474613-613212b7d832.json civicfix-474613:asia-south1:civicfix-database
```

#### WSL/Linux & Mac
```bash
./cloud/cloud_sql/cloud-sql-proxy --credentials-file=./secrets/civicfix-474613-613212b7d832.json civicfix-474613:asia-south1:civicfix-database
```

This will forward your local port 5432 to the Cloud SQL instance.

---

### Interacting with the Database using psql

#### Windows (PowerShell)
```powershell
psql -h 127.0.0.1 -p 5433 -U <db_user> -d <db_name>
```

#### WSL/Linux & Mac
```bash
psql -h 127.0.0.1 -p 5433 -U <db_user> -d <db_name>
```

You will be prompted for your database password. Replace `<db_user>` and `<db_name>` with your actual credentials.

### Running the API
```bash
uvicorn cloud.cloud_sql.app.main:app --reload   # If running from project root else use appropriate path
```

The API will be available at `http://127.0.0.1:8000`

## API Endpoints

### User Profiles

#### List Users
- **GET** `/users`
- **Description**: Get all user profiles (limited to 50)
- **Response**: Array of user profile objects

#### Create User
- **POST** `/users`
- **Description**: Create a new user profile
- **Request Body**:
```json
{
    "firebase_uid": "string",
    "username": "string",
    "display_name": "string (optional)",
    "avatar_url": "string (optional)"
}
```

#### Update User
- **PUT** `/users/{firebase_uid}`
- **Description**: Update an existing user profile
- **Request Body**:
```json
{
    "firebase_uid": "string",
    "username": "string",
    "display_name": "string (optional)",
    "avatar_url": "string (optional)"
}
```

#### Delete User
- **DELETE** `/users/{firebase_uid}`
- **Description**: Delete a user profile

---

### Issues

#### List Issues
- **GET** `/issues`
- **Description**: Get all issues (limited to 50)
- **Response**: Array of issue objects

#### Create Issue
- **POST** `/issues`
- **Description**: Create a new issue
- **Request Body**:
```json
{
    "firebase_uid": "string",
    "latitude": 12.34,
    "longitude": 56.78,
    "description": "string",
    "image_url": "string (optional)",
    "tags": ["string"] (optional),
    "severity": "low|medium|high (optional)",
    "status": "open|fixed|spam (optional)",
    "upvotes": 0 (optional),
    "is_anonymous": false (optional)
}
```

#### Update Issue
- **PUT** `/issues/{issue_id}`
- **Description**: Update an existing issue
- **Request Body**: Same as Create Issue with optional `id` field

#### Delete Issue
- **DELETE** `/issues/{issue_id}`
- **Description**: Delete an issue

---

### Issue Votes

#### List Votes
- **GET** `/votes`
- **Description**: Get all votes (limited to 50)
- **Response**: Array of vote objects

#### Create Vote
- **POST** `/votes`
- **Description**: Create a new vote
- **Request Body**:
```json
{
    "issue_id": "uuid-string",
    "firebase_uid": "string",
    "vote_type": 1 or -1
}
```
**Note**: `vote_type` must be `1` (upvote) or `-1` (downvote)

#### Update Vote
- **PUT** `/votes/{vote_id}`
- **Description**: Update an existing vote
- **Request Body**: Same as Create Vote with optional `id` field

#### Delete Vote
- **DELETE** `/votes/{vote_id}`
- **Description**: Delete a vote

---

## Field Constraints

### Issue Status
Allowed values: `"open"`, `"fixed"`, `"spam"`

### Issue Severity
Allowed values: `"low"`, `"medium"`, `"high"`

### Vote Type
Allowed values: `1` (upvote), `-1` (downvote)

---

## Testing Commands

### PowerShell (Windows)

#### Users
```powershell
# List users
Invoke-RestMethod -Uri "http://127.0.0.1:8000/users" -Method Get

# Create user
Invoke-RestMethod -Uri "http://127.0.0.1:8000/users" -Method Post `
  -ContentType "application/json" `
  -Body '{"firebase_uid":"uid123","username":"testuser","display_name":"Test User","avatar_url":"https://example.com/avatar.png"}'

# Update user
Invoke-RestMethod -Uri "http://127.0.0.1:8000/users/uid123" -Method Put `
  -ContentType "application/json" `
  -Body '{"firebase_uid":"uid123","username":"updateduser","display_name":"Updated Name","avatar_url":"https://example.com/newavatar.png"}'

# Delete user
Invoke-RestMethod -Uri "http://127.0.0.1:8000/users/uid123" -Method Delete
```

#### Issues
```powershell
# List issues
Invoke-RestMethod -Uri "http://127.0.0.1:8000/issues" -Method Get

# Create issue
Invoke-RestMethod -Uri "http://127.0.0.1:8000/issues" -Method Post `
  -ContentType "application/json" `
  -Body '{"firebase_uid":"uid123","latitude":12.34,"longitude":56.78,"description":"Broken streetlight","image_url":"https://example.com/image.jpg","tags":["lighting","safety"],"severity":"high","status":"open","upvotes":0,"is_anonymous":false}'

# Update issue (replace {issue_id} with actual UUID)
Invoke-RestMethod -Uri "http://127.0.0.1:8000/issues/{issue_id}" -Method Put `
  -ContentType "application/json" `
  -Body '{"firebase_uid":"uid123","latitude":12.34,"longitude":56.78,"description":"Fixed streetlight","image_url":"https://example.com/image2.jpg","tags":["lighting"],"severity":"low","status":"fixed","upvotes":1,"is_anonymous":false}'

# Delete issue (replace {issue_id} with actual UUID)
Invoke-RestMethod -Uri "http://127.0.0.1:8000/issues/{issue_id}" -Method Delete
```

#### Votes
```powershell
# List votes
Invoke-RestMethod -Uri "http://127.0.0.1:8000/votes" -Method Get

# Create vote (replace {issue_id} with actual UUID)
Invoke-RestMethod -Uri "http://127.0.0.1:8000/votes" -Method Post `
  -ContentType "application/json" `
  -Body '{"issue_id":"{issue_id}","firebase_uid":"uid123","vote_type":1}'

# Update vote (replace {vote_id} and {issue_id} with actual UUIDs)
Invoke-RestMethod -Uri "http://127.0.0.1:8000/votes/{vote_id}" -Method Put `
  -ContentType "application/json" `
  -Body '{"issue_id":"{issue_id}","firebase_uid":"uid123","vote_type":-1}'

# Delete vote (replace {vote_id} with actual UUID)
Invoke-RestMethod -Uri "http://127.0.0.1:8000/votes/{vote_id}" -Method Delete
```

---

### WSL/Linux & Mac (curl)

#### Users
```bash
# List users
curl -X GET "http://127.0.0.1:8000/users"

# Create user
curl -X POST "http://127.0.0.1:8000/users" \
  -H "Content-Type: application/json" \
  -d '{"firebase_uid":"uid123","username":"testuser","display_name":"Test User","avatar_url":"https://example.com/avatar.png"}'

# Update user
curl -X PUT "http://127.0.0.1:8000/users/uid123" \
  -H "Content-Type: application/json" \
  -d '{"firebase_uid":"uid123","username":"updateduser","display_name":"Updated Name","avatar_url":"https://example.com/newavatar.png"}'

# Delete user
curl -X DELETE "http://127.0.0.1:8000/users/uid123"
```

#### Issues
```bash
# List issues
curl -X GET "http://127.0.0.1:8000/issues"

# Create issue
curl -X POST "http://127.0.0.1:8000/issues" \
  -H "Content-Type: application/json" \
  -d '{"firebase_uid":"uid123","latitude":12.34,"longitude":56.78,"description":"Broken streetlight","image_url":"https://example.com/image.jpg","tags":["lighting","safety"],"severity":"high","status":"open","upvotes":0,"is_anonymous":false}'

# Update issue (replace {issue_id} with actual UUID)
curl -X PUT "http://127.0.0.1:8000/issues/{issue_id}" \
  -H "Content-Type: application/json" \
  -d '{"firebase_uid":"uid123","latitude":12.34,"longitude":56.78,"description":"Fixed streetlight","image_url":"https://example.com/image2.jpg","tags":["lighting"],"severity":"low","status":"fixed","upvotes":1,"is_anonymous":false}'

# Delete issue (replace {issue_id} with actual UUID)
curl -X DELETE "http://127.0.0.1:8000/issues/{issue_id}"
```

#### Votes
```bash
# List votes
curl -X GET "http://127.0.0.1:8000/votes"

# Create vote (replace {issue_id} with actual UUID)
curl -X POST "http://127.0.0.1:8000/votes" \
  -H "Content-Type: application/json" \
  -d '{"issue_id":"{issue_id}","firebase_uid":"uid123","vote_type":1}'

# Update vote (replace {vote_id} and {issue_id} with actual UUIDs)
curl -X PUT "http://127.0.0.1:8000/votes/{vote_id}" \
  -H "Content-Type: application/json" \
  -d '{"issue_id":"{issue_id}","firebase_uid":"uid123","vote_type":-1}'

# Delete vote (replace {vote_id} with actual UUID)
curl -X DELETE "http://127.0.0.1:8000/votes/{vote_id}"
```

---

## Error Handling

The API returns appropriate HTTP status codes:
- `200`: Success
- `400`: Bad Request (validation errors, constraint violations)
- `404`: Not Found
- `422`: Unprocessable Entity (validation errors)
- `500`: Internal Server Error

### Common Validation Errors
- **Status**: Must be one of `"open"`, `"fixed"`, `"spam"`
- **Severity**: Must be one of `"low"`, `"medium"`, `"high"`
- **Vote Type**: Must be `1` or `-1`
- **UUIDs**: Must be valid UUID format

---

## Database Schema

The API works with the following PostgreSQL tables:
- `user_profiles`: User information and profiles
- `issues`: Civic issues reported by users
- `issue_votes`: Votes (upvotes/downvotes) on issues

Refer to `cloud/cloud_sql/schema.sql` for complete schema details.

---

## Development

### Interactive API Documentation
When running the server, visit:
- **Swagger UI**: `http://127.0.0.1:8000/docs`
- **ReDoc**: `http://127.0.0.1:8000/redoc`

### Running with Docker (Optional)
```bash
# Build image
docker build -t civicfix-api .

# Run container
docker run -p 8000:8000 --env-file .env civicfix-api
```

---

## Dependencies

See `requirements.txt` for full list:
- FastAPI
- SQLAlchemy (async)
- asyncpg
- python-dotenv
- uvicorn
- pydantic