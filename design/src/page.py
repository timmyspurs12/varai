# -*- coding: utf-8 -*-
"""VARAI — page composition. Returns the full HTML body."""

VALIDATORS = [
    ("VAL-01", "no",  "82"), ("VAL-02", "no",  "76"), ("VAL-03", "yes", "61"),
    ("VAL-04", "no",  "88"), ("VAL-05", "no",  "79"), ("VAL-06", "yes", "58"),
    ("VAL-07", "no",  "84"), ("VAL-08", "no",  "71"), ("VAL-09", "no",  "80"),
]

EVIDENCE = [
    ("01", "Broadcast feed — main camera",     "PARSED"),
    ("02", "Tactical cam — 18-yard reverse",   "PARSED"),
    ("03", "Optical tracking — 25 fps skeleton","PARSED"),
    ("04", "Contact frame — 74:21.08",          "PARSED"),
    ("05", "Laws of the Game — Law 12.1",       "CITED"),
]

CASES = [
    ("004821","ARSENAL vs CHELSEA","74:21","PENALTY CLAIM","no","NO PENALTY","78"),
    ("004820","INTER vs JUVENTUS","31:04","OFFSIDE / TOE","yes","GOAL STANDS","91"),
    ("004819","REAL MADRID vs BETIS","88:52","HANDBALL","rev","UNDER REVIEW",""),
]


def nav(logo, active="product"):
    items = [("Product","product"),("Cases","cases"),("Validators","validators"),("Docs","docs")]
    links = "".join(
        '<a href="#%s"%s>%s</a>' % (k, ' class="on"' if k==active else "", t)
        for t,k in items)
    return f"""
<header class="nav">
  <div class="nav-in">
    {logo}
    <nav class="nav-links">{links}</nav>
    <div class="nav-right">
      <span class="chip"><span class="dot live"></span><span class="tag">14 LIVE CASES</span></span>
      <a class="btn" href="/console.html" style="padding:9px 15px;font-size:12px">Submit a decision</a>
    </div>
  </div>
</header>"""


def hero(pitch_svg):
    rail = ""
    for cid, fx, tm, kind, cls, verdict, pct in CASES:
        pctc = (f'<span class="mono" style="font-size:11px;color:var(--lime)">{pct}%</span>'
                if pct else '<span class="tag tag-amber">JUDGING</span>')
        rail += f"""
      <article class="railcard">
        <div class="top"><span class="tag">CASE {cid}</span><span class="mono" style="font-size:10.5px;color:var(--gray)">{tm}</span></div>
        <div class="fix">{fx}</div>
        <div class="bot"><span class="verdictpill {cls}">{verdict}</span>{pctc}</div>
      </article>"""

    return f"""
<section class="hero">
  <div class="hero-media">{pitch_svg}</div>
  <div class="hero-scrim"></div>
  <div class="hero-in">
    <div class="hero-grid">
      <div>
        <div class="eyebrow"><span class="tag tag-lime">THE INTERNET'S REFEREE</span></div>
        <h1 class="display">Can't agree<br>with the referee?<br><span class="muted">Let</span> GenLayer<br><span class="lime">decide.</span></h1>
        <p class="lede" style="margin-top:24px;max-width:46ch">Submit a controversial match decision. VARAI reconstructs the incident from broadcast
        evidence and puts it to a panel of independent AI validators — who deliberate, converge, and return a
        verdict with a confidence score.</p>
        <div class="hero-sub">
          <a class="btn btn-primary" href="/console.html">Submit a decision <span class="k">↵</span></a>
          <a class="btn" href="#case">Watch a case resolve</a>
        </div>
      </div>
      <div class="rail">
        <div class="spread" style="margin-bottom:2px">
          <span class="tag">LIVE ANALYSIS</span><span class="tag" style="color:var(--gray-dim)">MATCHDAY 06</span>
        </div>
        {rail}
      </div>
    </div>
    <div class="statstrip">
      <div class="stat"><div class="v">12,408</div><div class="k tag">CASES SETTLED</div></div>
      <div class="stat"><div class="v">9<span class="u">/case</span></div><div class="k tag">AI VALIDATORS</div></div>
      <div class="stat"><div class="v">41<span class="u">s</span></div><div class="k tag">MEDIAN TIME TO VERDICT</div></div>
      <div class="stat"><div class="v">86.4<span class="u">%</span></div><div class="k tag">MEAN CONSENSUS</div></div>
    </div>
  </div>
</section>"""


