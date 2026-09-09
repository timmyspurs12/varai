# VARAI — The Internet's Referee

Controversial football decisions, submitted to GenLayer and independently
judged by AI validators.

**Live:** https://varai-1.onrender.com · [console](https://varai-1.onrender.com/console.html) · [health](https://varai-1.onrender.com/api/health)

This is **one project**. One install, one command, one URL.

---

## Run it (2 minutes)

You need **Node.js 20+** — check with `node --version`.

```bash
npm install
cp .env.example .env     # demo mode by default; no keys needed
npm run dev
```

Open **http://localhost:4000**

| Page | What it is |
|---|---|
| `/` | The product — hero, method, case screen, verdict, share card, design system |
| `/console.html` | Live case intake — submit an incident and watch it get judged |
| `/api/health` | Service status and current mode |

The **Submit a decision** button on the landing page takes you straight to the
console, so you can click through the whole product without touching a terminal.

---

## What's inside

```
varai/
├── public/          index.html (landing) + console.html (live intake)  ← served at /
├── src/             the API: routes, controllers, services, models
│   └── services/genlayer/    all GenLayer integration, isolated here
├── contracts/       football_court.py — the Intelligent Contract
├── design/          design system + generators for the landing page
│   ├── src/         page.py, app.css, app.js, tokens.css, mark.svg
│   ├── fonts/       Space Grotesk, DM Sans, IBM Plex Mono (embedded)
│   └── assets/      pitch.svg, planview.svg, verdict card
├── db/schema.sql    cases, evidence, verdicts, validator_results
├── tests/           16 tests
├── README.md        full technical documentation
├── DEPLOY.md        git commands + free hosting, step by step
└── BRAND-DIRECTION.md   visual identity rationale
```

---

## Commands

```bash
npm run dev          # dev server with hot reload
npm test             # 16 tests
npm run typecheck    # TypeScript, no emit
npm run build        # compile to dist/
npm start            # run the compiled build

npm run design       # rebuild the landing page into public/
npm run design:card  # re-export the 1080x1080 verdict card
npm run genkey       # generate a GenLayer keypair
npm run deploy:contract   # deploy the Intelligent Contract
```

Editing the landing page means editing `design/src/`, then `npm run design`.
Do not edit `public/index.html` directly — it is generated and will be overwritten.

---

## Demo mode vs real GenLayer

It ships in **DEMO MODE** so it runs with zero setup. Demo verdicts come from a
local keyword heuristic and are labelled everywhere they appear:

- amber board reading **DEMO VERDICT — NOT JUDGED BY GENLAYER**
- `source: "DEMO"` in the API response
- transaction shown as *no transaction (demo verdict)*

Lime styling and a real transaction hash are reserved for genuine GenLayer
verdicts. A demo result is never dressed up as a real one.

To go live: `npm run genkey`, fund the address, `npm run deploy:contract`, then
set `GENLAYER_CONTRACT_ADDRESS` and `VARAI_DEMO_MODE=false`. Details in
`README.md` section 8.

---

## Deploying

`DEPLOY.md` has every git command and a free hosting path — Render for the API,
Neon for Postgres, $0 and no credit card.

`NEON-SETUP.md` walks through the database setup on its own, in detail.

One production note: submit with `?async=true` and poll
`GET /api/cases/:id/status`. Judging can outlast a free host's request timeout.

---

## Notes

- No `.env` is included (it holds secrets) — copy `.env.example`.
- No `node_modules` — run `npm install`.
- No wallet connection, no tokens, no NFTs.
- Re-enable a strict CSP in `src/app.ts` before real production traffic.
