-- ============================================
-- V2 Migration Patch 3: Update Core Tables Schema
-- Run in Supabase Dashboard → SQL Editor
-- ============================================

-- The previous "local-first" version of these tables had different columns.
-- We are dropping them and recreating them to match the new real-time architecture in api.js

DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS user_word_state CASCADE;

-- 1. User Word State
CREATE TABLE user_word_state (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word_text text NOT NULL,
  level integer DEFAULT 0,
  step text DEFAULT 'A',
  next_review text,
  last_reviewed text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, word_text)
);

-- 2. Sessions
CREATE TABLE sessions (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  mode text DEFAULT 'mixed',
  started_at text,
  ended_at text,
  total_words integer DEFAULT 0,
  correct_count integer DEFAULT 0,
  wrong_count integer DEFAULT 0,
  new_words integer DEFAULT 0,
  review_words integer DEFAULT 0,
  duration_sec integer DEFAULT 0
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_uws_word_text ON user_word_state(word_text);
CREATE INDEX IF NOT EXISTS idx_uws_user_id ON user_word_state(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

-- 4. Enable RLS
ALTER TABLE user_word_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies
CREATE POLICY "Users can manage their own word state"
ON user_word_state FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own sessions"
ON sessions FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
