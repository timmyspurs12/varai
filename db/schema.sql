-- ============================================================
-- VARAI — PostgreSQL schema
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
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
  -- Set when this row is an APPEAL ruling; points at the verdict it reviewed.
  -- The original verdict row is never modified, so a case can hold both.
  appeal_of                 TEXT        REFERENCES verdicts(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- At most ONE original verdict and ONE appeal ruling per case. A plain
  -- UNIQUE(case_id) would reject the appeal row outright.
  UNIQUE (case_id, appeal_of)
);

-- Keep the schema script usable against databases created before appeals.
-- CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
ALTER TABLE public.verdicts
  ADD COLUMN IF NOT EXISTS appeal_of TEXT;

DO $$
DECLARE
  case_att smallint;
  id_att smallint;
  appeal_att smallint;
  item record;
BEGIN
  SELECT attnum INTO case_att FROM pg_attribute
    WHERE attrelid = 'public.verdicts'::regclass AND attname = 'case_id' AND NOT attisdropped;
  SELECT attnum INTO id_att FROM pg_attribute
    WHERE attrelid = 'public.verdicts'::regclass AND attname = 'id' AND NOT attisdropped;
  SELECT attnum INTO appeal_att FROM pg_attribute
    WHERE attrelid = 'public.verdicts'::regclass AND attname = 'appeal_of' AND NOT attisdropped;

  IF case_att IS NULL OR id_att IS NULL OR appeal_att IS NULL THEN
    RAISE EXCEPTION 'verdicts is missing a required id, case_id, or appeal_of column';
  END IF;

  -- The self-reference is present on a fresh schema but must be added when
  -- upgrading an older verdicts table.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.verdicts'::regclass
      AND contype = 'f'
      AND confrelid = 'public.verdicts'::regclass
      AND conkey = ARRAY[appeal_att]::smallint[]
      AND confkey = ARRAY[id_att]::smallint[]
  ) THEN
    ALTER TABLE public.verdicts
      ADD CONSTRAINT verdicts_appeal_of_fkey
      FOREIGN KEY (appeal_of) REFERENCES public.verdicts(id) ON DELETE SET NULL;
  END IF;

  -- Older schemas enforced one verdict per case with UNIQUE(case_id). Remove
  -- that constraint so a second, appeal verdict can be stored.
  FOR item IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.verdicts'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[case_att]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.verdicts DROP CONSTRAINT %I', item.conname);
  END LOOP;

  -- Also remove a legacy standalone unique index on case_id, if there is one.
  FOR item IN
    SELECT ns.nspname, idx.relname
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace ns ON ns.oid = idx.relnamespace
    WHERE i.indrelid = 'public.verdicts'::regclass
      AND i.indisunique
      AND NOT i.indisprimary
      AND i.indpred IS NULL
      AND i.indnkeyatts = 1
      AND i.indkey[0] = case_att
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', item.nspname, item.relname);
  END LOOP;

  -- A composite unique constraint caps appeals at one per original verdict.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.verdicts'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[case_att, appeal_att]::smallint[]
  ) THEN
    ALTER TABLE public.verdicts
      ADD CONSTRAINT verdicts_case_id_appeal_of_key UNIQUE (case_id, appeal_of);
  END IF;
END;
$$;

-- UNIQUE treats NULLs as distinct, so the original-verdict slot needs its own
-- partial index to stay single.
CREATE UNIQUE INDEX IF NOT EXISTS idx_verdicts_one_original
  ON verdicts(case_id) WHERE appeal_of IS NULL;

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
CREATE INDEX IF NOT EXISTS idx_verdicts_appeal_of ON verdicts(appeal_of);
