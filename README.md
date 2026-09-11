# VARAI — The Internet's Referee

Backend + GenLayer integration.

Football's most argued-about moments — penalty or dive, red or yellow, handball or shoulder — submitted as cases and judged by a panel of independent AI validators running a GenLayer **Intelligent Contract**.

---

## 1. What VARAI does

A user submits a controversial decision: the fixture, the minute, what happened, and whatever evidence they have. VARAI records the case, sends it to an Intelligent Contract on GenLayer, and the contract judges it.

The verdict comes back as a decision (`NO_PENALTY`), a confidence value, a **real** consensus count from the validators who voted, structured criteria, and a transaction hash anyone can check.

Supported incidents: penalty · foul · card · handball · goal · offside.

---

## 2. Why GenLayer is necessary

A single AI answering "was that a penalty?" is just an opinion with a logo on it. You cannot audit it, you cannot verify it, and you have to trust whoever runs the server.

Football arguments need the opposite: a decision **multiple independent parties reached separately and agreed on**, recorded where nobody can quietly change it afterwards.

That is precisely what GenLayer provides:

| Requirement | How GenLayer delivers it |
|---|---|
| Multiple independent judges | Validators each execute the contract on their own node with their own LLM |
| Agreement, not one opinion | The Equivalence Principle — validators vote on the leader's result |
| Nobody can alter the verdict | It is committed on-chain in contract state |
| Anyone can verify | The transaction hash is public and inspectable |
| Natural-language reasoning on-chain | Intelligent Contracts run LLM inference natively — impossible on a normal EVM chain |

**This is why the judgment lives in the contract, not the backend.** The backend stores cases and relays them. It contains no refereeing logic whatsoever — grep it: there is no code anywhere that decides whether something was a foul.

---

## 3. Architecture

```
Frontend
   │  POST /api/cases            → case stored (DRAFT)
   │  POST /api/cases/:id/submit
   ▼
Backend API  (Node + TypeScript + Express)
   │  validate → persist → relay
   ▼
services/genlayer  ← the ONLY module that touches the chain
   │  writeContract('open_case')   → case recorded on-chain
   │  writeContract('judge_case')  → ★ consensus event ★
   ▼
FootballCourt Intelligent Contract  (contracts/football_court.py)
   │  leader judges the case with a structured framework
   │  each validator independently re-judges it
   │  validators AGREE only if the operative decision matches
   ▼
Validator consensus  →  verdict written to contract state
   │
   ▼
Backend reads get_verdict() + real votes from the receipt
   │  persists to PostgreSQL
   ▼
Frontend renders "GenLayer Decision" + transaction hash
```

### Project structure

```
contracts/football_court.py   ← THE INTELLIGENT CONTRACT (all judging happens here)
db/schema.sql                 PostgreSQL schema
scripts/                      deploy + keygen
src/
  config/                     env + demo-mode switch
  routes/                     endpoint definitions
  controllers/                request/response handling
  services/
    caseService.ts            workflow orchestration
    genlayer/                 ← ALL chain code isolated here
      client.ts               SDK bootstrap
      index.ts                open_case / judge_case / read verdict
      consensus.ts            extracts REAL validator votes
      demo.ts                 clearly-labelled demo verdicts
  models/store.ts             Postgres (+ in-memory fallback)
  types/                      shared domain types
  utils/                      validation, errors
  lib/                        logger, example frontend client
tests/api.test.ts             15 tests incl. integrity assertions
```

---

## 4. The Intelligent Contract

`contracts/football_court.py`

### Structured judging framework

The contract never asks "was this a penalty?". It forces a reasoning sequence:

1. **CASE FACTS** — only what is explicitly established
2. **EVIDENCE** — which supplied item supports each fact
3. **RULE** — the governing Law of the Game (injected per incident type)
4. **ANALYSIS** — applying the rule to established facts
5. **ALTERNATIVES** — the strongest competing reading, and why it loses
6. **VERDICT** — the best-supported conclusion
7. **CONFIDENCE** — how strongly the facts support it

### It refuses to invent facts

The prompt states plainly that the model has **not** watched any video and has **not** opened any URL — evidence links are references only. If the supplied facts cannot support a verdict it must return `INSUFFICIENT_EVIDENCE`, and the contract caps confidence at 0.5 when it does. Returning "I can't tell" is treated as a correct outcome, not a failure.

### How consensus actually works

The contract uses `gl.vm.run_nondet(leader_fn, validator_fn)` — **not** `gl.eq_principle.strict_eq`.

