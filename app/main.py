from contextlib import asynccontextmanager
import asyncio
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routes import router
from app.security import SecurityHeadersFastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    from app.jobs import cleanup_expired

    async def cleanup_loop():
        while True:
            await asyncio.to_thread(cleanup_expired)
            await asyncio.sleep(300)

    task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = SecurityHeadersFastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(router, prefix="/api")
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def public_origin():
    value = settings.public_site_url.strip()
    if not value:
        return None
    try:
        parsed = urlsplit(value)
        parsed.port
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment or any(char.isspace() for char in parsed.netloc):
        return None
    return f"{parsed.scheme}://{parsed.netloc}/"


def static_asset(name, media_type, max_age):
    return FileResponse(STATIC_DIR / name, media_type=media_type, headers={"Cache-Control": f"public, max-age={max_age}"})


@app.get("/", include_in_schema=False)
def index():
    origin = public_origin()
    if not origin:
        return FileResponse(STATIC_DIR / "index.html")
    metadata = f'<link rel="canonical" href="{escape(origin, quote=True)}">\n  <meta property="og:url" content="{escape(origin, quote=True)}">\n'
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8").replace("</head>", f"  {metadata}</head>", 1)
    return HTMLResponse(html)


@app.get("/favicon.ico", include_in_schema=False)
def favicon_ico():
    return static_asset("favicon.ico", "image/x-icon", 604800)


@app.get("/favicon.svg", include_in_schema=False)
def favicon_svg():
    return static_asset("favicon.svg", "image/svg+xml", 604800)


@app.get("/apple-touch-icon.png", include_in_schema=False)
def apple_touch_icon():
    return static_asset("apple-touch-icon.png", "image/png", 604800)


@app.get("/site.webmanifest", include_in_schema=False)
def site_manifest():
    return static_asset("site.webmanifest", "application/manifest+json", 3600)


@app.get("/robots.txt", include_in_schema=False)
def robots():
    content = (STATIC_DIR / "robots.txt").read_text(encoding="utf-8")
    origin = public_origin()
    if origin:
        content += f"\nSitemap: {origin}sitemap.xml\n"
    return PlainTextResponse(content, headers={"Cache-Control": "public, max-age=3600"})


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap():
    origin = public_origin()
    if not origin:
        return static_asset("sitemap.xml", "application/xml", 3600)
    content = (STATIC_DIR / "sitemap.xml").read_text(encoding="utf-8").replace("https://audio-toolkit.glitter.kr/", escape(origin), 1)
    return Response(content, media_type="application/xml", headers={"Cache-Control": "public, max-age=3600"})
