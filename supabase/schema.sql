-- Profiles & Settings
CREATE TABLE profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  exam_date DATE,
  target_study_hours NUMERIC,
  preferred_session_minutes INT,
  preferred_pacing TEXT DEFAULT 'balanced', 
  preferred_rest_days TEXT[] DEFAULT '{}',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Syllabus Hierarchy
CREATE TABLE subjects (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  weight_percentage NUMERIC
);

CREATE TABLE topics (
  id SERIAL PRIMARY KEY,
  subject_id INT REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority_weight NUMERIC DEFAULT 1.0,
  time_estimate_minutes INT
);

CREATE TABLE subtopics (
  id SERIAL PRIMARY KEY,
  topic_id INT REFERENCES topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'not started',
  self_confidence NUMERIC(2,1), 
  ai_mastery NUMERIC(2,1),      
  time_spent_minutes INT DEFAULT 0,
  last_studied_date DATE,
  revision_due_date DATE,
  times_revised INT DEFAULT 0
);

-- Logging & Assessment Records
CREATE TABLE progress_records (
  id SERIAL PRIMARY KEY,
  subtopic_id INT REFERENCES subtopics(id),
  user_id UUID REFERENCES auth.users(id),
  studied_date DATE DEFAULT NOW(),
  time_spent_minutes INT,
  confidence_rating INT,
  is_revision BOOLEAN DEFAULT FALSE,
  notes TEXT,
  felt_difficulty TEXT 
);

CREATE TABLE ai_assessments (
  id SERIAL PRIMARY KEY,
  subtopic_id INT REFERENCES subtopics(id),
  user_id UUID REFERENCES auth.users(id),
  taken_at TIMESTAMP DEFAULT NOW(),
  generated_mcqs JSONB,
  user_answers JSONB,   
  score_percentage NUMERIC,
  ai_mastery_estimate NUMERIC(2,1),
  error_categories JSONB, 
  explanation_summary TEXT,
  recommended_action TEXT
);

CREATE TABLE mock_tests (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  taken_at DATE DEFAULT NOW(),
  total_score NUMERIC,
  time_taken_minutes INT,
  notes TEXT
);

CREATE TABLE mock_section_scores (
  id SERIAL PRIMARY KEY,
  mock_id INT REFERENCES mock_tests(id) ON DELETE CASCADE,
  subject_id INT REFERENCES subjects(id),
  score NUMERIC
);

-- RLS (Row Level Security) - Simplistic single-user isolation
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile."
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile."
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile."
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION get_email_by_username(lookup_username TEXT)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM profiles
  WHERE lower(username) = lower(lookup_username)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION get_email_by_username(TEXT) TO anon, authenticated;

-- For the topics and subjects, typically global to all users if it's general CFA data
-- but we'll assume here everything is either global or user-scoped. 
-- For a single-user app, we might disable RLS to avoid hassle, or apply simplest user scoped rules.

-- Synced Study Data
CREATE TABLE IF NOT EXISTS study_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  completion_percentage INT CHECK (completion_percentage BETWEEN 0 AND 100),
  minutes_spent INT NOT NULL DEFAULT 0,
  self_confidence NUMERIC(2,1),
  ai_mastery NUMERIC(2,1),
  notes TEXT NOT NULL DEFAULT '',
  difficulty TEXT,
  last_studied_at TIMESTAMPTZ,
  first_completed_at TIMESTAMPTZ,
  revision_due_at TIMESTAMPTZ,
  revision_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, subtopic_id)
);

CREATE TABLE IF NOT EXISTS study_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mode TEXT NOT NULL,
  score_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  ai_mastery NUMERIC(2,1) NOT NULL DEFAULT 0,
  confidence_at_attempt NUMERIC(2,1),
  question_count INT NOT NULL DEFAULT 0,
  error_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  explanation_summary TEXT NOT NULL DEFAULT '',
  recommended_action TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS study_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  review_interval_days INT NOT NULL DEFAULT 7,
  review_due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_mocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  taken_at DATE NOT NULL DEFAULT CURRENT_DATE,
  total_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  time_taken_minutes INT NOT NULL DEFAULT 0,
  felt_difficulty TEXT NOT NULL DEFAULT 'steady',
  notes TEXT NOT NULL DEFAULT '',
  section_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flashcard_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  confidence NUMERIC(2,1),
  known BOOLEAN NOT NULL DEFAULT FALSE,
  bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  last_reviewed_at TIMESTAMPTZ,
  review_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, card_id)
);