def steps():
    data = [
        ("01","Submit","Drop a clip, a fixture and a timestamp. Anyone can open a case — no account theatre, no gatekeeping."),
        ("02","Reconstruct","VARAI pulls the broadcast angles, runs optical tracking and rebuilds the incident as spatial evidence."),
        ("03","Deliberate","Nine independent validators reason over the same evidence pack and the Laws of the Game — separately."),
        ("04","Settle","Opinions converge into a consensus figure. The verdict is written to GenLayer and permanently citable."),
    ]
    cards = "".join(f"""
    <article class="step" data-step="{i}">
      <span class="bar"></span>
      <div class="n">{n} / 04</div>
      <h3>{t}</h3><p>{d}</p>
    </article>""" for i,(n,t,d) in enumerate(data))
    return f"""
<section class="sec" id="product"><div class="wrap">
  <div class="sec-head">
    <div><div class="eyebrow"><span class="tag tag-lime">METHOD</span></div>
    <h2 class="h2" style="margin-top:18px">From argument<br>to adjudication.</h2></div>
    <p class="lede" style="max-width:42ch">Every case follows the same four movements. The process is identical whether it's a
    Sunday league handball or a title-deciding penalty.</p>
  </div>
  <div class="steps">{cards}</div>
</div></section>"""


