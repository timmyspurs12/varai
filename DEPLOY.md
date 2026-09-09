# VARAI — Git & Free Deployment Guide

Everything below is copy-paste ready for **Git Bash on Windows** (also works on macOS/Linux).

---

## Part 0 — What you need

| Thing | Cost | Why |
|---|---|---|
| [Git](https://git-scm.com/downloads) | free | Git Bash ships with it on Windows |
| [Node.js 20+](https://nodejs.org) | free | Runs the API |
| [GitHub account](https://github.com/signup) | free | Deploys pull from here |
| [Render account](https://render.com) | free, **no card** | Hosts the API |
| [Neon account](https://neon.tech) | free, **no card** | PostgreSQL that does not expire |
| GenLayer Studio / testnet account | free | Deploys the Intelligent Contract |

Check your tools:

```bash
git --version
node --version    # must be v20 or higher
npm --version
```

---

## Part 1 — Push to GitHub

> **Shortcut:** the repo ships with `push.sh`, which runs every step below and
> refuses to continue if a secret would be committed.
>
> ```bash
> git config --global user.name  "Your Name"
> git config --global user.email "you@example.com"
> bash push.sh                                       # checks + commits
> bash push.sh https://github.com/YOURNAME/varai.git # ...and pushes
> ```
>
> Prefer to understand each command? Do it manually below.

### 1. Open Git Bash in the project folder

Extract `varai.zip`, then right-click the `varai` folder → **Open Git Bash here**.
Or navigate manually:

```bash
cd ~/Desktop/varai        # Git Bash accepts this on Windows
pwd                       # confirm you are inside varai
ls                        # you should see package.json, src, design, public
```

### 2. Check your tools

```bash
git --version
node --version            # must be v20 or higher
```

### 3. Safety check BEFORE the first commit

```bash
cat .gitignore            # must list .env, node_modules/, dist/
git init
git add -A
git status --short        # review this list carefully
```

You should see about **51 files**. Confirm none of these appear:

```bash
git diff --cached --name-only | grep -E "node_modules|\.env$|dist/|__pycache__"
```

No output means you are clean. If it prints anything, stop and fix `.gitignore`
before continuing.

### 4. Identify yourself (once per machine)

```bash
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"
```

### 5. Commit

```bash
git branch -M main
git commit -m "VARAI — The Internet's Referee: GenLayer football judgment platform"
```

### 6. Create the GitHub repo and push

Create an **empty** repo at [github.com/new](https://github.com/new) named `varai`
— no README, no .gitignore, no licence. Then:

```bash
git remote add origin https://github.com/YOURNAME/varai.git
git push -u origin main
```

Prompted for a password? GitHub wants a **Personal Access Token**, not your
account password: [github.com/settings/tokens](https://github.com/settings/tokens)
→ *Generate new token (classic)* → tick **repo** → copy → paste as the password.

---

## Everyday git

```bash
git status                        # what changed
git add -A                        # stage everything
git commit -m "what you changed"  # save it
git push                          # send to GitHub
```

If you edited the landing page, regenerate it before committing so the served
page matches the source:

```bash
npm run design
git add -A && git commit -m "Update landing page" && git push
```

---

## If you commit `.env` by accident

```bash
git rm --cached .env
echo ".env" >> .gitignore
git commit -m "Remove .env from tracking"
git push
```

Then **rotate the key immediately** — `npm run genkey` and update it everywhere.
Anything pushed to GitHub must be treated as public forever, even after deletion.

---

## Part 2 — Free database (Neon)

> **New to Neon or stuck?** `NEON-SETUP.md` is a step-by-step walkthrough with
> screenshots-worth of detail, verification queries, and the common errors.


Neon over Supabase here: Neon's free tier **never expires**, while Supabase pauses a project after 1 week idle and Render's own free Postgres is deleted after 30 days.

1. [neon.tech](https://neon.tech) → sign up with GitHub
2. **Create project** → name `varai` → region closest to you (Frankfurt for Nigeria/Europe)
3. Copy the connection string — looks like:
   ```
   postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Create the tables:

```bash
# If you have psql:
psql "postgresql://user:pass@ep-xxx.../neondb?sslmode=require" -f db/schema.sql
```

No psql? Open the **SQL Editor** in the Neon dashboard, paste the contents of `db/schema.sql`, and hit Run.

**Free tier:** 0.5 GB storage, 100 compute-hours/month, scales to zero when idle. Plenty for VARAI.

---

## Part 3 — Deploy the API (Render)

1. [render.com](https://render.com) → sign up with GitHub
2. **New +** → **Web Service** → connect your `varai` repo
3. Settings:

| Field | Value |
|---|---|
| Runtime | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Instance type | **Free** |
| Health check path | `/api/health` |

4. **Environment** tab → add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `VARAI_DEMO_MODE` | `true` ← start here, flip later |
| `DATABASE_URL` | your Neon string |
| `DATABASE_SSL` | `true` |
| `CORS_ORIGIN` | your frontend URL, or `*` for now |

5. **Create Web Service.** First build takes ~3 minutes.

Verify:

```bash
curl https://varai-1.onrender.com/api/health
```

You should see `"mode":"DEMO"`. Visit the same URL in a browser for the live console.

> The repo includes `render.yaml`, so you can instead use **New + → Blueprint** and Render reads the config automatically.

### The free-tier catch

Free services **sleep after 15 minutes idle** and take 30–60s to wake. That's fine for a demo — just don't be surprised by the first slow request. 750 hours/month covers one always-on service.

---

## Part 4 — Go live with real GenLayer verdicts

### If you already have a funded key

`deploy:contract` reads `GENLAYER_PRIVATE_KEY` from a **`.env` file in the
project root**. It does not know about keys you generated in a previous
session, so `GENLAYER_PRIVATE_KEY is required to deploy` just means the file is
missing.

```bash
cd ~/Desktop/varai
bash setup-key.sh 0xYOUR_EXISTING_PRIVATE_KEY
```

That writes `.env`, keeps any Neon settings already in it, and prints the
address so you can confirm it is the one you funded. Then:

```bash
npm run deploy:contract   # prints GENLAYER_CONTRACT_ADDRESS
```

### Starting from scratch

```bash
npm install
npm run genkey            # prints GENLAYER_PRIVATE_KEY + address
bash setup-key.sh 0xTHE_KEY_IT_PRINTED
# fund the address, then:
npm run deploy:contract
```

Add both to Render → **Environment**:

| Key | Value |
|---|---|
| `GENLAYER_PRIVATE_KEY` | from `npm run genkey` |
| `GENLAYER_CONTRACT_ADDRESS` | from `npm run deploy:contract` |
| `GENLAYER_NETWORK` | `studionet` or `testnetAsimov` |
| `VARAI_DEMO_MODE` | **`false`** |

Save → Render redeploys. Confirm:

```bash
curl https://varai-1.onrender.com/api/health
# "mode":"GENLAYER"  ·  "configured":true
```

---

## Part 5 — Important: use async mode in production

Judging runs live LLM inference across validators and can take **longer than 60 seconds**. Render's proxy will cut the connection first.

So in production, submit asynchronously and poll:

```bash
# Returns 202 immediately
curl -X POST "https://varai-1.onrender.com/api/cases/<id>/submit?async=true"

# Poll until VERDICT_READY or FAILED — the verdict is included inline
curl "https://varai-1.onrender.com/api/cases/<id>/status"
```

Frontend pattern:

```js
await fetch(`/api/cases/${id}/submit?async=true`, { method: 'POST' });

const poll = setInterval(async () => {
  const s = await (await fetch(`/api/cases/${id}/status`)).json();
  if (s.status === 'VERDICT_READY') { clearInterval(poll); showVerdict(s.verdict); }
  if (s.status === 'FAILED')        { clearInterval(poll); showError(s.failureReason); }
}, 3000);
```

The synchronous call (no `?async=true`) is still fine locally and in demo mode.

---

## Part 6 — The frontend ships with the API

Nothing extra to deploy. The landing page and the live console are served by the
same Node service out of `public/`:

| URL | Page |
|---|---|
| `https://varai-1.onrender.com/` | Landing page |
| `https://varai-1.onrender.com/console.html` | Live case intake |

Because it is one origin, you can leave `CORS_ORIGIN` unset for the built-in
console. Only set it if a *separate* site calls the API.

Prefer the marketing page on a CDN that never sleeps? Upload `public/index.html`
to Cloudflare Pages or [app.netlify.com/drop](https://app.netlify.com/drop), then
point its buttons at your Render URL and set `CORS_ORIGIN` to the CDN origin.

---

## Free stack summary

| Layer | Service | Free tier | Catch |
|---|---|---|---|
| API | **Render** | 750 hrs/mo, no card | Sleeps after 15 min idle |
| Database | **Neon** | 0.5 GB, never expires | Scales to zero when idle |
| Frontend | **Cloudflare Pages** | Unlimited bandwidth | None |
| Contract | **GenLayer Studio** | Free | Testnet |

Total: **$0**, no credit card anywhere.

### Alternatives if Render doesn't suit

| Platform | Free tier | Trade-off |
|---|---|---|
| **Koyeb** | 1 service, scale-to-zero | 0.1 vCPU |
| **Fly.io** | 3 shared VMs | No sleep, needs a card |
| **Railway** | $5 trial credit | Not permanently free |

Avoid Vercel/Netlify *functions* for the API — their serverless timeouts (10–15s) are shorter than a judging call.

---

## Troubleshooting

### Startup says `GenLayer contract is NOT reachable`

The address you configured has no live contract behind it. Either it was never
really deployed (see below), or it is from a different network than
`GENLAYER_NETWORK`. Re-run `npm run deploy:contract` and use the printed address.

VARAI now calls `get_case_count()` on boot, so this is caught at startup rather
than on a user's first submission. A malformed value (e.g. a leftover
`0xTHE_PRINTED_ADDRESS` placeholder) is rejected even earlier — the server
refuses to start.

### `DATABASE_URL not set — using in-memory store`

Not an error. VARAI runs fine without a database; cases and verdicts just live in
memory and vanish on restart, which is what you want for a quick local run. Set
`DATABASE_URL` to a Neon/Postgres connection string (and load `db/schema.sql`)
when you want cases to survive a restart. Check it with `npm run db:check`.

### "Deployed" but every read says `Contract 0x... not found`

A GenLayer deploy can reach **FINALIZED** and still have failed. The address you
get back is meaningless if the contract never landed. Two real causes, both fixed
in this codebase:

1. **Stale runner version.** Line 1 of `contracts/football_court.py` pins the GenVM
   runner. `py-genlayer:test` and `py-genlayer:latest` are both rejected by studionet
   now and produce `execution_result: ERROR` / `payload: "invalid_contract"`. The
   working pin is the content hash already in the file:
   `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`

2. **Returning a Python dict from a `@gl.public.write` method.** The GenVM calldata
   encoder cannot serialise arbitrary dicts, so the transaction aborts *after* the
   validators have already voted — you see agreement but no stored verdict.
   `judge_case` therefore returns the verdict **JSON string**, not `json.loads(...)`.

`npm run deploy:contract` now checks the leader receipt and calls the contract back
before it prints an address, so a silent failure exits 1 instead of handing you a
dead address.

To inspect any suspicious transaction yourself, read the **leader** receipt —
validator entries are often just `VALIDATOR_QUORUM_REACHED` noise:

```
consensus_data.leader_receipt[0].execution_result   // SUCCESS | ERROR
consensus_data.leader_receipt[0].result.payload     // e.g. "invalid_contract"
```


**Build fails: `tsc: not found`** — use `npm ci`, not `npm ci --omit=dev`; TypeScript is a devDependency.

**`Cannot find module '/app/dist/server.js'`** — `start` must be `node dist/src/server.js`. Already correct in this repo.

**App crashes on boot** — `VARAI_DEMO_MODE=false` with no contract configured makes the server refuse to start, by design. Set demo mode to `true` or finish Part 4.

**Database connection fails / "failed to start"** — run `npm run db:check` with the
same `DATABASE_URL` to see exactly which step fails. Most often the Neon database
is empty: load `db/schema.sql` into it (NEON-SETUP.md Step 4). Also set
`DATABASE_SSL=true` and keep `?sslmode=require` in the URL.

**CORS errors in the browser** — `CORS_ORIGIN` must be the exact frontend origin, e.g. `https://varai.pages.dev`, no trailing slash.

**First request takes a minute** — free-tier cold start. Normal.
