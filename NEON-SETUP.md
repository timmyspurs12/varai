# Neon Setup — a walkthrough

Getting VARAI a free PostgreSQL database. About 10 minutes, no credit card.

Everything here was tested against a real PostgreSQL 17 server (the same major
version Neon runs) using this exact `db/schema.sql` and this exact app.

---

## Why you need this at all

Without a database VARAI keeps cases **in memory**. That is fine on your laptop,
but it means:

- every restart wipes every case
- on Render (which sleeps after 15 minutes idle) your data disappears constantly

You will see this in the log when no database is configured:

```
[WRN] DATABASE_URL not set — using in-memory store (data is lost on restart)
```

Once Neon is wired up correctly, that line is replaced by:

```
[INF] PostgreSQL connected
```

That one line is how you know it worked.

**Neon rather than the alternatives:** Render's own free Postgres is *deleted*
30 days after creation, and Supabase pauses a project after a week of
inactivity. Neon's free tier does not expire.

---

## Step 1 — Create the account

Go to **[neon.tech](https://neon.tech)** → **Sign up** → continue with GitHub
(fastest, no password to invent).

No credit card is requested. If you are ever asked for one, you are on the wrong
plan — back out and pick **Free**.

---

## Step 2 — Create the project

After signing up you land on a "Create project" screen.

| Field | What to put |
|---|---|
| **Project name** | `varai` |
| **Postgres version** | 17 (the default) |
| **Region** | The one closest to your Render region. Frankfurt if you picked Frankfurt. |

Click **Create project**.

> **Region matters more than it looks.** Your API talks to the database on
> every request. API in Frankfurt + database in Singapore adds latency to
> every single call. Keep them on the same continent.

---

## Step 3 — Copy the connection string

Neon shows a **Connection string** box immediately after creating the project.
It looks like this:

```
postgresql://neondb_owner:npg_AbC123xyz@ep-cool-name-a1b2c3d4-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

Click the copy icon. Two things to know:

1. **The password is only fully visible once.** Paste it somewhere safe now.
   If you lose it, Neon can generate a new one — you do not have to start over.
2. **Choose the "Pooled connection" option** if you see a toggle. The hostname
   will contain `-pooler`. It handles many short-lived connections better,
   which is exactly what a web API does.

That whole string is your `DATABASE_URL`.

---

## Step 4 — Create the tables

A fresh Neon database is **empty**. Your app expects four tables, so you have to
load `db/schema.sql` once. If you skip this, the app connects fine and then
errors on the first request with `relation "cases" does not exist`.

### The easy way — Neon's SQL Editor (no install)

1. In the Neon dashboard, click **SQL Editor** in the left sidebar
2. Open `db/schema.sql` from the project in any text editor
3. Select all, copy, paste into the SQL Editor
4. Click **Run**

You should see a series of success messages. One **notice** is expected and
harmless:

```
NOTICE: trigger "cases_touch" for relation "cases" does not exist, skipping
```

That is the script cleaning up before creating the trigger. Not an error.

### Verify it worked

Still in the SQL Editor, run:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

You must get exactly these four:

```
cases
evidence
validator_results
verdicts
```

If you see fewer, the paste was truncated — clear the editor and paste the whole
file again.

### The psql way (only if you have psql installed)

```bash
psql "postgresql://neondb_owner:npg_...@ep-....neon.tech/neondb?sslmode=require" -f db/schema.sql
```

Keep the quotes — the `?` in the URL breaks the shell otherwise.

---

## Step 5 — Point the app at it

### Locally

Create or edit `.env` in the project root:

```bash
DATABASE_URL=postgresql://neondb_owner:npg_AbC123xyz@ep-cool-name-a1b2c3d4-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
DATABASE_SSL=true
```

No quotes around the value. No spaces around the `=`.

`.env` is already in `.gitignore` — never commit it.

Then:

```bash
npm run dev
```

Look at the very first log lines. You want:

```
[INF] PostgreSQL connected
[INF] VARAI API listening {"port":4000}
```

### On Render

**Environment** tab → add two variables:

| Key | Value |
|---|---|
| `DATABASE_URL` | the full Neon string |
| `DATABASE_SSL` | `true` |

Save. Render redeploys automatically.

---

## Step 6 — Prove it persists

This is the actual point of the exercise, so confirm it rather than assume it.

```bash
# 1. Submit a case
curl -X POST http://localhost:4000/api/cases \
  -H 'Content-Type: application/json' \
  -d '{"competition":"Premier League","homeTeam":"Arsenal","awayTeam":"Chelsea",
       "minute":74,"incidentType":"PENALTY_CLAIM",
       "description":"Defender clips the attacker inside the box before touching the ball."}'

# 2. Stop the server (Ctrl+C) and start it again
npm run dev

