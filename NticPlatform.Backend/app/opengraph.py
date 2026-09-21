"""
Public OpenGraph / Twitter Card preview generator for social media crawlers.
Serves server-rendered meta tags for crawlers, and passes normal browsers to the SPA.
"""
import html
import os
import re
from fastapi import APIRouter, Request, status
from fastapi.responses import HTMLResponse, FileResponse
from app.database import get_db_connection, release_db_connection

router = APIRouter(tags=["Social Previews"])

# User-Agent patterns for known social crawlers & link preview bots
CRAWLER_UA_REGEX = re.compile(
    r"(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|TelegramBot|"
    r"Slackbot|Discordbot|Applebot|Googlebot|bingbot)",
    re.IGNORECASE
)

FALLBACK_IMAGE = "/assets/ntic_image_1.jpeg"
DEFAULT_TITLE = "NTIC National Championship Platform"
DEFAULT_DESCRIPTION = "Championship stories, robotics, coding, cyber, and innovation updates."

def _is_crawler(user_agent: str) -> bool:
    if not user_agent:
        return False
    return bool(CRAWLER_UA_REGEX.search(user_agent))

def _make_absolute_url(request: Request, path_or_url: str) -> str:
    if not path_or_url:
        return ""
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        return path_or_url
    proto = request.headers.get("x-forwarded-proto", request.url.scheme or "https")
    host = request.headers.get("x-forwarded-host", request.headers.get("host") or str(request.base_url).replace("http://", "").replace("https://", "").rstrip("/"))
    path = path_or_url if path_or_url.startswith("/") else f"/{path_or_url}"
    return f"{proto}://{host}{path}"

def _render_og_html(
    title: str,
    description: str,
    image_url: str,
    canonical_url: str,
    og_type: str = "article"
) -> HTMLResponse:
    safe_title = html.escape(title or DEFAULT_TITLE, quote=True)
    safe_desc = html.escape(description or DEFAULT_DESCRIPTION, quote=True)
    safe_image = html.escape(image_url, quote=True)
    safe_url = html.escape(canonical_url, quote=True)

    # Determine image MIME type from URL extension
    img_lower = (image_url or "").lower()
    img_mime = "image/png" if ".png" in img_lower else ("image/webp" if ".webp" in img_lower else "image/jpeg")

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{safe_title}</title>
    <!-- OpenGraph Standard -->
    <meta property="og:site_name" content="NTIC National Championship">
    <meta property="og:type" content="{og_type}">
    <meta property="og:title" content="{safe_title}">
    <meta property="og:description" content="{safe_desc}">
    <meta property="og:image" content="{safe_image}">
    <meta property="og:image:secure_url" content="{safe_image}">
    <meta property="og:image:type" content="{img_mime}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="{safe_url}">
    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{safe_title}">
    <meta name="twitter:description" content="{safe_desc}">
    <meta name="twitter:image" content="{safe_image}">
    <!-- Instant Fallback Redirect for Humans -->
    <script>window.location.replace("{safe_url}");</script>
</head>
<body>
    <p>Redirecting to <a href="{safe_url}">{safe_title}</a>...</p>
</body>
</html>"""
    return HTMLResponse(content=html_content, status_code=200)

def _serve_spa_or_redirect(request: Request, canonical_url: str):
    frontend_dist = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "NticPlatform.Frontend", "dist", "ntic-frontend", "browser")
    )
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    return HTMLResponse(content=f'<script>window.location.replace("{canonical_url}");</script>')

@router.get("/news/{item_id}", response_class=HTMLResponse)
def get_news_preview(item_id: str, request: Request):
    user_agent = request.headers.get("user-agent", "")
    canonical_url = _make_absolute_url(request, f"/news/{item_id}")

    if not _is_crawler(user_agent):
        return _serve_spa_or_redirect(request, canonical_url)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Search Championship Stories
            cur.execute("SELECT title, excerpt, image FROM stories WHERE id = %s", (item_id,))
            row = cur.fetchone()
            if row:
                title, desc, img = row[0], row[1], row[2]
                abs_img = _make_absolute_url(request, img or FALLBACK_IMAGE)
                return _render_og_html(title, desc or DEFAULT_DESCRIPTION, abs_img, canonical_url)

            # 2. Search News Feed Items
            cur.execute("SELECT headline, tag FROM news_items WHERE id = %s", (item_id,))
            news_row = cur.fetchone()
            if news_row:
                title = news_row[0]
                desc = f"Latest update on {news_row[1]} from NTIC." if news_row[1] else DEFAULT_DESCRIPTION
                abs_img = _make_absolute_url(request, FALLBACK_IMAGE)
                return _render_og_html(title, desc, abs_img, canonical_url)

        # Fallback if ID is not found
        return _render_og_html(DEFAULT_TITLE, DEFAULT_DESCRIPTION, _make_absolute_url(request, FALLBACK_IMAGE), canonical_url)
    finally:
        release_db_connection(conn)

@router.get("/events/{event_id}", response_class=HTMLResponse)
def get_event_preview(event_id: str, request: Request):
    user_agent = request.headers.get("user-agent", "")
    canonical_url = _make_absolute_url(request, f"/events/{event_id}")

    if not _is_crawler(user_agent):
        return _serve_spa_or_redirect(request, canonical_url)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT title, description, location, date FROM events WHERE id = %s", (event_id,))
            row = cur.fetchone()
            if row:
                title, desc, loc, dt = row[0], row[1], row[2], row[3]
                full_desc = f"{dt} at {loc}. {desc}" if (loc and dt) else (desc or DEFAULT_DESCRIPTION)
                abs_img = _make_absolute_url(request, FALLBACK_IMAGE)
                return _render_og_html(title, full_desc, abs_img, canonical_url)

        return _render_og_html(DEFAULT_TITLE, DEFAULT_DESCRIPTION, _make_absolute_url(request, FALLBACK_IMAGE), canonical_url)
    finally:
        release_db_connection(conn)