def case_screen(plan_svg):
    ev = "".join(f"""
      <div class="ev" data-ev="{i}">
        <span class="id">EV {n}</span><span class="lb">{t}</span><span class="st">{s}</span>
      </div>""" for i,(n,t,s) in enumerate(EVIDENCE))

    vals = "".join(f"""
      <div class="val" data-val="{i}">
        <span class="ix">{i+1:02d}</span><span class="nm">{n}</span>
        <span class="op {o}">{'NO PEN' if o=='no' else 'PENALTY'}</span>
        <span class="cf">{c}%</span>
      </div>""" for i,(n,o,c) in enumerate(VALIDATORS))

    blocks = lambda n, cls="": "".join(f'<i data-b="{i}"></i>' for i in range(12))

    return f"""
<section class="sec" id="case"><div class="wrap">
  <div class="sec-head">
    <div><div class="eyebrow"><span class="tag tag-lime">CASE FILE</span></div>
    <h2 class="h2" style="margin-top:18px">Case 004821</h2>
    <p class="lede" style="margin-top:14px">Arsenal vs Chelsea — 74:21. Penalty claim, contact inside the area.</p></div>
    <div style="display:flex;gap:10px;align-items:center">
      <button class="btn" id="replay">Replay analysis</button>
      <button class="btn btn-primary" id="run">Run judgment <span class="k">⏎</span></button>
    </div>
  </div>

  <div class="case">
    <!-- LEFT — incident -->
    <div class="pane">
      <div class="pane-head">
        <div class="row" style="gap:9px"><span class="dot live"></span><span class="tag">INCIDENT RECONSTRUCTION</span></div>
        <span class="tag" style="color:var(--gray-dim)">CAM 04 / TACTICAL</span>
      </div>
      <div class="pane-body" style="display:flex;flex-direction:column">
        <div class="viz">{plan_svg}</div>
        <div class="timescrub">
          <span class="mono" style="font-size:11px;color:var(--lime)">74:21.08</span>
          <div class="scrub"><div class="ticks">{"".join("<i></i>" for _ in range(24))}</div>
            <span class="keyf" style="left:38%"></span><span class="keyf" style="left:52%"></span>
            <span class="play" id="play"></span></div>
          <span class="mono" style="font-size:11px;color:var(--gray)">+00:04.2</span>
        </div>
      </div>
      <div class="pane-foot">
        <span class="tag">TRACKING 25FPS / 12 POINTS</span><span class="tag tag-mint">GEOMETRY VERIFIED</span>
      </div>
    </div>

    <!-- CENTRE — match -->
    <div class="pane">
      <div class="pane-head"><span class="tag">MATCH INFORMATION</span><span class="tag" style="color:var(--gray-dim)">PL / MD06</span></div>
      <div class="pane-body">
        <div class="scoreline">
          <div class="team"><div class="crest" style="color:#FF5C5C;border-color:rgba(255,92,92,.3)">A</div><div class="nm">ARSENAL</div><span class="tag" style="color:var(--gray-dim)">HOME</span></div>
          <div class="scorebox">1–1</div>
          <div class="team"><div class="crest" style="color:#6EE7C8;border-color:rgba(110,231,200,.3)">C</div><div class="nm">CHELSEA</div><span class="tag" style="color:var(--gray-dim)">AWAY</span></div>
        </div>
        <div class="kv"><span class="k">Match timestamp</span><span class="v lime">74:21.08</span></div>
        <div class="kv"><span class="k">Incident</span><span class="v">PLAYER CONTACT</span></div>
        <div class="kv"><span class="k">Zone</span><span class="v">PENALTY AREA</span></div>
        <div class="kv"><span class="k">Coordinates</span><span class="v">X 24.7 / Y 09.4</span></div>
        <div class="kv"><span class="k">Claim by</span><span class="v">#09 ATTACKER</span></div>
        <div class="kv"><span class="k">Referee call</span><span class="v">PLAY ON</span></div>
        <div class="kv"><span class="k">Law cited</span><span class="v">12.1 / CARELESS</span></div>
        <div style="margin-top:22px"><span class="tag">EVIDENCE PACK</span></div>
        <div class="evlist">{ev}</div>
      </div>
      <div class="pane-foot"><span class="tag">SUBMITTED 09 SEP / 21:04 WAT</span><span class="tag">EVIDENCE 05</span></div>
    </div>

    <!-- RIGHT — judgment -->
    <div class="pane">
      <div class="pane-head">
        <div class="row" style="gap:9px">{'<span class="dot work" id="jdot"></span>'}<span class="tag tag-lime">GENLAYER JUDGMENT</span></div>
        <span class="tag mono" id="elapsed" style="color:var(--gray-dim)">00:00</span>
      </div>
      <div class="judge">
        <div class="judge-status"><span class="t" id="jstate">UNDER REVIEW</span></div>
        <div class="phase"><div class="lbl"><span class="n">Evidence</span><span class="p" id="p0">0%</span></div>
          <div class="blocks" id="b0">{blocks(12)}</div></div>
        <div class="phase"><div class="lbl"><span class="n">Analysis</span><span class="p" id="p1">0%</span></div>
          <div class="blocks" id="b1">{blocks(12)}</div></div>
        <div class="phase"><div class="lbl"><span class="n">Consensus</span><span class="p" id="p2">0%</span></div>
          <div class="blocks" id="b2">{blocks(12)}</div></div>
        <div style="padding:13px 16px 0"><span class="tag">VALIDATOR OPINIONS</span></div>
        <div class="vals">{vals}</div>
      </div>
      <div class="pane-foot"><span class="tag">TX 0x8f2a…c41d</span><span class="tag tag-mint">GENLAYER MAINNET</span></div>
    </div>
  </div>
</div></section>"""


