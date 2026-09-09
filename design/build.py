# -*- coding: utf-8 -*-
"""VARAI — assembles the self-contained deliverables."""
import os, re

FONTS  = open("fonts/varai-fonts.css").read()
TOKENS = open("src/tokens.css").read()
MARK   = open("src/mark.svg").read()
PITCH  = open("assets/pitch.svg").read()
PLAN   = open("assets/planview.svg").read()

def mark(size, cls="", accent="#D6FF3F", color="#F1F3EE"):
    s = MARK.replace('<svg xmlns="http://www.w3.org/2000/svg"',
        '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" class="%s" style="color:%s;--mark-accent:%s"'
        % (size, size, cls, color, accent))
    return re.sub(r'<!--.*?-->', '', s, flags=re.S)

def logo(size=20, gap=9, fs=17, accent="#D6FF3F", color="#F1F3EE"):
    return ('<span class="logo" style="gap:%dpx"><span class="logo-m">%s</span>'
            '<span class="logo-t" style="font-size:%dpx;color:%s">VARAI</span></span>'
            % (gap, mark(size, accent=accent, color=color), fs, color))

os.makedirs("assets", exist_ok=True)

APP_CSS = open("src/app.css").read()
APP_JS  = open("src/app.js").read()
import sys; sys.path.insert(0, "src")
import page as PG

logo_nav   = logo(20, 9, 17)
logo_share = logo(24, 10, 20)
logo_foot  = logo(22, 10, 18)

_sys = PG.system()
for ph, sz in (("__MARK_LG__", 52), ("__MARK_MD__", 34), ("__MARK_SM__", 24), ("__MARK_XS__", 16)):
    _sys = _sys.replace(ph, mark(sz))
PG.system = lambda _s=_sys: _s

body = "".join([
    PG.nav(logo_nav),
    PG.hero(PITCH),
    PG.steps(),
    PG.case_screen(PLAN),
    PG.verdict(),
    PG.share(logo_share),
    PG.system(),
    PG.footer(logo_foot),
])

HTML = """<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VARAI — The Internet's Referee</title>
<meta name="description" content="Controversial football decisions, submitted to GenLayer and independently judged by AI validators.">
<style>%s</style>
<style>%s</style>
<style>%s</style>
</head>
<body>
<div class="grain"></div>
%s
<script>%s</script>
</body></html>""" % (FONTS, TOKENS, APP_CSS, body, APP_JS)

# The marketing page is the app's front door: it is written straight into
# ../public, which the Express server serves at "/".
OUT = os.path.join("..", "public", "index.html")
open(OUT, "w").write(HTML)
print("public/index.html", round(len(HTML)/1024), "KB")
