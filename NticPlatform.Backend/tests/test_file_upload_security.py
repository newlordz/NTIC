"""Regression tests for the file-upload and response-header hardening.

/api/files/upload is deliberately unauthenticated so that the public registration
form can attach documents, which makes it the widest-open write path in the
application. These tests pin the controls that keep it safe:

  * only allowlisted media types are accepted, so HTML/SVG cannot be stored and
    then served back from this origin as script;
  * the bytes must match the declared type, so an allowlisted content type cannot
    be used as a wrapper;
  * an existing id cannot be replaced without an administrator, because ids are
    predictable and the insert is an upsert;
  * the stored filename cannot inject response headers.

Each of these was a live defect before these tests existed, so they assert the
fix rather than the intent.
"""
import base64

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64).decode()
JPEG = base64.b64encode(b"\xff\xd8\xff" + b"\x00" * 64).decode()


def _upload(client, **over):
    body = {
        "file_id": over.pop("file_id", "vt-file-1"),
        "name": over.pop("name", "ok.png"),
        "mime_type": over.pop("mime_type", "image/png"),
        "data_base64": over.pop("data_base64", PNG),
        "size": over.pop("size", 128),
    }
    body.update(over)
    return client.post("/api/files/upload", json=body)


class TestUploadHardening:
    def test_disallowed_mime_is_rejected(self, client):
        r = _upload(client, file_id="vt-html", mime_type="text/html",
                    data_base64=base64.b64encode(b"<script>alert(1)</script>").decode())
        assert r.status_code == 415, r.text

    def test_svg_is_rejected(self, client):
        r = _upload(client, file_id="vt-svg", mime_type="image/svg+xml",
                    data_base64=base64.b64encode(b"<svg onload=alert(1)>").decode())
        assert r.status_code == 415, r.text

    def test_magic_bytes_must_match_declared_type(self, client):
        # Claims PNG, actually carries JPEG bytes.
        r = _upload(client, file_id="vt-mismatch", mime_type="image/png", data_base64=JPEG)
        assert r.status_code == 415, r.text
        assert "do not match" in r.json()["detail"].lower()

    def test_matching_magic_bytes_are_accepted(self, client):
        r = _upload(client, file_id="vt-good-png", mime_type="image/png", data_base64=PNG)
        assert r.status_code == 200, r.text

    def test_oversize_upload_is_rejected(self, client):
        r = _upload(client, file_id="vt-big", size=11 * 1024 * 1024)
        assert r.status_code == 413, r.text

    def test_anonymous_overwrite_is_refused(self, client):
        assert _upload(client, file_id="vt-owned", data_base64=PNG).status_code == 200
        again = _upload(client, file_id="vt-owned", name="replaced.png", data_base64=PNG)
        assert again.status_code == 409, again.text

    def test_non_admin_cannot_overwrite(self, client, student_token):
        assert _upload(client, file_id="vt-student", data_base64=PNG).status_code == 200
        r = client.post(
            "/api/files/upload",
            json={"file_id": "vt-student", "name": "x.png", "mime_type": "image/png",
                  "data_base64": PNG, "size": 128},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 409, r.text

    def test_admin_may_overwrite(self, client, admin_token):
        assert _upload(client, file_id="vt-admin", data_base64=PNG).status_code == 200
        r = client.post(
            "/api/files/upload",
            json={"file_id": "vt-admin", "name": "y.png", "mime_type": "image/png",
                  "data_base64": PNG, "size": 128},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text


class TestServeHardening:
    def test_filename_cannot_inject_headers(self, client):
        evil = 'a".png\r\nX-Injected: yes'
        assert _upload(client, file_id="vt-evil-name", name=evil, data_base64=PNG).status_code == 200
        r = client.get("/api/files/vt-evil-name")
        assert r.status_code == 200
        assert "X-Injected" not in r.headers
        cd = r.headers["content-disposition"]
        assert "\r" not in cd and "\n" not in cd
        # The raw quote must not survive into the quoted form.
        assert cd.count('"') == 2, cd

    def test_uploaded_bytes_are_served_sandboxed(self, client):
        assert _upload(client, file_id="vt-sandbox", data_base64=PNG).status_code == 200
        r = client.get("/api/files/vt-sandbox")
        assert r.headers["x-content-type-options"] == "nosniff"
        assert "sandbox" in r.headers["content-security-policy"]

    def test_text_file_is_served_as_attachment(self, client):
        r = _upload(client, file_id="vt-text", mime_type="text/plain",
                    name="notes.txt", data_base64=base64.b64encode(b"hello").decode())
        assert r.status_code == 200, r.text
        got = client.get("/api/files/vt-text")
        assert got.headers["content-disposition"].startswith("attachment")


class TestSecurityHeaders:
    def test_application_responses_carry_a_csp(self, client):
        r = client.get("/api/health")
        csp = r.headers.get("content-security-policy", "")
        assert "default-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp
        assert "object-src 'none'" in csp

    def test_hardening_headers_present(self, client):
        r = client.get("/api/health")
        assert r.headers["x-frame-options"] == "DENY"
        assert r.headers["cross-origin-opener-policy"] == "same-origin"
        assert "camera=()" in r.headers["permissions-policy"]
