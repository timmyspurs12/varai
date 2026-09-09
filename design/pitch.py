# -*- coding: utf-8 -*-
"""VARAI — tactical camera pitch renderer. Emits a precise perspective SVG."""
import math

PA_W, PA_D = 40.32, 16.5      # penalty area
GA_W, GA_D = 18.32, 5.5       # goal area
GOAL_W, GOAL_H = 7.32, 2.44
SPOT_Y = 11.0
CX = PA_W / 2.0

VW, VH = 1600.0, 900.0
CAM  = (CX, -21.0, 25.0)
LOOK = (CX, 11.5, 0.0)
F    = 1260.0
SX, SY = VW / 2.0, VH * 0.455
_A = math.atan2(CAM[2] - LOOK[2], LOOK[1] - CAM[1])

def P(X, Y, Z=0.0):
    px, py, pz = X - CAM[0], Y - CAM[1], Z - CAM[2]
    ca, sa = math.cos(_A), math.sin(_A)
    yc = py * sa + pz * ca
    zc = py * ca - pz * sa
    zc = max(zc, 0.05)
    return (SX + F * px / zc, SY - F * yc / zc)

def fm(pts, prec=1):
    return " ".join("%.*f,%.*f" % (prec, x, prec, y) for x, y in pts)

def poly(pts, **kw):
    a = " ".join('%s="%s"' % (k.replace("_", "-"), v) for k, v in kw.items())
    return '<polyline points="%s" %s/>' % (fm(pts), a)

def seg(p1, p2, **kw):
    return poly([P(*p1), P(*p2)], **kw)

# ─── layers ───────────────────────────────────────────────────────────────────
W0, W1 = CX - 31.0, CX + 31.0
YF = 42.0
out = []

# 0. turf gradient + vignette handled in defs
out.append('<defs>')
out.append('''<linearGradient id="turf" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#0B0D0F"/><stop offset="42%" stop-color="#12181A"/>
  <stop offset="72%" stop-color="#141B1E"/><stop offset="100%" stop-color="#0B0D0F"/></linearGradient>''')
out.append('''<radialGradient id="spotG" cx="50%" cy="62%" r="58%">
  <stop offset="0%" stop-color="#1B2529" stop-opacity=".95"/>
  <stop offset="55%" stop-color="#12181B" stop-opacity=".45"/>
  <stop offset="100%" stop-color="#0B0D0F" stop-opacity="0"/></radialGradient>''')
out.append('''<radialGradient id="incGlow" cx="50%" cy="50%" r="50%">
  <stop offset="0%" stop-color="#D6FF3F" stop-opacity=".14"/>
  <stop offset="45%" stop-color="#D6FF3F" stop-opacity=".045"/>
  <stop offset="100%" stop-color="#D6FF3F" stop-opacity="0"/></radialGradient>''')
out.append('''<linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#0B0D0F"/><stop offset="100%" stop-color="#0B0D0F" stop-opacity="0"/></linearGradient>''')
out.append('''<linearGradient id="fadeSide" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0%" stop-color="#0B0D0F"/><stop offset="100%" stop-color="#0B0D0F" stop-opacity="0"/></linearGradient>''')
out.append('</defs>')

out.append('<rect width="%g" height="%g" fill="url(#turf)"/>' % (VW, VH))
out.append('<rect width="%g" height="%g" fill="url(#spotG)"/>' % (VW, VH))

# 1. mow stripes (alternating bands of depth)
g = ['<g id="stripes">']
y = 0.0
i = 0
while y < YF:
    y2 = min(y + 5.0, YF)
    if i % 2 == 0:
        pts = [P(W0, y), P(W1, y), P(W1, y2), P(W0, y2)]
        g.append('<polygon points="%s" fill="#FFFFFF" opacity=".013"/>' % fm(pts))
    y += 5.0; i += 1
g.append('</g>')
out.append("\n".join(g))

