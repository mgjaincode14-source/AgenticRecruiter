DROP TABLE IF EXISTS candidates CASCADE;
CREATE TABLE candidates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    github_username VARCHAR(1000),
    leetcode_username VARCHAR(1000),
    resume_url TEXT,
    linkedin_url TEXT,
    resume_score INT DEFAULT 0,
    github_score INT DEFAULT 0,
    coding_score INT DEFAULT 0,
    final_score INT DEFAULT 0,
    resume_reasoning TEXT,
    github_reasoning TEXT,
    coding_reasoning TEXT,
    stage VARCHAR(50) DEFAULT 'pending',
    rejection_reason TEXT,
    email_sent BOOLEAN DEFAULT FALSE,
    offer_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE ON public.candidates TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.candidates TO anon;
GRANT SELECT, INSERT, UPDATE ON public.candidates TO authenticated;
ALTER TABLE candidates ALTER COLUMN github_username TYPE TEXT;
ALTER TABLE candidates ALTER COLUMN leetcode_username TYPE TEXT;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
TRUNCATE TABLE candidates RESTART IDENTITY;
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS form_row        INT,
ADD COLUMN IF NOT EXISTS form_sheet_url  TEXT;

-- 1. Create interview_questions table
CREATE TABLE IF NOT EXISTS public.interview_questions (
    id SERIAL PRIMARY KEY,
    question_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.interview_questions (question_text)
SELECT q FROM (
  VALUES 
    ('Give a brief introduction about yourself'),
    ('Describe your experience working with React, FastAPI.')
) as t(q)
WHERE NOT EXISTS (SELECT 1 FROM public.interview_questions);
GRANT ALL ON TABLE public.interview_questions TO postgres, service_role, anon, authenticated;
GRANT ALL ON TABLE public.interviewed_candidates TO postgres, service_role, anon, authenticated;

-- Create the correctly named and structured table
CREATE TABLE IF NOT EXISTS public.interviewed_candidates (
    id                 SERIAL PRIMARY KEY,
    candidate_id       INTEGER UNIQUE REFERENCES public.candidates(id) ON DELETE CASCADE,
    interview_score    INTEGER DEFAULT -1,
    interview_reasoning TEXT,
    transcript         JSONB,
    interview_status   VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'cleared', 'rejected'
    shortlisted        BOOLEAN DEFAULT FALSE,
    recording_url TEXT,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Grant access
GRANT ALL ON TABLE public.interviewed_candidates TO postgres, service_role, anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role, anon, authenticated;
TRUNCATE TABLE interview_questions RESTART IDENTITY;
