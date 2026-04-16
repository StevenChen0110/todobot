-- ============================================================
-- LINE Todo Bot — Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 待辦事項
CREATE TABLE IF NOT EXISTS todos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  task        TEXT NOT NULL,
  remind_at   TIMESTAMPTZ,
  completed   BOOLEAN NOT NULL DEFAULT FALSE,
  reminded    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 加速 Cron Job 查詢：只掃還沒提醒且未完成的到期 todo
CREATE INDEX IF NOT EXISTS idx_todos_remind
  ON todos (remind_at)
  WHERE completed = FALSE AND reminded = FALSE;

-- 依 user_id 查詢清單
CREATE INDEX IF NOT EXISTS idx_todos_user
  ON todos (user_id, completed, created_at DESC);

-- 對話狀態（多輪對話用）
CREATE TABLE IF NOT EXISTS conversation_states (
  user_id     TEXT PRIMARY KEY,
  state       TEXT NOT NULL DEFAULT 'idle',
  context     JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 啟用 RLS（server side 使用 service_role key 自動繞過）
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_states ENABLE ROW LEVEL SECURITY;

-- updated_at 自動更新 trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER todos_updated_at
  BEFORE UPDATE ON todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversation_states_updated_at
  BEFORE UPDATE ON conversation_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
