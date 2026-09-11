# VARAI — Visual Identity & Interface Direction

**The Internet's Referee.** Controversial football decisions, submitted to GenLayer and independently judged by AI validators.

---

## 1. The core idea, made literal

The identity lives in the gap between *"what really happened?"* and *"let's ask the judges."*

Every design decision serves one of those two halves:

| The question | The answer |
|---|---|
| Contact point, ball trajectory, coordinates, timestamps | Verdict word, consensus %, validator tally, transaction hash |
| Red + mint — unresolved, under measurement | Lime — resolved, confirmed, locked |
| Perspective camera, dense metadata, motion | Flat board, huge type, stillness |

The case screen is the question. The verdict board is the answer. They are deliberately styled as opposites so the transition between them *feels* like a conclusion being reached.

---

## 2. Why it doesn't read as crypto

This was a hard constraint, so it was designed against explicitly:

- **No neon-on-black gradients, no glassmorphism, no purple/cyan duotone.** The palette is graphite with a single fluorescent marker.
- **GenLayer appears as infrastructure, not as a token.** It shows up in provenance lines — `SETTLED BY GENLAYER`, `TX 0x8f2a…c41d`, `GENLAYER MAINNET` — sitting in the footer of a panel the way a broadcast system credits its timing provider. Never in the hero as a logo salad.
- **The numbers are football numbers.** 74:21, X 24.7 / Y 09.4, Law 12.1, 7/9 validators. The technical texture comes from sport, not from finance.
- **Restraint as a status signal.** Funded sports-tech looks calm. Hackathon projects look loud.

---

## 3. Colour

| Token | Hex | Role |
|---|---|---|
| Obsidian | `#0B0D0F` | Base canvas |
| Deep Carbon | `#111519` | Panels |
| Steel | `#171C20` | Raised rows |
| Soft White | `#F1F3EE` | Primary text |
| Muted Steel | `#8D9699` | Metadata |
| **VARAI Lime** | `#D6FF3F` | **Decision accent** |
| Mint | `#6EE7C8` | In-progress / verified geometry |
| Amber | `#FFCC66` | Referee position, caution |
| Decision Red | `#FF5C5C` | Contact point, live, negative verdict |

**The lime rule.** Lime is a referee's fluorescent marker — it only touches things that are *decided or actionable*: the active decision, a confirmed fact, a winning verdict, an interactive control, an important number. It is never a background, never a gradient, never decorative. On the whole landing page it appears on roughly 2% of pixels, which is exactly why the verdict lands.

The three-state logic is worth noting: **mint = still measuring, lime = concluded, red = disputed/negative.** So the consensus bars physically change colour from mint to lime at the moment the panel converges. The colour system carries the narrative.

---

## 4. Typography

- **Space Grotesk** — headlines, nav, verdict words. Set tight: −3.3% tracking, 0.92 leading, uppercase at display sizes. The hero is capped at ~76px rather than filling the viewport, so the pitch visualisation stays a co-star instead of wallpaper.
- **DM Sans** — interface copy, 13–16px. Carries explanation, never emphasis.
- **IBM Plex Mono** — match times, coordinates, validator IDs, confidence values, transaction hashes, all micro-labels. Tabular figures, .14em tracking, 10px. This is the single biggest contributor to the broadcast-instrument character.

All three are embedded as base64 woff2 inside the HTML, so the file renders identically offline and in sandboxed preview panes.

---

## 5. Shape language

10–14px radii, 1px borders, tight spacing, strong grids. Panels are built as **rack-mounted equipment**: a header strip with a status label, a dense body, and a footer strip carrying provenance. Registration corner marks (`.reg`) appear on key panels as a physical-instrument cue.

The case screen is a deliberately asymmetric 1.15 / 0.78 / 0.92 three-column grid with 1px gutters that read as seams between hardware modules — not three equal SaaS cards.

---

## 6. Hero visual

A geometrically real penalty area, drawn by a Python perspective projector (`pitch.py`), not traced by hand. Camera at 21m back / 25m elevated, 1260mm equivalent — a plausible tactical-camera position. Real FIFA dimensions: 40.32m penalty area, 7.32m goal, 9.15m D-arc correctly clipped at the box line.

