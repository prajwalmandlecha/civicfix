
import os
from fastapi import FastAPI, HTTPException, Path
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional, List
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../../.env'))

DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "5432")

DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_async_engine(DATABASE_URL, echo=True, future=True)
AsyncSessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

app = FastAPI()

# -------------------
# Pydantic Schemas
# -------------------
class UserProfile(BaseModel):
    firebase_uid: str
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


from pydantic import validator

class Issue(BaseModel):
    id: Optional[UUID] = None
    firebase_uid: str
    latitude: float
    longitude: float
    description: str
    image_url: Optional[str] = None
    tags: Optional[List[str]] = Field(default_factory=list)
    severity: Optional[str] = None
    status: Optional[str] = None
    upvotes: Optional[int] = 0
    is_anonymous: Optional[bool] = False

    @validator('status')
    def validate_status(cls, v):
        allowed = {'open', 'fixed', 'spam'}
        if v is not None and v not in allowed:
            raise ValueError(f"status must be one of {allowed}")
        return v

    @validator('severity')
    def validate_severity(cls, v):
        allowed = {'low', 'medium', 'high'}
        if v is not None and v not in allowed:
            raise ValueError(f"severity must be one of {allowed}")
        return v

class IssueVote(BaseModel):
    id: Optional[UUID] = None
    issue_id: UUID
    firebase_uid: str
    vote_type: int

# -------------------
# UserProfile CRUD
# -------------------

@app.get("/users", response_model=List[UserProfile])
async def get_users():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT firebase_uid, username, display_name, avatar_url FROM user_profiles LIMIT 50"))
        users = result.mappings().all()
        return users

@app.post("/users", response_model=dict)
async def create_user(profile: UserProfile):
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(
                text("INSERT INTO user_profiles (firebase_uid, username, display_name, avatar_url) VALUES (:uid, :uname, :dname, :aurl)"),
                {"uid": profile.firebase_uid, "uname": profile.username, "dname": profile.display_name, "aurl": profile.avatar_url}
            )
            await session.commit()
            return {"message": "User created"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=400, detail=str(e))


# Update user
@app.put("/users/{firebase_uid}", response_model=dict)
async def update_user(firebase_uid: str, profile: UserProfile):
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(
                text("""
                    UPDATE user_profiles SET username = :uname, display_name = :dname, avatar_url = :aurl
                    WHERE firebase_uid = :uid
                """),
                {"uid": firebase_uid, "uname": profile.username, "dname": profile.display_name, "aurl": profile.avatar_url}
            )
            await session.commit()
            return {"message": "User updated"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=400, detail=str(e))

@app.delete("/users/{firebase_uid}", response_model=dict)
async def delete_user(firebase_uid: str = Path(..., min_length=1)):
    async with AsyncSessionLocal() as session:
        await session.execute(text("DELETE FROM user_profiles WHERE firebase_uid = :uid"), {"uid": firebase_uid})
        await session.commit()
        return {"message": "User deleted"}

# -------------------
# Issues CRUD
# -------------------

@app.get("/issues", response_model=List[Issue])
async def get_issues():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT * FROM issues LIMIT 50"))
        issues = result.mappings().all()
        return issues

@app.post("/issues", response_model=dict)
async def create_issue(issue: Issue):
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(
                text("""
                    INSERT INTO issues (firebase_uid, latitude, longitude, description, image_url, tags, severity, status, upvotes, is_anonymous)
                    VALUES (:uid, :lat, :lon, :desc, :img, :tags, :sev, :stat, :upv, :anon)
                """),
                {
                    "uid": issue.firebase_uid,
                    "lat": issue.latitude,
                    "lon": issue.longitude,
                    "desc": issue.description,
                    "img": issue.image_url,
                    "tags": issue.tags,
                    "sev": issue.severity,
                    "stat": issue.status,
                    "upv": issue.upvotes,
                    "anon": issue.is_anonymous
                }
            )
            await session.commit()
            return {"message": "Issue created"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=400, detail=str(e))


# Update issue
@app.put("/issues/{issue_id}", response_model=dict)
async def update_issue(issue_id: str, issue: Issue):
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(
                text("""
                    UPDATE issues SET firebase_uid = :uid, latitude = :lat, longitude = :lon, description = :desc, image_url = :img, tags = :tags, severity = :sev, status = :stat, upvotes = :upv, is_anonymous = :anon
                    WHERE id = :iid
                """),
                {
                    "iid": issue_id,
                    "uid": issue.firebase_uid,
                    "lat": issue.latitude,
                    "lon": issue.longitude,
                    "desc": issue.description,
                    "img": issue.image_url,
                    "tags": issue.tags,
                    "sev": issue.severity,
                    "stat": issue.status,
                    "upv": issue.upvotes,
                    "anon": issue.is_anonymous
                }
            )
            await session.commit()
            return {"message": "Issue updated"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=400, detail=str(e))

@app.delete("/issues/{issue_id}", response_model=dict)
async def delete_issue(issue_id: str = Path(..., min_length=1)):
    async with AsyncSessionLocal() as session:
        await session.execute(text("DELETE FROM issues WHERE id = :iid"), {"iid": issue_id})
        await session.commit()
        return {"message": "Issue deleted"}

# -------------------
# IssueVotes CRUD
# -------------------

@app.get("/votes", response_model=List[IssueVote])
async def get_votes():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT * FROM issue_votes LIMIT 50"))
        votes = result.mappings().all()
        return votes

@app.post("/votes", response_model=dict)
async def create_vote(vote: IssueVote):
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(
                text("""
                    INSERT INTO issue_votes (issue_id, firebase_uid, vote_type)
                    VALUES (:iid, :uid, :vtype)
                """),
                {
                    "iid": vote.issue_id,
                    "uid": vote.firebase_uid,
                    "vtype": vote.vote_type
                }
            )
            await session.commit()
            return {"message": "Vote recorded"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=400, detail=str(e))


# Update vote
@app.put("/votes/{vote_id}", response_model=dict)
async def update_vote(vote_id: str, vote: IssueVote):
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(
                text("""
                    UPDATE issue_votes SET issue_id = :iid, firebase_uid = :uid, vote_type = :vtype
                    WHERE id = :vid
                """),
                {
                    "vid": vote_id,
                    "iid": vote.issue_id,
                    "uid": vote.firebase_uid,
                    "vtype": vote.vote_type
                }
            )
            await session.commit()
            return {"message": "Vote updated"}
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=400, detail=str(e))

@app.delete("/votes/{vote_id}", response_model=dict)
async def delete_vote(vote_id: str = Path(..., min_length=1)):
    async with AsyncSessionLocal() as session:
        await session.execute(text("DELETE FROM issue_votes WHERE id = :vid"), {"vid": vote_id})
        await session.commit()
        return {"message": "Vote deleted"}
