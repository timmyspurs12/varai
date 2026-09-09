import sys, asyncio
from playwright.async_api import async_playwright
async def main():
    sel, out, w, h, delay = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":w,"height":h}, device_scale_factor=2)
        await pg.goto("file:///home/user/varai/VARAI.html")
        await pg.wait_for_timeout(600)
        await pg.eval_on_selector(sel, "e=>e.scrollIntoView({block:'center'})")
        await pg.wait_for_timeout(delay)
        el = await pg.query_selector(sel)
        await el.screenshot(path=out)
        await b.close()
asyncio.run(main())