That choice matters. Comparing raw LLM output with `strict_eq` is both a linter error (`GL-S03`) and wrong for subjective judgment: two honest referees phrase reasoning differently while reaching the same call. Strict equality would fail almost every time.

Instead each validator **independently re-judges the same case** and agrees only if the *operative* parts match:

```python
1. decision must be identical                      # NO_PENALTY == NO_PENALTY
2. confidence within ±0.25                         # honest variance allowed
3. evidenceSufficiency must match                  # stops one validator inventing facts
#  reasoning prose is deliberately NOT compared
```

So the consensus percentage VARAI displays is a **real count of independent agreement**, not a decorative number.

### Methods

| Method | Kind | Purpose |
|---|---|---|
| `open_case(case_id, payload)` | write | Records the case on-chain. Deterministic — no AI. |
| `judge_case(case_id)` | write | **The judgment.** Validators execute and vote. |
| `get_verdict(case_id)` | view | The stored structured verdict |
| `get_case(case_id)` | view | The stored case |
| `has_verdict(case_id)` | view | Whether judging completed |
| `get_case_count()` | view | Total cases opened |

---

## 5. API

Base URL: `http://localhost:4000`

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health + **whether you are in DEMO or GENLAYER mode** |
| `GET` | `/api/meta` | Incident types, valid decisions, evidence kinds |
| `POST` | `/api/cases` | Create a case (does not judge) |
| `GET` | `/api/cases` | List cases (`?status=&limit=&offset=`) |
| `GET` | `/api/cases/:id` | One case, with its verdict if judged |
| `POST` | `/api/cases/:id/submit` | **Send to GenLayer and judge** |
| `GET` | `/api/cases/:id/status` | Poll status |
| `GET` | `/api/verdicts/:id` | Verdict by verdict id **or** case id |

### Create a case

```bash
curl -X POST localhost:4000/api/cases -H 'content-type: application/json' -d '{
  "competition": "Premier League",
  "homeTeam": "Arsenal",
  "awayTeam": "Chelsea",
  "minute": 74,
  "incidentType": "PENALTY_CLAIM",
  "description": "Attacker cuts inside the area and is clipped on the trailing leg by the defender before any touch on the ball.",
  "refereeCall": "PLAY_ON",
  "evidence": [{ "kind": "VIDEO_URL", "value": "https://example.com/clip.mp4" }]
}'
```

### Judge it

```bash
curl -X POST localhost:4000/api/cases/<id>/submit
```

Returns a verdict:

```jsonc
{
  "ok": true,
  "verdict": {
    "decision": "NO_PENALTY",
    "confidence": 0.78,
    "consensus": { "agree": 7, "disagree": 2, "total": 9, "ratio": 0.7778 },
    "consensusPercent": 78,
    "reasoning": "The defender plays the ball first…",
    "criteria": {
      "location": "penalty_area",
      "playerContact": "confirmed",
      "ballContact": "confirmed",
      "challengeIntensity": "low",
      "evidenceSufficiency": "sufficient"
    },
    "alternativeInterpretation": "…",
    "validatorResults": [
      { "validatorIndex": 0, "address": "0x…", "vote": "AGREE", "isLeader": true }
    ],
    "genlayerTransaction": "0x8f2a…c41d",
    "genlayerContract": "0x…",
    "explorerUrl": "https://…/tx/0x8f2a…",
    "source": "GENLAYER",
    "demo": false,
    "label": "GenLayer Decision"
  }
}
```

### Case status values

`DRAFT` → `SUBMITTED` → `UNDER_REVIEW` → `JUDGING` → `VERDICT_READY`, or `FAILED`.

### Decisions

`PENALTY` `NO_PENALTY` `FOUL` `NO_FOUL` `RED_CARD` `YELLOW_CARD` `NO_CARD` `HANDBALL` `NO_HANDBALL` `GOAL` `NO_GOAL` `OFFSIDE` `ONSIDE` — plus `INSUFFICIENT_EVIDENCE` for any incident type.

The backend rejects a verdict whose decision is outside the vocabulary for that incident type.

---

## 6. Environment variables

See `.env.example`.

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | Default `4000` |
| `VARAI_DEMO_MODE` | no | `true` = local placeholders. Default `false`. |
| `DATABASE_URL` | no | Blank → in-memory store (dev only) |
| `DATABASE_SSL` | no | `true` for Neon/Supabase/managed PG |
| `LOG_LEVEL` | no | `debug\|info\|warn\|error`. Default: `info` in production, `debug` locally |
| `GENLAYER_NETWORK` | yes* | `localnet` · `studionet` · `testnetAsimov` |
| `GENLAYER_CONTRACT_ADDRESS` | yes* | From `npm run deploy:contract` |
| `GENLAYER_PRIVATE_KEY` | yes* | From `npm run genkey`. **Never commit.** |
| `GENLAYER_RPC_URL` | no | Custom endpoint |
| `GENLAYER_EXPLORER_BASE` | no | Builds a verification link |

