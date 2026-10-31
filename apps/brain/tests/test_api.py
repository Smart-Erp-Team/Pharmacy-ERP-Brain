from fastapi.testclient import TestClient

from brain.api.main import app

client = TestClient(app)


def test_liveness_is_available_without_database() -> None:
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_does_not_claim_ready_without_database(monkeypatch) -> None:
    from brain.api import main

    monkeypatch.setattr(main.settings, "brain_db_url", None)
    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "reason": "database_not_configured",
    }


def test_system_info_contains_no_secrets() -> None:
    response = client.get("/api/v1/system/info")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Pharmacy ERP Brain"
    assert "brain_db_url" not in body


def test_readiness_hides_database_connection_errors(monkeypatch) -> None:
    from pydantic import SecretStr

    from brain.api import main

    class BrokenEngine:
        def connect(self):
            raise RuntimeError("sensitive connection detail")

    monkeypatch.setattr(main.settings, "brain_db_url", SecretStr("postgresql://not-real"))
    monkeypatch.setattr(main, "_database_engine", lambda _url: BrokenEngine())
    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "reason": "database_unavailable",
    }
    assert "sensitive" not in response.text