# 2. technical grid — 5m lattice, very quiet
g = ['<g id="grid" stroke="#6EE7C8" stroke-width=".7" fill="none" opacity=".07">']
for yy in [v * 5.0 for v in range(0, 10)]:
    g.append(poly([P(W0, yy), P(W1, yy)]))
for xx in [CX + v * 5.0 for v in range(-6, 7)]:
    g.append(poly([P(xx, 0), P(xx, YF)]))
g.append('</g>')
out.append("\n".join(g))

# 3. pitch markings
L = '#E8ECE4'
g = ['<g id="markings" fill="none" stroke="%s" stroke-linecap="square">' % L]
g.append(seg((W0, 0), (W1, 0), stroke_width="2.6", opacity=".85"))            # goal line
g.append(seg((0, 0), (0, PA_D), stroke_width="2", opacity=".72"))
g.append(seg((PA_W, 0), (PA_W, PA_D), stroke_width="2", opacity=".72"))
g.append(seg((0, PA_D), (PA_W, PA_D), stroke_width="2", opacity=".72"))
g.append(seg((CX - GA_W / 2, 0), (CX - GA_W / 2, GA_D), stroke_width="1.6", opacity=".55"))
g.append(seg((CX + GA_W / 2, 0), (CX + GA_W / 2, GA_D), stroke_width="1.6", opacity=".55"))
g.append(seg((CX - GA_W / 2, GA_D), (CX + GA_W / 2, GA_D), stroke_width="1.6", opacity=".55"))
# D-arc: only the portion beyond the penalty-area line
arc = []
for k in range(0, 241):
    t = -math.pi + k * (2 * math.pi / 240)
    ax, ay = CX + 9.15 * math.sin(t), SPOT_Y - 9.15 * math.cos(t)
    if ay >= PA_D:
        arc.append(P(ax, ay))
g.append(poly(arc, stroke_width="1.6", opacity=".55"))
# halfway hint at far edge
g.append(seg((W0, YF - 1), (W1, YF - 1), stroke_width="1.4", opacity=".18"))
g.append('</g>')
out.append("\n".join(g))

# 4. goal frame + net
g = ['<g id="goal">']
gl, gr = CX - GOAL_W / 2, CX + GOAL_W / 2
net = ['<g stroke="#8D9699" stroke-width=".6" opacity=".22" fill="none">']
for k in range(1, 12):
    xx = gl + (GOAL_W) * k / 12.0
    net.append(poly([P(xx, 0, 0), P(xx, 0, GOAL_H)]))
for k in range(1, 5):
    zz = GOAL_H * k / 5.0
    net.append(poly([P(gl, 0, zz), P(gr, 0, zz)]))
net.append('</g>')
g.append("\n".join(net))
g.append('<g stroke="#F1F3EE" stroke-width="3" fill="none" stroke-linecap="square" opacity=".9">')
g.append(poly([P(gl, 0, 0), P(gl, 0, GOAL_H), P(gr, 0, GOAL_H), P(gr, 0, 0)]))
g.append('</g>')
g.append('</g>')
out.append("\n".join(g))

# 5. penalty spot
sp = P(CX, SPOT_Y)
out.append('<circle cx="%.1f" cy="%.1f" r="2.6" fill="%s" opacity=".8"/>' % (sp[0], sp[1], L))

# ─── INCIDENT ────────────────────────────────────────────────────────────────
CONTACT = (CX + 4.6, 9.4)
ATT     = (CX + 4.9, 8.7)
DEF     = (CX + 3.4, 10.4)
REF     = (CX - 9.8, 17.2)
KEEPER  = (CX - 0.4, 1.6)
OTHERS  = [(CX - 8.2, 6.4), (CX - 12.6, 13.2), (CX + 11.0, 4.9),
           (CX - 3.1, 15.8), (CX + 15.4, 11.4), (CX - 16.8, 20.4),
           (CX + 8.4, 24.6), (CX - 6.0, 27.2)]

cpt = P(*CONTACT)
out.append('<ellipse cx="%.1f" cy="%.1f" rx="300" ry="172" fill="url(#incGlow)"/>' % cpt)