def verdict():
    C = 78
    circ = 2 * 3.14159 * 58
    return f"""
<section class="sec" id="verdict" style="background:linear-gradient(180deg,#0B0D0F,#0E1114)"><div class="wrap">
  <div class="sec-head">
    <div><div class="eyebrow"><span class="tag tag-lime">DECISION</span></div>
    <h2 class="h2" style="margin-top:18px">The system has<br>reached a conclusion.</h2></div>
    <p class="lede" style="max-width:40ch">No fanfare. The panel converges, the percentage locks, and the decision is entered
    into the record where anyone can audit it.</p>
  </div>

  <div class="verdict" id="vcard">
    <div class="reg tl"></div><div class="reg br"></div>
    <div class="verdict-head">
      <div class="row" style="gap:9px"><span class="dot ok"></span><span class="tag tag-lime">GENLAYER VERDICT</span></div>
      <span class="tag">CASE 004821 / FINAL</span>
    </div>
    <div class="verdict-body">
      <div class="lead"><span class="tag">ARSENAL VS CHELSEA — 74:21 — PENALTY CLAIM</span></div>
      <div class="vword" id="vword">No penalty</div>
      <div class="vmeta">
        <div class="cell">
          <div class="ring">
            <svg width="132" height="132">
              <circle cx="66" cy="66" r="58" fill="none" stroke="#1D2429" stroke-width="6"/>
              <circle id="vring" cx="66" cy="66" r="58" fill="none" stroke="#D6FF3F" stroke-width="6"
                      stroke-linecap="round" stroke-dasharray="{circ:.1f}" stroke-dashoffset="{circ:.1f}"
                      style="transition:stroke-dashoffset 900ms cubic-bezier(.16,.9,.24,1)"/>
            </svg>
            <div class="pct"><span id="vpct">0</span>%</div>
          </div>
          <div class="cap tag">CONSENSUS</div>
        </div>
        <div class="cell"><div class="big n">7<span style="color:var(--gray-dim)">/</span>9</div><div class="cap tag">VALIDATORS AGREE</div></div>
        <div class="cell"><div class="big n">0.41<span style="font-size:15px;color:var(--gray)">s</span></div><div class="cap tag">DELIBERATION</div></div>
        <div class="cell"><div class="big n">12.1</div><div class="cap tag">LAW APPLIED</div></div>
      </div>
    </div>
    <div class="vfoot"><span class="tag">SETTLED BY GENLAYER</span><span class="tag" style="color:var(--gray-dim)">TX 0x8f2a4b19d7e0c41d</span></div>
  </div>
</div></section>"""


def share(logo_light):
    return f"""
<section class="sec" id="share"><div class="wrap">
  <div class="sec-head">
    <div><div class="eyebrow"><span class="tag tag-lime">DISTRIBUTION</span></div>
    <h2 class="h2" style="margin-top:18px">Built to be<br>posted.</h2></div>
    <p class="lede" style="max-width:42ch">Every settled case renders a square card. It has to survive a timeline at thumbnail
    size and still read as an official decision.</p>
  </div>
  <div class="sharewrap">
    <div class="sharecard">
      <div class="sc-grid"></div><div class="sc-glow"></div>
      <div class="sc-head">{logo_light}<span class="tag tag-lime">GENLAYER VERDICT</span></div>
      <div class="sc-mid">
        <div class="sc-teams"><span class="sc-team">Arsenal</span><span class="sc-vs">VS</span><span class="sc-team">Chelsea</span></div>
        <div class="sc-time">74:21 — PENALTY CLAIM</div>
        <div class="sc-verdict">No penalty</div>
        <div class="sc-cons"><span class="n">78%</span><span class="tag">CONSENSUS</span></div>
      </div>
      <div class="sc-foot"><span class="tag">SETTLED BY GENLAYER</span><span class="tag" style="color:var(--gray-dim)">CASE 004821</span></div>
    </div>
    <div style="flex:1;min-width:280px;display:flex;flex-direction:column;gap:14px">
      <div class="panel"><div class="panel-head"><span class="tag">FORMAT NOTES</span></div>
        <div class="panel-body" style="display:flex;flex-direction:column;gap:14px">
          <div><div class="tag tag-lime">1080 × 1080</div><p style="margin:7px 0 0;color:var(--gray);font-size:13.5px">Square master for X, Instagram and WhatsApp. A 1200×675 crop keeps the verdict line and consensus figure.</p></div>
          <hr class="rule">
          <div><div class="tag tag-lime">HIERARCHY</div><p style="margin:7px 0 0;color:var(--gray);font-size:13.5px">Verdict word is always the largest element. Consensus is the only lime figure. Fixture sits above, provenance below.</p></div>
          <hr class="rule">
          <div><div class="tag tag-lime">RULE</div><p style="margin:7px 0 0;color:var(--gray);font-size:13.5px">Never crop out “Settled by GenLayer”. Provenance is the product.</p></div>
        </div>
      </div>
    </div>
  </div>
</div></section>"""


