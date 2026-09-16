import pytest
from app.database import get_db_connection, release_db_connection


class TestOpenGraphPreview:
    """Tests for OpenGraph / Twitter Card preview endpoints for crawlers and human visitors."""

    def test_crawler_gets_opengraph_html_for_news_story(self, client):
        # Insert a sample story to test preview
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO stories (id, title, excerpt, image, tag) VALUES (%s, %s, %s, %s, %s) "
                    "ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, excerpt = EXCLUDED.excerpt, image = EXCLUDED.image",
                    ("test-story-og", "Robotics Champions Ghana 2026", "Students engineered autonomous rovers.", "/assets/rover.jpg", "robotics")
                )
            conn.commit()
        finally:
            release_db_connection(conn)

        # 1. Test crawler User-Agent (WhatsApp)
        resp = client.get("/news/test-story-og", headers={"User-Agent": "WhatsApp/2.21.12.21 i"})
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")
        html_body = resp.text

        # Verify OpenGraph and Twitter tags
        assert '<meta property="og:title" content="Robotics Champions Ghana 2026">' in html_body
        assert '<meta property="og:description" content="Students engineered autonomous rovers.">' in html_body
        assert '<meta property="og:image" content="' in html_body
        assert '/assets/rover.jpg' in html_body
        assert '<meta name="twitter:card" content="summary_large_image">' in html_body
        assert '<meta name="twitter:title" content="Robotics Champions Ghana 2026">' in html_body

        # Clean up test row
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM stories WHERE id = %s", ("test-story-og",))
            conn.commit()
        finally:
            release_db_connection(conn)

    def test_crawler_gets_opengraph_html_for_event(self, client):
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO events (id, title, description, location, date) VALUES (%s, %s, %s, %s, %s) "
                    "ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description",
                    ("test-event-og", "Grand Final AI Hackathon", "The ultimate AI showdown.", "Accra Tech Center", "Oct 15, 2026")
                )
            conn.commit()
        finally:
            release_db_connection(conn)

        # Test crawler User-Agent (Twitterbot)
        resp = client.get("/events/test-event-og", headers={"User-Agent": "Twitterbot/1.0"})
        assert resp.status_code == 200
        html_body = resp.text
        assert '<meta property="og:title" content="Grand Final AI Hackathon">' in html_body
        assert 'The ultimate AI showdown.' in html_body
        assert '<meta name="twitter:card" content="summary_large_image">' in html_body

        # Clean up
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM events WHERE id = %s", ("test-event-og",))
            conn.commit()
        finally:
            release_db_connection(conn)

    def test_human_browser_passes_through(self, client):
        # Human browser (Chrome / Mozilla)
        resp = client.get("/news/any-id", headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        assert resp.status_code == 200
        # If SPA dist exists, it serves index.html; otherwise fallback redirect HTML
        assert resp.text is not None

    def test_crawler_nonexistent_id_returns_default_meta(self, client):
        resp = client.get("/news/non-existent-story-12345", headers={"User-Agent": "facebookexternalhit/1.1"})
        assert resp.status_code == 200
        assert "NTIC National Championship Platform" in resp.text