# VAR analysis line — offside-style plane across the pitch through contact point
g = ['<g id="varline">']
a0, a1 = P(W0 + 3, CONTACT[1]), P(W1 - 3, CONTACT[1])
g.append('<polyline points="%s" stroke="#6EE7C8" stroke-width="1.4" opacity=".5" stroke-dasharray="9 7" fill="none"/>' % fm([a0, a1]))
# vertical plane fins
for xx in [CX - 24, CX - 12, CX, CX + 12, CX + 24]:
    p1, p2 = P(xx, CONTACT[1], 0), P(xx, CONTACT[1], 2.3)
    g.append('<polyline points="%s" stroke="#6EE7C8" stroke-width="1" opacity=".28" fill="none"/>' % fm([p1, p2]))
top = [P(xx, CONTACT[1], 2.3) for xx in [W0 + 3 + t * (W1 - W0 - 6) / 24.0 for t in range(25)]]
g.append('<polyline points="%s" stroke="#6EE7C8" stroke-width=".9" opacity=".2" stroke-dasharray="4 6" fill="none"/>' % fm(top))
g.append('</g>')
out.append("\n".join(g))

# referee sight line
r0, r1 = P(*REF), P(*CONTACT)
out.append('<polyline points="%s" stroke="#FFCC66" stroke-width="1" opacity=".34" stroke-dasharray="2 6" fill="none"/>' % fm([r0, r1]))

# ball trajectory — parabola from deep right into the area
def traj(t):
    x = (CX + 16.2) + (CONTACT[0] - 2.2 - (CX + 16.2)) * t
    y = 20.4 + (7.9 - 20.4) * t
    z = 3.4 * math.sin(math.pi * t) * 0.62 + 0.22
    return P(x, y, z)
tp = [traj(k / 60.0) for k in range(61)]
out.append('<polyline points="%s" stroke="#D6FF3F" stroke-width="2" opacity=".85" fill="none" stroke-linecap="round" stroke-dasharray="1400" stroke-dashoffset="0" id="ballpath"/>' % fm(tp))
# ground shadow of trajectory
sp2 = [P((CX + 16.2) + (CONTACT[0] - 2.2 - (CX + 16.2)) * (k / 60.0), 20.4 + (7.9 - 20.4) * (k / 60.0), 0) for k in range(61)]
out.append('<polyline points="%s" stroke="#D6FF3F" stroke-width="1" opacity=".16" fill="none" stroke-dasharray="3 5"/>' % fm(sp2))
bx, by = tp[-1]
out.append('<circle cx="%.1f" cy="%.1f" r="4.4" fill="#F1F3EE"/>' % (bx, by))
out.append('<circle cx="%.1f" cy="%.1f" r="9" fill="none" stroke="#D6FF3F" stroke-width="1.2" opacity=".55"/>' % (bx, by))

# player markers
def marker(pos, color, kind="dot", r=7.0, label=None, num=None, glow=False, ldx=0.0, ldy=0.0, anchor="middle"):
    x, y = P(*pos)
    s = []
    sc = 1.0 + (pos[1] - 12.0) * -0.012
    rr = r * max(0.72, min(1.22, sc))
    # ground ellipse
    s.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="none" stroke="%s" stroke-width="1.1" opacity=".45"/>'
             % (x, y + rr * 0.72, rr * 1.5, rr * 0.5, color))
    if glow:
        s.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" opacity=".055"/>' % (x, y, rr * 3.0, color))
    if kind == "ring":
        s.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#0B0D0F" stroke="%s" stroke-width="2" />' % (x, y, rr, color))
    elif kind == "diamond":
        d = rr * 1.15
        s.append('<polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="#0B0D0F" stroke="%s" stroke-width="1.8"/>'
                 % (x, y - d, x + d, y, x, y + d, x - d, y, color))
    else:
        s.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (x, y, rr, color))
    if num:
        s.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="9" font-weight="600" fill="#0B0D0F" text-anchor="middle">%s</text>'
                 % (x, y + 3.2, num))
    if label:
        s.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="10.5" letter-spacing="1.4" fill="%s" text-anchor="%s" opacity=".95">%s</text>'
                 % (x + ldx, y - rr - 12 + ldy, color, anchor, label))
    return "\n".join(s)

