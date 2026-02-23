-- ============================================
-- 初一背单词 - Supabase 数据库初始化
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 用户学习进度（核心表）
create table user_word_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  word_text text not null,
  wordlist_source text,
  level integer default 0,
  last_seen_at text,
  next_review_at text,
  wrong_count integer default 0,
  correct_streak integer default 0,
  updated_at timestamptz default now(),
  unique(user_id, word_text)
);

-- 2. 学习记录
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date text not null,
  learned_count integer default 0,
  review_count integer default 0,
  spelling_accuracy real default 0,
  duration integer default 0,
  total_words integer default 0,
  mastered_new integer default 0,
  hardest_word text,
  created_at timestamptz default now(),
  unique(user_id, date, created_at)
);

-- 3. 用户设置
create table user_settings (
  user_id uuid references auth.users(id) on delete cascade not null,
  key text not null,
  value jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

-- 4. 自定义词表
create table custom_wordlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

-- 5. 自定义词汇
create table custom_words (
  id uuid primary key default gen_random_uuid(),
  wordlist_id uuid references custom_wordlists(id) on delete cascade not null,
  word text not null,
  meaning_cn text,
  phonetic text,
  unit text,
  example1 text,
  example2 text,
  created_at timestamptz default now()
);

-- 6. 启用行级安全 (RLS)
alter table user_word_state enable row level security;
alter table sessions enable row level security;
alter table user_settings enable row level security;
alter table custom_wordlists enable row level security;
alter table custom_words enable row level security;

-- 7. RLS 策略：用户只能访问自己的数据
create policy "Users own word state" on user_word_state
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users own sessions" on sessions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users own settings" on user_settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users own wordlists" on custom_wordlists
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users own custom words" on custom_words
  for all using (
    wordlist_id in (select id from custom_wordlists where user_id = auth.uid())
  )
  with check (
    wordlist_id in (select id from custom_wordlists where user_id = auth.uid())
  );

-- 8. 索引
create index idx_uws_user on user_word_state(user_id);
create index idx_uws_updated on user_word_state(user_id, updated_at);
create index idx_sessions_user on sessions(user_id);
create index idx_settings_user on user_settings(user_id);
