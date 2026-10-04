CREATE TABLE world_runs (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES world_branches(id) ON DELETE CASCADE,
  engine_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  input_snapshot TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_world_runs_branch ON world_runs(branch_id,created_at);
CREATE UNIQUE INDEX world_run_input_unique ON world_runs(branch_id,input_hash);
