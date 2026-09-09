# -*- coding: utf-8 -*-
"""VARAI — top-down incident plan view for the case screen."""
import math

W, H = 540, 690
PA_W, PA_D = 40.32, 16.5
GA_W, GA_D = 18.32, 5.5
GOAL_W = 7.32
S = 13.2                       # px per metre
OX, OY = W/2, 118               # goal-line centre on screen
def P(x, y):                   # x across (m, 0=centre), y depth from goal line
    return (OX + x*S, OY + y*S)

o=[]
o.append('<defs><radialGradient id="pvGlow" cx="50%" cy="50%" r="50%">'
         '<stop offset="0%" stop-color="#D6FF3F" stop-opacity=".16"/>'
         '<stop offset="100%" stop-color="#D6FF3F" stop-opacity="0"/></radialGradient></defs>')
o.append('<rect width="%d" height="%d" fill="#0E1214"/>' % (W,H))

# grid
g=['<g stroke="#6EE7C8" stroke-width=".6" opacity=".07">']
for m in range(-20,21,4):
    a,b=P(m,-1),P(m,43); g.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'%(a[0],a[1],b[0],b[1]))
for d in range(0,45,4):
    a,b=P(-20,d),P(20,d); g.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'%(a[0],a[1],b[0],b[1]))
g.append('</g>'); o.append("".join(g))

L='#E8ECE4'
def rect(x1,y1,x2,y2,w=1.4,op=.6):
    a,b=P(x1,y1),P(x2,y2)
    return ('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="%s" '
            'stroke-width="%s" opacity="%s"/>')%(a[0],a[1],b[0]-a[0],b[1]-a[1],L,w,op)
o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2.2" opacity=".8"/>'
         % (P(-20,0)[0],P(-20,0)[1],P(20,0)[0],P(20,0)[1],L))
o.append(rect(-PA_W/2,0,PA_W/2,PA_D,1.5,.62))
o.append(rect(-GA_W/2,0,GA_W/2,GA_D,1.2,.42))
o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="3" opacity=".9"/>'
         % (P(-GOAL_W/2,0)[0],P(-GOAL_W/2,0)[1],P(GOAL_W/2,0)[0],P(GOAL_W/2,0)[1],'#F1F3EE'))
# D arc
arc=[]
for k in range(0,241):
    t=-math.pi+k*(2*math.pi/240)
    ax,ay=9.15*math.sin(t),11.0-9.15*math.cos(t)
    if ay>=PA_D: arc.append(P(ax,ay))
o.append('<polyline points="%s" fill="none" stroke="%s" stroke-width="1.2" opacity=".42"/>'
         % (" ".join("%.1f,%.1f"%p for p in arc),L))
sp=P(0,11); o.append('<circle cx="%.1f" cy="%.1f" r="2" fill="%s" opacity=".7"/>'%(sp[0],sp[1],L))

# incident
CON=(4.6,9.4); ATT=(4.9,8.7); DEF=(3.4,10.4); REF=(-9.8,17.2)
c=P(*CON)
o.append('<circle cx="%.1f" cy="%.1f" r="118" fill="url(#pvGlow)"/>'%c)
# VAR line
a,b=P(-20,CON[1]),P(20,CON[1])
o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#6EE7C8" stroke-width="1.2" '
         'stroke-dasharray="8 6" opacity=".55"/>'%(a[0],a[1],b[0],b[1]))
o.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="9.5" letter-spacing="1.5" '
         'fill="#6EE7C8" opacity=".7">VAR LINE</text>'%(a[0]+4,a[1]-7))
# ball path
def bp(t):
    x=16.2+(CON[0]-2.2-16.2)*t; y=20.4+(7.9-20.4)*t; return P(x,y)
pts=[bp(k/40) for k in range(41)]
o.append('<polyline points="%s" fill="none" stroke="#D6FF3F" stroke-width="1.8" opacity=".85" '
         'stroke-linecap="round"/>'% " ".join("%.1f,%.1f"%p for p in pts))
bx,by=pts[-1]
o.append('<circle cx="%.1f" cy="%.1f" r="3.6" fill="#F1F3EE"/>'%(bx,by))
# ref sight
r=P(*REF)
o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#FFCC66" stroke-width="1" '
         'stroke-dasharray="2 5" opacity=".4"/>'%(r[0],r[1],c[0],c[1]))
o.append('<polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="#0E1214" stroke="#FFCC66" '
         'stroke-width="1.6"/>'%(r[0],r[1]-6,r[0]+6,r[1],r[0],r[1]+6,r[0]-6,r[1]))
o.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="9.5" letter-spacing="1.4" '
         'fill="#FFCC66" text-anchor="middle" opacity=".9">REF</text>'%(r[0],r[1]-13))
# players
for p in [(-8.2,6.4),(-12.6,13.2),(11.0,4.9),(-3.1,15.8),(15.4,11.4),(-0.4,1.6)]:
    q=P(*p); o.append('<circle cx="%.1f" cy="%.1f" r="4.4" fill="#4E585C"/>'%q)
d=P(*DEF)
o.append('<circle cx="%.1f" cy="%.1f" r="7" fill="#0E1214" stroke="#F1F3EE" stroke-width="1.8"/>'%d)
o.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="8" font-weight="600" '
         'fill="#F1F3EE" text-anchor="middle">04</text>'%(d[0],d[1]+2.9))
o.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="9.5" letter-spacing="1.4" '
         'fill="#F1F3EE" text-anchor="end" opacity=".8">DEF</text>'%(d[0]-11,d[1]-6))
at=P(*ATT)
o.append('<circle cx="%.1f" cy="%.1f" r="7.4" fill="#D6FF3F"/>'%at)
o.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="8" font-weight="600" '
         'fill="#0B0D0F" text-anchor="middle">09</text>'%(at[0],at[1]+2.9))
o.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="9.5" letter-spacing="1.4" '
         'fill="#D6FF3F" text-anchor="start" opacity=".95">ATT</text>'%(at[0]+12,at[1]-6))
# contact
o.append('<circle cx="%.1f" cy="%.1f" r="13" fill="none" stroke="#FF5C5C" stroke-width="1.2" opacity=".9"/>'%c)
o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#FF5C5C" stroke-width="1" opacity=".8"/>'%(c[0]-20,c[1],c[0]-6,c[1]))
o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#FF5C5C" stroke-width="1" opacity=".8"/>'%(c[0]+6,c[1],c[0]+20,c[1]))
o.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="9.5" letter-spacing="1.4" '
         'fill="#FF5C5C">CONTACT</text>'%(c[0]+16,c[1]+24))
o.append('<text x="%.1f" y="%.1f" font-family="IBM Plex Mono" font-size="9" letter-spacing="1" '
         'fill="#8D9699">X 24.7 / Y 09.4</text>'%(c[0]+16,c[1]+37))
o.append('<text x="18" y="%d" font-family="IBM Plex Mono" font-size="9.5" letter-spacing="1.6" '
         'fill="#8D9699" opacity=".75">PENALTY AREA</text>'%(P(0,PA_D)[1]-9))
o.append('<text x="18" y="26" font-family="IBM Plex Mono" font-size="9.5" letter-spacing="1.6" '
         'fill="#8D9699" opacity=".55">PLAN VIEW / TRACKING 25FPS</text>')

SVG=('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" preserveAspectRatio="xMidYMid meet" '
     'style="width:100%%;height:100%%;display:block">%s</svg>')%(W,H,"".join(o))
open("assets/planview.svg","w").write(SVG)
print("ok",len(SVG))
