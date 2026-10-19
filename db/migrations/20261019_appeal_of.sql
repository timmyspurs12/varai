-- Add appeal support to an existing VARAI database.
-- The runner executes this file inside a transaction and records the version.
-- Every statement is also idempotent so it is safe to repair an interrupted or
-- manually-applied migration.
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

  -- Remove the legacy one-verdict-per-case uniqueness so appeals can be saved.
  FOR item IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.verdicts'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[case_att]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.verdicts DROP CONSTRAINT %I', item.conname);
  END LOOP;

  -- Handle an equivalent standalone unique index, if a deployment used one.
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_verdicts_one_original
  ON public.verdicts(case_id) WHERE appeal_of IS NULL;
CREATE INDEX IF NOT EXISTS idx_verdicts_appeal_of
  ON public.verdicts(appeal_of);
