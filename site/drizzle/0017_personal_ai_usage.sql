CREATE TABLE IF NOT EXISTS personal_ai_usage (
  owner_hash TEXT NOT NULL,
  request_id TEXT NOT NULL,
  day TEXT NOT NULL,
  status TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  PRIMARY KEY(owner_hash,request_id)
);
CREATE INDEX IF NOT EXISTS personal_ai_usage_day ON personal_ai_usage(owner_hash,day);