Players are minimal markers with grounding ellipses that scale with depth. The ball arcs in on a parabola with a dashed ground shadow. The VAR analysis line is an offside-style vertical plane with fins. Overlays stay small and mono: `PENALTY AREA`, `CONTACT POINT`, `X 24.7 / Y 09.4 / T 74:21.08`.

It resembles an analysis system because it is one — the geometry is computed, so it holds up under scrutiny rather than falling apart like a video-game render.

---

## 7. Verdict moment

The most important five seconds in the product. The sequence:

1. Consensus ring sweeps to 78% (900ms, ease-lock)
2. Percentage counts up and **locks** on the true value
3. Verdict word resolves from blurred + offset to sharp (400ms)
4. The card's border turns lime and a low glow settles beneath it

No explosion, no confetti. The feeling is *the system has reached a conclusion.* Lime appears only on the ring, the percentage, and the border — the word "NO PENALTY" itself stays soft white, because the decision is the fact and the lime is the frame around it.

---

## 8. Motion language

| Event | Duration | Detail |
|---|---|---|
| Evidence enters | 150ms | 70ms stagger, sequential |
| Validators appear | 240ms | 110ms stagger, one by one |
| Consensus fills | 400ms | mint → lime on completion |
| Verdict locks | 400ms | cubic-bezier(.16,.9,.24,1) |

All animation communicates analysis. Everything respects `prefers-reduced-motion`.

---

## 9. Brand mark

A converging **V** crossed by the review plane. Six directions were auditioned; this one won because it reads three ways at once — the letter, an offside line, and opinion narrowing toward a single point. The second, fainter line implies consensus tightening.

No football. No whistle. No card. It holds down to 16px.

---

## Files

| File | What it is |
|---|---|
| `VARAI.html` | The complete product — hero, method, case screen, verdict, share card, design system. Fully self-contained, offline-capable. |
| `assets/varai-verdict-card.png` | 1080×1080 social card, export-ready |
| `assets/verdict-card-1080.html` | Card artboard for re-export with new case data |
| `src/tokens.css` | Design tokens |
| `src/app.css` | Component layer |
| `src/app.js` | Motion choreography |
| `src/mark.svg` | Brand mark |
| `pitch.py` / `planview.py` | Parametric pitch renderers — change camera, incident position, or player markers and rebuild |
| `build.py` | Assembles `VARAI.html` |

Rebuild with `python3 build.py`.

## Resolved: hero hierarchy

The headline now runs `clamp(40px, 6.6vw, 96px)` at `line-height:.88`, wrapped to
`14ch`. The hero scrim was rebalanced at the same time: heavy behind the type on
the left, clearing to fully transparent by 86% across.

Both halves of that change matter. Scaling the type up while leaving the old scrim
in place erased the pitch reconstruction almost entirely — the art was being
buried by accident rather than receding by design. Lifting the right-hand scrim
lets the trajectory, contact crosshair and DEFENDER/ATTACKER labels read as
evidence behind the claim, which is the whole argument of the page. Verified at
1440px and 390px: no headline overflow, no horizontal page scroll.

## Resolved: club identity — letter tiles, permanently

**Real club crests will not be used.** This is a legal decision, not an aesthetic
one, and it should not be revisited without counsel.

Club crests are registered trademarks and the artwork is separately
copyrighted. The recurring professional advice is consistent: using team *names*
for factual identification is defensible nominative fair use, but logos are
"more than is needed" to identify a club and materially raise the risk. Clubs
run brand-protection desks for exactly this (Liverpool publishes
`brand.protection@liverpoolfc.com`), Premier League collective branding is
licensed centrally rather than club-by-club, and licences are priced for
merchandise businesses, not demos.

VARAI's exposure is worse than a scores app. A product that *publicly
adjudicates a club's matches* and renders verdicts about them invites an
implied-endorsement or disparagement claim on top of straight infringement — the
suggestion that a club sanctioned a ruling against itself.

So the letter tile is now the intended design, not a placeholder: club initial,
club colour, no protected artwork, with corner ticks that read as an
identification marker rather than a badge. It ships anywhere with zero licensing
exposure — and it suits the forensic register of the product better than a
wall of borrowed logos would.

Club **names** in plain text are retained: factual identification, lowest-risk
approach, and necessary for the product to function.
