# -*- coding: utf-8 -*-
"""Standalone 1080x1080 verdict card artboard + PNG export."""
import os
import asyncio, sys, re
sys.path.insert(0, "src")
FONTS = open("fonts/varai-fonts.css").read()
TOKENS = open("src/tokens.css").read()
APPCSS = open("src/app.css").read()
MARK = re.sub(r'<!--.*?-->', '', open("src/mark.svg").read(), flags=re.S)

def mark(size):
    return MARK.replace('<svg xmlns="http://www.w3.org/2000/svg"',
        '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" style="color:#F1F3EE;--mark-accent:#D6FF3F"' % (size,size))

CARD = """
<div class="sharecard" id="card">
  <div class="sc-grid"></div><div class="sc-glow"></div>
  <div class="sc-head">
    <span class="logo" style="gap:12px"><span class="logo-m">%s</span><span class="logo-t" style="font-size:26px">VARAI</span></span>
    <span class="tag tag-lime" style="font-size:13px">GENLAYER VERDICT</span>
  </div>
  <div class="sc-mid">
    <div class="sc-teams"><span class="sc-team">Arsenal</span><span class="sc-vs">VS</span><span class="sc-team">Chelsea</span></div>
    <div class="sc-time">74:21 — PENALTY CLAIM</div>
    <div class="sc-verdict">No penalty</div>
    <div class="sc-cons"><span class="n">78%%</span><span class="tag" style="font-size:13px">CONSENSUS</span></div>
  </div>
  <div class="sc-foot">
    <span class="tag" style="font-size:13px">SETTLED BY GENLAYER</span>
    <span class="tag" style="font-size:13px;color:var(--gray-dim)">CASE 004821</span>
  </div>
</div>""" % mark(32)

HTML = """<!DOCTYPE html><html><head><meta charset="utf-8">
<title>VARAI — Verdict Card 1080</title>
<style>%s</style><style>%s</style><style>%s</style>
<style>
  body{margin:0;background:#08090A;display:grid;place-items:center;min-height:100vh}
  .sharecard{width:1080px;height:1080px;border-radius:0;border:none}
  .sc-head{padding:44px 52px}
  .sc-foot{padding:34px 52px}
  .sc-teams{gap:38px}
  .sc-team{font-size:74px}
  .sc-vs{font-size:20px}
  .sc-time{font-size:26px;margin-top:28px}
  .sc-verdict{font-size:140px;margin-top:54px}
  .sc-cons{margin-top:38px;gap:16px;align-items:baseline}
  .sc-cons .n{font-size:50px;line-height:1}
  .sc-grid{background-size:72px 72px}
  .sc-glow{width:940px;height:620px}
</style></head><body>%s</body></html>""" % (FONTS, TOKENS, APPCSS, CARD)

open("assets/verdict-card-1080.html", "w").write(HTML)

async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":1080,"height":1080}, device_scale_factor=1)
        await pg.goto("file://" + os.path.abspath("assets/verdict-card-1080.html"))
        await pg.wait_for_timeout(1200)
        el = await pg.query_selector("#card")
        await el.screenshot(path="assets/varai-verdict-card.png")
        await b.close()
asyncio.run(main())
print("ok")