def system():
    swatches = [("Obsidian","#0B0D0F","Base canvas"),("Deep Carbon","#111519","Panels"),
                ("Steel","#171C20","Raised rows"),("Soft White","#F1F3EE","Primary text"),
                ("Muted Steel","#8D9699","Metadata"),("VARAI Lime","#D6FF3F","Decision accent"),
                ("Mint","#6EE7C8","In-progress"),("Amber","#FFCC66","Referee / caution"),
                ("Decision Red","#FF5C5C","Contact / negative")]
    sw = "".join(f"""
      <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--carbon)">
        <div style="height:64px;background:{h};border-bottom:1px solid var(--line)"></div>
        <div style="padding:11px 12px">
          <div style="font-family:var(--f-display);font-size:12.5px;font-weight:600">{n}</div>
          <div class="tag" style="margin-top:5px">{h}</div>
          <div style="color:var(--gray-dim);font-size:11.5px;margin-top:5px">{u}</div>
        </div>
      </div>""" for n,h,u in swatches)

    return f"""
<section class="sec" id="validators"><div class="wrap">
  <div class="sec-head">
    <div><div class="eyebrow"><span class="tag tag-lime">DESIGN SYSTEM</span></div>
    <h2 class="h2" style="margin-top:18px">The kit.</h2></div>
    <p class="lede" style="max-width:42ch">Lime behaves like a referee's fluorescent marker: it appears only on the active
    decision, the confirmed fact, or the final number. Everything else stays in graphite.</p>
  </div>

  <div class="swatches">{sw}</div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px">
    <div class="panel"><div class="reg tl"></div><div class="panel-head"><span class="tag">TYPE — SPACE GROTESK</span><span class="tag" style="color:var(--gray-dim)">DISPLAY</span></div>
      <div class="panel-body">
        <div style="font-family:var(--f-display);font-size:40px;font-weight:700;letter-spacing:-.035em;line-height:.95;text-transform:uppercase">Let GenLayer<br>decide.</div>
        <p style="color:var(--gray);font-size:13px;margin:16px 0 0">Headlines, navigation, verdict words. Set tight — -3.5% tracking, 0.9 leading, uppercase at display sizes.</p>
      </div></div>
    <div class="panel"><div class="panel-head"><span class="tag">TYPE — DM SANS</span><span class="tag" style="color:var(--gray-dim)">INTERFACE</span></div>
      <div class="panel-body">
        <p style="margin:0;font-size:15px;line-height:1.6">Readable interface copy sits in DM Sans at 13–16px. It carries explanation, never emphasis — the system speaks plainly and lets the data carry the drama.</p>
        <p style="color:var(--gray);font-size:13px;margin:16px 0 0">Body, descriptions, help text.</p>
      </div></div>
    <div class="panel"><div class="reg br"></div><div class="panel-head"><span class="tag">TYPE — IBM PLEX MONO</span><span class="tag" style="color:var(--gray-dim)">TECHNICAL</span></div>
      <div class="panel-body">
        <div class="mono" style="font-size:13px;line-height:2;color:var(--gray)">
          <div>CASE 004821 <span style="color:var(--lime)">LIVE ANALYSIS</span></div>
          <div>74:21.08 / X 24.7 / Y 09.4</div>
          <div>VAL-04 CONFIDENCE <span style="color:var(--white)">88%</span></div>
          <div>TX 0x8f2a4b19d7e0c41d</div>
        </div>
        <p style="color:var(--gray);font-size:13px;margin:16px 0 0">Times, coordinates, validator IDs, confidence, hashes. Tabular figures, .14em tracking.</p>
      </div></div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:12px">
    <div class="panel"><div class="reg tl"></div><div class="panel-head"><span class="tag">BRAND MARK</span><span class="tag" style="color:var(--gray-dim)">MONOGRAM</span></div>
      <div class="panel-body" style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;gap:22px;flex-wrap:wrap">
          <div style="width:88px;height:88px;border:1px solid var(--line);border-radius:12px;display:grid;place-items:center;background:var(--obsidian)">__MARK_LG__</div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;gap:16px">__MARK_MD__ __MARK_SM__ __MARK_XS__</div>
            <span class="tag" style="color:var(--gray-dim)">48 / 28 / 18 PX — HOLDS AT FAVICON SIZE</span>
          </div>
        </div>
        <hr class="rule">
        <p style="margin:0;color:var(--gray);font-size:13.5px">A converging V crossed by the review plane. It reads as the letter, an offside line, and a narrowing of opinion toward one point — never a football.</p>
      </div></div>
    <div class="panel"><div class="panel-head"><span class="tag">SHAPE LANGUAGE</span></div>
      <div class="panel-body">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div style="width:74px;height:56px;border:1px solid var(--line);border-radius:10px;display:grid;place-items:center" class="tag">10PX</div>
          <div style="width:74px;height:56px;border:1px solid var(--line);border-radius:12px;display:grid;place-items:center" class="tag">12PX</div>
          <div style="width:74px;height:56px;border:1px solid var(--line);border-radius:14px;display:grid;place-items:center" class="tag">14PX</div>
        </div>
        <p style="margin:14px 0 0;color:var(--gray);font-size:13.5px">1px borders, 10–14px radii, registration corners. Panels read as rack-mounted equipment, not soft SaaS cards.</p>
      </div></div>
    <div class="panel"><div class="panel-head"><span class="tag">MOTION</span></div>
      <div class="panel-body">
        <div class="mono" style="font-size:12px;line-height:2;color:var(--gray)">
          <div>EVIDENCE ENTER <span style="color:var(--white)">150ms</span> stagger 70</div>
          <div>VALIDATOR IN <span style="color:var(--white)">240ms</span> stagger 110</div>
          <div>CONSENSUS FILL <span style="color:var(--white)">400ms</span> ease-out</div>
          <div>VERDICT LOCK <span style="color:var(--lime)">400ms</span> .16/.9/.24/1</div>
        </div>
        <p style="margin:14px 0 0;color:var(--gray);font-size:13.5px">Motion communicates analysis, never spectacle. Nothing bounces, nothing explodes.</p>
      </div></div>
  </div>
</div></section>"""


def footer(logo):
    cols = [("PRODUCT",["Submit a decision","Live cases","Validator panel","Consensus API"]),
            ("RESOURCES",["Documentation","Laws of the Game","Methodology","Changelog"]),
            ("COMPANY",["About","Press kit","Careers","Contact"])]
    c = "".join(f"<div><h5>{h}</h5>{''.join(f'<a href=\"#docs\">{i}</a>' for i in items)}</div>" for h,items in cols)
    return f"""
<footer class="foot" id="docs"><div class="wrap">
  <div class="foot-grid">
    <div>{logo}
      <p style="color:var(--gray);font-size:13.5px;max-width:30ch;margin:16px 0 0">The internet's referee. Controversial football decisions, independently judged and permanently settled.</p>
    </div>{c}
  </div>
  <div class="foot-bar">
    <span class="tag">© 2026 VARAI — SETTLED BY GENLAYER</span>
    <span class="tag" style="color:var(--gray-dim)">STATUS: ALL SYSTEMS OPERATIONAL</span>
  </div>
</div></footer>"""
