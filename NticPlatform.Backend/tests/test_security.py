import pytest
from app.security import hash_password, verify_password, create_token, ADMIN_ROLES


class TestPasswordHashing:
    def test_hash_produces_different_hashes(self):
        h1 = hash_password("password123")
        h2 = hash_password("password123")
        assert h1 != h2

    def test_verify_correct_password(self):
        stored = hash_password("mysecret")
        assert verify_password("mysecret", stored) is True

    def test_verify_wrong_password(self):
        stored = hash_password("mysecret")
        assert verify_password("wrong", stored) is False

    def test_verify_corrupt_hash(self):
        assert verify_password("anything", "malformed") is False

    def test_hash_contains_salt_delimiter(self):
        result = hash_password("test")
        assert "$" in result
        assert len(result.split("$")) == 2


class TestToken:
    def test_create_token_returns_hex_string(self):
        token = create_token()
        assert len(token) == 64
        assert all(c in '0123456789abcdef' for c in token)

    def test_tokens_are_unique(self):
        t1 = create_token()
        t2 = create_token()
        assert t1 != t2


class TestAdminRoles:
    def test_super_admin_is_admin(self):
        assert "super_admin" in ADMIN_ROLES

    def test_admin_is_admin(self):
        assert "admin" in ADMIN_ROLES

    def test_instructor_is_not_admin(self):
        assert "instructor" not in ADMIN_ROLES

    def test_student_is_not_admin(self):
        assert "student" not in ADMIN_ROLES


class TestTrustedProxyPeer:
    """extract_client_ip only honours X-Forwarded-For from a trusted proxy.

    Railway's edge proxy sits in the 100.64.0.0/10 carrier-grade NAT range,
    which Python's `is_private` reports as False. If we trusted only
    `is_private`, we would stop trusting X-Forwarded-For on Railway and collapse
    every user into a single rate-limit bucket.
    """

    def _peer(self, host):
        from app.main import _is_trusted_proxy_peer
        return _is_trusted_proxy_peer(host)

    def test_railway_cgnat_range_is_trusted(self):
        assert self._peer("100.64.0.18") is True

    def test_loopback_and_private_are_trusted(self):
        assert self._peer("127.0.0.1") is True
        assert self._peer("10.0.0.5") is True
        assert self._peer("172.31.1.1") is True

    def test_public_ip_is_not_trusted(self):
        assert self._peer("8.8.8.8") is False
        assert self._peer("1.2.3.4") is False

    def test_garbage_host_is_not_trusted(self):
        assert self._peer("not-an-ip") is False
        assert self._peer("") is False
