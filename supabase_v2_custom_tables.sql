-- ============================================
-- V2 Migration Patch: Add custom words & wordlists
-- Run in Supabase Dashboard → SQL Editor
-- ============================================

-- Drop old tables if they exist with wrong schema
DROP TABLE IF EXISTS custom_words CASCADE;
DROP TABLE IF EXISTS custom_wordlists CASCADE;

-- 1. Custom wordlists (User specific)
CREATE TABLE custom_wordlists (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. Custom words (User specific)
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

-- 3. Indexes
CREATE INDEX idx_custom_wordlists_user_id ON custom_wordlists(user_id);
CREATE INDEX idx_custom_words_wordlist_id ON custom_words(wordlist_id);
CREATE INDEX idx_custom_words_user_id ON custom_words(user_id);

-- 4. Enable RLS
ALTER TABLE custom_wordlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_words ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies
CREATE POLICY "Users can manage their own custom_wordlists"
ON custom_wordlists FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own custom_words"
ON custom_words FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