# 3. The case should still be there
curl http://localhost:4000/api/cases
```

If the case survives the restart, Neon is working. Under the in-memory store the
list comes back empty.

You can also see the rows in Neon's SQL Editor:

```sql
SELECT home_team, away_team, minute, status FROM cases ORDER BY created_at DESC;
SELECT decision, confidence, source FROM verdicts;
```

---

## Test your connection string without deploying

Rather than push to Render and wait, check the URL locally:

```bash
DATABASE_URL="postgresql://neondb_owner:npg_...@ep-....neon.tech/neondb?sslmode=require" \
DATABASE_SSL=true npm run db:check
```

It reports, in order: whether the URL parses, whether it connects, and whether
all four tables exist — naming exactly what is wrong if something is.

```
  ok  host ep-cool-name-a1b2c3d4-pooler.eu-central-1.aws.neon.tech
  ok  database neondb
  ok  connected — PostgreSQL 17.5
  ok  all 4 tables present
  ok  0 case(s), 0 verdict(s) stored

Database is ready.
```

Run the same command on Render via **Shell** to check the deployed environment.

---

## Things that will trip you up

### "relation cases does not exist"

Step 4 did not run, or ran against a different database. Re-run `db/schema.sql`
in the SQL Editor and re-check the four table names.

### The server refuses to start

Good — it fails fast instead of running half-broken. It prints the cause and,
where it can, the fix:

```
VARAI failed to start: password authentication failed for user 'x' (code 28P01)
Hint: Wrong credentials. Copy a fresh connection string from your database
      dashboard (Neon: Connection string, pooled).
```

Common causes by message:

| Message | Cause |
|---|---|
| `database is missing tables (found 0 of 4)` | Step 4 was skipped — load `db/schema.sql` |
| `password authentication failed` (28P01) | Wrong/stale credentials — copy the string again |
| `ENOTFOUND` | Hostname typo, or the string was truncated on copy |
| `ECONNREFUSED` | Wrong port, or nothing listening there |
| `ETIMEDOUT` | Unreachable — check region/firewall |
| `all connection attempts failed: …` | Every resolved address failed; the individual reasons are listed |

Most of these come down to the `DATABASE_URL` being truncated, stale, or wrapped
in quotes. Copy it fresh from the Neon dashboard, and make sure it still ends in
`?sslmode=require`.

### It still says "using in-memory store"

The app never saw `DATABASE_URL`. Check that `.env` is in the **project root**
(next to `package.json`), that the line has no leading spaces, and that you
restarted the server — `.env` is only read at startup.

### `{"msg":"failed to start","err":""}` with an empty error

You are on an older build. `AggregateError` — which Node throws when every
address a hostname resolves to fails — has an empty `.message`, so the real
cause was swallowed. Pull the latest code; startup errors now print the
underlying reasons and a hint.

### An SSL warning in the log

```
Warning: SECURITY WARNING: The SSL modes 'prefer', 'require' ... treated as aliases for 'verify-full'
```

Fixed in current builds. `sslmode` is stripped from the URL before it reaches
the driver — TLS is configured explicitly in code instead, so the warning is
gone without weakening the connection. Keep `?sslmode=require` in your
`DATABASE_URL`; the app handles it.

### Confirming Neon is actually attached

`GET /api/health` reports it:

```json
"database": { "kind": "postgres", "ok": true, "persistent": true }
```

`"kind": "memory"` with `"persistent": false` means `DATABASE_URL` never
reached the app and your cases will vanish on the next restart. If the database
is unreachable the endpoint returns **503** rather than a misleading `ok: true`.

### First query after a quiet period is slow

Neon scales computers to zero after 5 minutes idle. The next query wakes it,
which takes a second or two. This is why the free tier costs nothing when you
are not using it, and it is not a bug.

---

## What the free tier gives you

| | Free |
|---|---|
| Cost | $0, permanently, no card |
| Storage | 0.5 GB — tens of thousands of cases |
| Compute | 100 hours/month |
| Projects | up to 100 |
| Idle behaviour | scales to zero, data preserved |
| Expiry | none |

For a demo app judging football incidents you will not come close to any limit.

Important: it fails **soft**. Exceed compute and the database suspends until the
month resets — your data is never deleted.

---

## What I verified before writing this

Not assumptions — actually run:

- `db/schema.sql` loaded into PostgreSQL 17 → all four tables plus indexes and
  the trigger created, with only the harmless notice above
- App started against real Postgres → `[INF] PostgreSQL connected`
- Case submitted and judged → rows written correctly to `cases`, `evidence` and
  `verdicts`, with `source = DEMO` and a NULL transaction as intended
- Server restarted → the case was still there (the in-memory store loses it)
- Bad credentials → server exits with a clear error instead of starting broken