g = ['<g id="players">']
for o in OTHERS:
    g.append(marker(o, "#5C666A", "dot", 6.0))
g.append(marker(KEEPER, "#8D9699", "ring", 7.0))
g.append(marker(REF, "#FFCC66", "diamond", 6.4, label="REFEREE", ldy=-2))
g.append(marker(DEF, "#F1F3EE", "ring", 8.0, num="04", label="DEFENDER", ldx=-30, ldy=-8, anchor="end"))
g.append(marker(ATT, "#D6FF3F", "dot", 8.4, num="09", label="ATTACKER", glow=True, ldx=34, ldy=-4, anchor="start"))
g.append('</g>')
out.append("\n".join(g))

# contact point crosshair
cx_, cy_ = cpt
out.append('''<g id="contact">
<circle cx="%.1f" cy="%.1f" r="17" fill="none" stroke="#FF5C5C" stroke-width="1.3" opacity=".85"/>
<circle cx="%.1f" cy="%.1f" r="27" fill="none" stroke="#FF5C5C" stroke-width=".9" opacity=".3"/>
<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#FF5C5C" stroke-width="1.1" opacity=".8"/>
<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#FF5C5C" stroke-width="1.1" opacity=".8"/>
</g>''' % (cx_, cy_, cx_, cy_, cx_ - 25, cy_, cx_ - 8, cy_, cx_ + 8, cy_, cx_ + 25, cy_))

# leader line + label for contact point
lx, ly = cx_ + 196, cy_ + 54
out.append('''<g id="contactlabel" font-family="IBM Plex Mono" font-size="11" letter-spacing="1.6">
<polyline points="%.1f,%.1f %.1f,%.1f %.1f,%.1f" stroke="#FF5C5C" stroke-width="1" fill="none" opacity=".5"/>
<circle cx="%.1f" cy="%.1f" r="2" fill="#FF5C5C"/>
<text x="%.1f" y="%.1f" fill="#FF5C5C">CONTACT POINT</text>
<text x="%.1f" y="%.1f" fill="#8D9699" font-size="10">X 24.7  Y 09.4  T 74:21.08</text>
</g>''' % (cx_ + 19, cy_ + 9, lx - 46, ly + 8, lx + 4, ly + 8, lx - 46, ly + 8, lx + 14, ly + 4, lx + 14, ly + 20))

# zone label
zp = P(CX - 18.6, PA_D - 2.2)
out.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="11" letter-spacing="2" fill="#8D9699" opacity=".8">PENALTY AREA</text>' % zp)
zp2 = P(CX + 22.0, 26.0)
zp2 = P(W0 + 7.5, CONTACT[1])
out.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="11" letter-spacing="2" fill="#6EE7C8" opacity=".65">VAR ANALYSIS LINE</text>' % (zp2[0], zp2[1] - 14))

# edge fades
out.append('<rect width="%g" height="150" fill="url(#fadeTop)"/>' % VW)
out.append('<rect width="220" height="%g" fill="url(#fadeSide)"/>' % VH)
out.append('<rect width="220" height="%g" fill="url(#fadeSide)" transform="translate(%g,0) scale(-1,1)"/>' % (VH, VW))

SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g" '
       'preserveAspectRatio="xMidYMid slice" class="pitch-svg">\n%s\n</svg>') % (VW, VH, "\n".join(out))

if __name__ == "__main__":
    open("assets/pitch.svg", "w").write(SVG)
    css = open("fonts/varai-fonts.css").read()
    open("assets/pitch_preview.html", "w").write(
        '<html><head><style>%s</style></head><body style="margin:0;background:#0B0D0F">%s</body></html>' % (css, SVG))
    print("wrote assets/pitch.svg", len(SVG))
