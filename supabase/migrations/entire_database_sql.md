-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ai_assessments (
  id integer NOT NULL DEFAULT nextval('ai_assessments_id_seq'::regclass),
  subtopic_id integer,
  user_id uuid,
  taken_at timestamp without time zone DEFAULT now(),
  generated_mcqs jsonb,
  user_answers jsonb,
  score_percentage numeric,
  ai_mastery_estimate numeric,
  error_categories jsonb,
  explanation_summary text,
  recommended_action text,
  CONSTRAINT ai_assessments_pkey PRIMARY KEY (id),
  CONSTRAINT ai_assessments_subtopic_id_fkey FOREIGN KEY (subtopic_id) REFERENCES public.subtopics(id),
  CONSTRAINT ai_assessments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.flashcard_progress (
  user_id uuid NOT NULL,
  card_id text NOT NULL,
  confidence numeric,
  known boolean NOT NULL DEFAULT false,
  bookmarked boolean NOT NULL DEFAULT false,
  last_reviewed_at timestamp with time zone,
  review_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT flashcard_progress_pkey PRIMARY KEY (user_id, card_id),
  CONSTRAINT flashcard_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.mock_section_scores (
  id integer NOT NULL DEFAULT nextval('mock_section_scores_id_seq'::regclass),
  mock_id integer,
  subject_id integer,
  score numeric,
  CONSTRAINT mock_section_scores_pkey PRIMARY KEY (id),
  CONSTRAINT mock_section_scores_mock_id_fkey FOREIGN KEY (mock_id) REFERENCES public.mock_tests(id),
  CONSTRAINT mock_section_scores_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id)
);
CREATE TABLE public.mock_tests (
  id integer NOT NULL DEFAULT nextval('mock_tests_id_seq'::regclass),
  user_id uuid,
  taken_at date DEFAULT now(),
  total_score numeric,
  time_taken_minutes integer,
  notes text,
  CONSTRAINT mock_tests_pkey PRIMARY KEY (id),
  CONSTRAINT mock_tests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  exam_date date,
  target_study_hours numeric,
  preferred_pacing text DEFAULT 'balanced'::text,
  created_at timestamp without time zone DEFAULT now(),
  onboarding_completed boolean NOT NULL DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.progress_records (
  id integer NOT NULL DEFAULT nextval('progress_records_id_seq'::regclass),
  subtopic_id integer,
  user_id uuid,
  studied_date date DEFAULT now(),
  time_spent_minutes integer,
  confidence_rating integer,
  is_revision boolean DEFAULT false,
  notes text,
  felt_difficulty text,
  CONSTRAINT progress_records_pkey PRIMARY KEY (id),
  CONSTRAINT progress_records_subtopic_id_fkey FOREIGN KEY (subtopic_id) REFERENCES public.subtopics(id),
  CONSTRAINT progress_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.study_assessments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subtopic_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  mode text NOT NULL,
  score_percentage numeric NOT NULL DEFAULT 0,
  ai_mastery numeric NOT NULL DEFAULT 0,
  confidence_at_attempt numeric,
  question_count integer NOT NULL DEFAULT 0,
  error_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation_summary text NOT NULL DEFAULT ''::text,
  recommended_action text NOT NULL DEFAULT ''::text,
  CONSTRAINT study_assessments_pkey PRIMARY KEY (id),
  CONSTRAINT study_assessments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.study_mocks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  taken_at date NOT NULL DEFAULT CURRENT_DATE,
  total_score numeric NOT NULL DEFAULT 0,
  time_taken_minutes integer NOT NULL DEFAULT 0,
  felt_difficulty text NOT NULL DEFAULT 'steady'::text,
  notes text NOT NULL DEFAULT ''::text,
  section_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT study_mocks_pkey PRIMARY KEY (id),
  CONSTRAINT study_mocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.study_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  topic text NOT NULL,
  body text NOT NULL DEFAULT ''::text,
  tags ARRAY NOT NULL DEFAULT '{}'::text[],
  pinned boolean NOT NULL DEFAULT false,
  review_interval_days integer NOT NULL DEFAULT 7,
  review_due_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT study_notes_pkey PRIMARY KEY (id),
  CONSTRAINT study_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.study_progress (
  user_id uuid NOT NULL,
  subtopic_id text NOT NULL,
  status text NOT NULL DEFAULT 'not_started'::text,
  minutes_spent integer NOT NULL DEFAULT 0,
  self_confidence numeric,
  ai_mastery numeric,
  notes text NOT NULL DEFAULT ''::text,
  difficulty text,
  last_studied_at timestamp with time zone,
  first_completed_at timestamp with time zone,
  revision_due_at timestamp with time zone,
  revision_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT study_progress_pkey PRIMARY KEY (user_id, subtopic_id),
  CONSTRAINT study_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.subjects (
  id integer NOT NULL DEFAULT nextval('subjects_id_seq'::regclass),
  title text NOT NULL,
  weight_percentage numeric,
  CONSTRAINT subjects_pkey PRIMARY KEY (id)
);
CREATE TABLE public.subtopics (
  id integer NOT NULL DEFAULT nextval('subtopics_id_seq'::regclass),
  topic_id integer,
  title text NOT NULL,
  status text DEFAULT 'not started'::text,
  self_confidence numeric,
  ai_mastery numeric,
  time_spent_minutes integer DEFAULT 0,
  last_studied_date date,
  revision_due_date date,
  times_revised integer DEFAULT 0,
  CONSTRAINT subtopics_pkey PRIMARY KEY (id),
  CONSTRAINT subtopics_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id)
);
CREATE TABLE public.topics (
  id integer NOT NULL DEFAULT nextval('topics_id_seq'::regclass),
  subject_id integer,
  title text NOT NULL,
  priority_weight numeric DEFAULT 1.0,
  time_estimate_minutes integer,
  CONSTRAINT topics_pkey PRIMARY KEY (id),
  CONSTRAINT topics_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id)
);