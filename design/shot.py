import sys, asyncio
from playwright.async_api import async_playwright
async def main():
    path, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    full = len(sys.argv) > 5 and sys.argv[5] == "full"
    delay = int(sys.argv[6]) if len(sys.argv) > 6 else 1400
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
        await pg.goto("file://" + path)
        await pg.wait_for_timeout(delay)
        await pg.screenshot(path=out, full_page=full)
        await b.close()
asyncio.run(main())
