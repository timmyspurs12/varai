-- ============================================================
-- VARAI — PostgreSQL schema
-- Run:  psql "$DATABASE_URL" -f db/schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS cases (
  id               TEXT PRIMARY KEY,
  competition      TEXT        NOT NULL,
  home_team        TEXT        NOT NULL,
  away_team        TEXT        NOT NULL,
  minute           INTEGER     NOT NULL CHECK (minute >= 0 AND minute <= 130),
  incident_type    TEXT        NOT NULL CHECK (incident_type IN (
                     'PENALTY_CLAIM','FOUL_CLAIM','CARD_DECISION',
                     'HANDBALL_CLAIM','GOAL_CLAIM','OFFSIDE_CLAIM')),
  description      TEXT        NOT NULL,
  referee_call     TEXT,
  status           TEXT        NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
                     'DRAFT','SUBMITTED','UNDER_REVIEW','JUDGING','VERDICT_READY','FAILED')),
  genlayer_tx_hash TEXT,
  failure_reason   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence (
  id                   TEXT PRIMARY KEY,
  case_id              TEXT        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind                 TEXT        NOT NULL CHECK (kind IN (
                         'IMAGE_URL','VIDEO_URL','TEXT','OFFICIAL_MATCH_INFO')),
  value                TEXT        NOT NULL,
  -- Only ever true if a GenLayer execution actually fetched the reference.
  verified_by_genlayer BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verdicts (
  id                        TEXT PRIMARY KEY,
  case_id                   TEXT        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  decision                  TEXT        NOT NULL,
  confidence                NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  consensus_agree           INTEGER     NOT NULL DEFAULT 0,
  consensus_disagree        INTEGER     NOT NULL DEFAULT 0,
  consensus_total           INTEGER     NOT NULL DEFAULT 0,
  reasoning                 TEXT        NOT NULL,
  criteria                  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  alternative_interpretation TEXT,
  -- NULL for demo verdicts. Never fabricated.
  genlayer_transaction      TEXT,
  genlayer_contract         TEXT,
  -- 'GENLAYER' or 'DEMO' — the frontend must not conflate them.
  source                    TEXT        NOT NULL CHECK (source IN ('GENLAYER','DEMO')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id)
);

CREATE TABLE IF NOT EXISTS validator_results (
  id              TEXT PRIMARY KEY,
  verdict_id      TEXT        NOT NULL REFERENCES verdicts(id) ON DELETE CASCADE,
  validator_index INTEGER     NOT NULL,
  address         TEXT,
  -- Real protocol vote: AGREE | DISAGREE | TIMEOUT | NOT_VOTED | DETERMINISTIC_VIOLATION
  vote            TEXT        NOT NULL,
  is_leader       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cases_status      ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_created     ON cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_case     ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_verdicts_case     ON verdicts(case_id);
CREATE INDEX IF NOT EXISTS idx_validator_verdict ON validator_results(verdict_id);

-- keep updated_at honest
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_touch ON cases;
CREATE TRIGGER cases_touch BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