\* required unless `VARAI_DEMO_MODE=true`. The server refuses to start if it can neither reach GenLayer nor run in demo mode — it will never silently fall back to fake verdicts.

---

## 7. Local development

```bash
npm install
cp .env.example .env     # demo mode by default
npm run dev
```

Open **http://localhost:4000** — one server hosts everything:

| Path | What |
|---|---|
| `/` | Landing page (generated from `design/`) |
| `/console.html` | Live case intake console |
| `/api/*` | The REST API |

### Project layout

```
public/        index.html (landing) + console.html   ← served at /
src/           API: routes, controllers, services, models
  services/genlayer/   all GenLayer code, isolated
contracts/     football_court.py — the Intelligent Contract
design/        design system + generators for the landing page
db/            schema.sql
tests/         16 tests
```

### Commands

```bash
npm run dev          # hot-reload dev server
npm test             # 16 tests
npm run typecheck    # tsc --noEmit
npm run build        # compile to dist/
npm start            # run compiled build
npm run design       # regenerate public/index.html from design/src
npm run design:card  # re-export the 1080x1080 verdict card
```

The landing page is **generated**. Edit `design/src/page.py`, `app.css`,
`app.js` or `tokens.css`, then run `npm run design`. Do not edit
`public/index.html` by hand — it is overwritten on every build.

## 8. GenLayer configuration

```bash
# 1. Create the backend signing account (users never connect a wallet)
npm run genkey
#    → GENLAYER_PRIVATE_KEY=0x…   put it in .env, fund the address

# 2. Deploy the Intelligent Contract
npm run deploy:contract
#    → GENLAYER_CONTRACT_ADDRESS=0x…   put it in .env

# 3. Turn off demo mode
#    VARAI_DEMO_MODE=false

npm run dev
```

Verify you are live:

```bash
curl localhost:4000/api/health
# { "mode": "GENLAYER", "genlayer": { "configured": true, … }, "warning": null }
```

