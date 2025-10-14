-- Enable UUID generation extension (run once per database)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- USER PROFILES TABLE
-- =========================
CREATE TABLE user_profiles (
    firebase_uid VARCHAR(128) PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    karma_points INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    last_latitude DOUBLE PRECISION,
    last_longitude DOUBLE PRECISION
);

CREATE INDEX idx_profiles_username ON user_profiles(username);
CREATE INDEX idx_profiles_karma ON user_profiles(karma_points DESC);

-- =========================
-- ISSUES TABLE
-- =========================
CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid VARCHAR(128),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    description TEXT NOT NULL,
    image_url VARCHAR(500),
    tags TEXT[] DEFAULT '{}',
    severity VARCHAR(10) CHECK (severity IN ('low', 'medium', 'high')),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'spam')),
    upvotes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_anonymous BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (firebase_uid) REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL
);

CREATE INDEX idx_issues_location ON issues(latitude, longitude);
CREATE INDEX idx_issues_firebase_user ON issues(firebase_uid);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_created ON issues(created_at DESC);
CREATE INDEX idx_issues_tags ON issues USING GIN(tags);

-- =========================
-- ISSUE VOTES TABLE
-- =========================
CREATE TABLE issue_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    firebase_uid VARCHAR(128) REFERENCES user_profiles(firebase_uid) ON DELETE CASCADE,
    vote_type SMALLINT CHECK (vote_type IN (1, -1)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(issue_id, firebase_uid)
);

CREATE INDEX idx_votes_issue ON issue_votes(issue_id);
CREATE INDEX idx_votes_user ON issue_votes(firebase_uid);