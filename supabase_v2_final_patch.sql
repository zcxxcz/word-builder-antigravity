-- ============================================
-- V2 Migration Patch 2: Add user_id to sessions
-- Run in Supabase Dashboard → SQL Editor
-- ============================================

-- Fix 1: Add user_id to sessions if missing
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Ensure RLS is enabled on sessions and add policy
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own sessions" ON sessions;
CREATE POLICY "Users can manage their own sessions"
ON sessions FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix 2: Re-run Custom tables creation just in case it failed for the user earlier
DROP TABLE IF EXISTS custom_words CASCADE;
DROP TABLE IF EXISTS custom_wordlists CASCADE;

CREATE TABLE custom_wordlists (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE custom_words (
  id serial PRIMARY KEY,
  wordlist_id integer REFERENCES custom_wordlists(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word text NOT NULL,
  meaning_cn text,
  phonetic text DEFAULT '',
  example1 text DEFAULT '',
  example2 text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_wordlists_user_id ON custom_wordlists(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_words_wordlist_id ON custom_words(wordlist_id);
CREATE INDEX IF NOT EXISTS idx_custom_words_user_id ON custom_words(user_id);

ALTER TABLE custom_wordlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own custom_wordlists"
ON custom_wordlists FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own custom_words"
ON custom_words FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
