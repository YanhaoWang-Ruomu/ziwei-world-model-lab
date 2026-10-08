CREATE TABLE ai_usage (
  request_id TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  reserved_micro INTEGER NOT NULL CHECK(reserved_micro >= 0),
  status TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER
);
CREATE INDEX idx_ai_usage_day ON ai_usage(day);