You can also paste `contracts/football_court.py` straight into the [GenLayer Studio](https://studio.genlayer.com) to watch validators vote in real time.

---

## 9. Demo mode

Demo mode exists so the frontend can be built before a contract is deployed. It is walled off so it can never be mistaken for a real judgment:

| | Demo verdict | GenLayer verdict |
|---|---|---|
| `source` | `"DEMO"` | `"GENLAYER"` |
| `demo` | `true` | `false` |
| `label` | `"DEMO VERDICT — NOT JUDGED BY GENLAYER"` | `"GenLayer Decision"` |
| `genlayerTransaction` | `null` | real hash |
| `validatorResults` | `[]` | real votes |
| `consensus.total` | `0` | real count |
| response | includes `warning` | no warning |
| `/api/health` `mode` | `"DEMO"` | `"GENLAYER"` |

No transaction hashes are invented. No validator votes are invented. The demo decision comes from a transparent keyword heuristic that says so in its own reasoning text.

In the frontend, gate the badge on:

```ts
if (isGenLayerVerdict(verdict)) { /* show "GenLayer Decision" + tx */ }
else                            { /* show the DEMO banner */ }
```

---

## 10. Production deployment

> **Full step-by-step git + free-hosting walkthrough: [DEPLOY.md](./DEPLOY.md)**
> Free stack: Render (API) + Neon (Postgres) + Cloudflare Pages (frontend) — $0, no credit card required.

### Asynchronous submission (required in production)

GenLayer judging runs live LLM inference across validators and can exceed the
30–60s request timeout enforced by most hosts. Submit with `?async=true` to get
`202 Accepted` immediately, then poll `GET /api/cases/:id/status` — the verdict
is included inline once ready.

```bash
curl -X POST "$API/api/cases/$ID/submit?async=true"   # 202 Accepted
curl "$API/api/cases/$ID/status"                      # poll → verdict
```

The synchronous form (no `?async=true`) remains available for local use and demo mode.


```bash
npm run build && npm start
```

Checklist:

- [ ] `VARAI_DEMO_MODE=false`
- [ ] `DATABASE_URL` → managed Postgres, `DATABASE_SSL=true`
- [ ] `db/schema.sql` applied
- [ ] `GENLAYER_PRIVATE_KEY` from a secret manager, **never** in git
- [ ] Signing address funded
- [ ] `CORS_ORIGIN` set to your real frontend origin
- [ ] `GENLAYER_EXPLORER_BASE` set so users can verify verdicts

`judge_case` involves live LLM inference across validators and can take tens of seconds. For production traffic, move the submit call onto a job queue and let the frontend poll `/api/cases/:id/status`.

---

## Integrity guarantees

The behaviours this codebase enforces, each covered by a test:

1. **No verdict is ever fabricated.** If GenLayer fails, the case becomes `FAILED` and the API returns `502`. There is no fallback decision.
2. **No transaction hash is ever invented.** Demo verdicts carry `null`.
3. **No validator result is ever invented.** Votes are read from the transaction receipt; when there are none we report zero.
4. **Evidence is never claimed as verified.** `verifiedByGenlayer` stays `false` unless an execution actually verified it.
5. **Demo output is never disguised** as a GenLayer judgment.
6. **The backend never judges.** All refereeing logic lives in the Intelligent Contract.

### Security

Zod validation on every input · URL scheme allow-list with SSRF protection (blocks `javascript:`, `data:`, localhost and private ranges) · parameterised SQL everywhere · `helmet` · rate limiting · 256 kB body cap · length caps on descriptions and evidence · no wallet connection · no personal data stored.

## Security headers (CSP)

`src/lib/csp.ts` builds a strict Content-Security-Policy. The generated pages in
`public/` are self-contained — fonts and images are `data:` URIs, there are no CDN
scripts and no inline event handlers — so the policy needs **no**
`script-src 'unsafe-inline'`.

Each page has one inline `<script>`. Rather than rewriting HTML per request to add
a nonce, the server hashes those inline blocks at startup and allows exactly those
`sha256` values. Re-run `npm run design` and the hash is recomputed on next boot —
no manual step. `style-src` keeps `'unsafe-inline'` because the design system uses
inline `style=""` attributes, which hashes cannot cover.

Verified with a real browser: 0 CSP violations, 0 JS errors on `/` and
`/console.html`.

## Hosting the frontend separately

The API and pages ship together, but you can host the static pages elsewhere
(Netlify, Vercel, Cloudflare Pages) and point them at the Render API:

1. Upload `public/index.html` and `public/console.html` to the static host.
2. Tell the page where the API lives, either by appending
   `?api=https://your-api.onrender.com` to the URL, or by setting
   `window.VARAI_API_BASE` before the inline script runs.
3. On the API, set `CORS_ORIGIN` to your frontend origin (e.g.
   `https://varai.netlify.app`) — not `*`. That value is also added to the CSP
   `connect-src`, so the browser is allowed to call it.

Worth knowing: this splits the deployment but does **not** avoid Render's cold
start. The pages load instantly; the first API call still wakes the backend.

## Appeals (v2)

A decided case can be appealed once, with new evidence. This is a **second
consensus event on GenLayer**, not a re-run of the first.

`POST /api/cases/:id/appeal  { "newEvidence": "..." }`

The contract method `appeal_case(case_id, new_evidence)` shows an appeal panel
the original ruling *and* the new evidence, and applies an explicit standard:
**the burden of proof is on the appellant**. The original decision stands unless
the new evidence positively contradicts or materially undermines the findings it
rested on. Evidence that merely re-argues the original facts is recorded as
`immaterial` and the ruling is upheld.

Two integrity properties are enforced in the contract, not the UI:

- The model cannot report `UPHELD` while quietly changing the decision (or the
  reverse) — outcome and decision are reconciled before the result is returned.
- Validators must agree on the *outcome*, the *decision* and whether the new
  evidence was material. Prose is never compared.

The original verdict is never overwritten. The contract keeps appeals in a
separate map, so both rulings stay readable on-chain with their own transaction
hashes (`get_verdict` / `get_appeal`). In the database the appeal is a second
verdict row linked by `appeal_of`.

Appeals are **unavailable in demo mode** — an appeal without real validator
consensus would be theatre.

Verified live on studionet:

| Grounds | Assessment | Outcome |
| --- | --- | --- |
| "I watched it again, still think it was fine" | `immaterial` | UPHELD (PENALTY stands) |
| "Goal-line angle shows the defender played the ball first" | `material` | OVERTURNED (PENALTY -> NO_PENALTY) |
| Handball: "ball deflected off his own thigh at close range" | `material` | OVERTURNED |

New contract methods: `appeal_case`, `get_appeal`, `has_appeal`,
`get_appeal_count`.
