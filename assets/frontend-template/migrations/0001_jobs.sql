CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  gender TEXT NOT NULL,
  file_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  expires_at INTEGER NOT NULL,
  completed_count INTEGER NOT NULL DEFAULT 0,
  current_task TEXT NOT NULL DEFAULT '等待进入分析队列',
  interaction_id TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  retry_count INTEGER NOT NULL DEFAULT 0,
  overview TEXT NOT NULL DEFAULT '',
  career_1 TEXT NOT NULL DEFAULT '',
  career_2 TEXT NOT NULL DEFAULT '',
  career_3 TEXT NOT NULL DEFAULT '',
  career_4 TEXT NOT NULL DEFAULT '',
  love TEXT NOT NULL DEFAULT '',
  life TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created
ON jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_jobs_expires
ON jobs(expires_at);