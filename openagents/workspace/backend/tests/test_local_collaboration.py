from urllib.parse import urlsplit

import pytest

from app.config import config
from app.services.local_accounts import provision_local_account


@pytest.fixture
def local_accounts(db, monkeypatch):
    monkeypatch.setattr(config, "WORKSPACE_LOCAL_AUTH_ENABLED", True)
    monkeypatch.setattr(config, "WORKSPACE_SESSION_SECRET", "local-test-signing-key-" * 3)
    monkeypatch.setattr(config, "FRONTEND_BASE_URL", "https://collab.example.test/")
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    for name in ("alice", "bob", "chris"):
        provision_local_account(db, f"{name}@example.test", f"password-for-{name}", name.title())
    db.commit()


def _sign_in(client, name):
    response = client.post("/v1/auth/local-session", json={
        "email": f"{name.upper()}@example.test",
        "password": f"password-for-{name}",
    })
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    session = response.json()["data"]
    assert session["email"] == f"{name}@example.test"
    assert session["display_name"] == name.title()
    return {"Authorization": f"Bearer {session['session_token']}"}


def test_local_members_sign_in_accept_an_invite_and_exchange_messages(client, local_accounts):
    alice = _sign_in(client, "alice")
    bob = _sign_in(client, "bob")
    chris = _sign_in(client, "chris")

    workspace = client.post("/v1/workspaces", json={"name": "Two-person workspace"}, headers=alice)
    assert workspace.status_code == 200, workspace.text
    workspace_id = workspace.json()["data"]["workspaceId"]
    invite_endpoint = f"/v1/workspaces/{workspace_id}/invites"
    invite_details = {"email": "bob@example.test", "role": "member"}
    assert client.post(invite_endpoint, json=invite_details, headers=bob).status_code == 403
    invite = client.post(invite_endpoint, json=invite_details, headers=alice)
    assert invite.status_code == 200, invite.text
    invite_url = urlsplit(invite.json()["data"]["url"])
    assert (invite_url.scheme, invite_url.netloc) == ("https", "collab.example.test")
    assert invite_url.path.startswith("/invite/")
    invite_path = "/v1/invites/" + invite_url.path.removeprefix("/invite/")

    assert client.get(invite_path).json()["data"]["status"] == "pending"
    assert client.post(f"{invite_path}/accept").status_code == 401
    assert client.post(f"{invite_path}/accept", headers=chris).status_code == 403
    assert client.get(f"/v1/workspaces/{workspace_id}", headers=bob).status_code == 401
    joined = client.post(f"{invite_path}/accept", headers=bob)
    assert joined.status_code == 200, joined.text
    assert joined.json()["data"]["workspaceId"] == workspace_id
    assert joined.json()["data"]["role"] == "member"
    assert client.get(invite_path).json()["data"]["status"] == "accepted"
    assert client.post(invite_endpoint, json=invite_details, headers=bob).status_code == 403
    assert client.get(f"/v1/workspaces/{workspace_id}", headers=chris).status_code == 401

    response = client.get("/v1/account/workspaces", headers=bob)
    assert response.status_code == 200, response.text
    membership = next(ws for ws in response.json()["data"] if ws["workspaceId"] == workspace_id)
    assert membership["role"] == "member"
    assert membership["token"] is None

    alice_address, bob_address = "human:alice@example.test", "human:bob@example.test"
    for bearer, sender, recipient, message in (
        (alice, alice_address, bob_address, "Can you review this?"),
        (bob, bob_address, alice_address, "I will review it."),
    ):
        sent = client.post("/v1/events", json={
            "type": "workspace.message.posted",
            "source": "human:unverified",
            "target": recipient,
            "network": workspace_id,
            "visibility": "direct",
            "payload": {"content": message, "message_type": "chat"},
            "metadata": {"target_agents": ["__no_response__"]},
        }, headers=bearer)
        assert sent.status_code == 200, sent.text
        assert sent.json()["data"]["source"] == sender

    for bearer in (alice, bob):
        history = client.get("/v1/events", params={
            "network": workspace_id,
            "conversation": f"{alice_address},{bob_address}",
        }, headers=bearer)
        assert history.status_code == 200, history.text
        assert [event["source"] for event in history.json()["data"]["events"]] == [alice_address, bob_address]


def test_local_login_rejects_invalid_credentials_and_redacts_invalid_requests(client, local_accounts, caplog):
    for email in ("alice@example.test", "nobody@example.test"):
        rejected = client.post("/v1/auth/local-session", json={"email": email, "password": "incorrect"})
        assert rejected.status_code == 401
        assert rejected.json()["message"] == "Incorrect email or password"
    password = "must-not-be-echoed" * 20
    invalid = client.post("/v1/auth/local-session", json={"email": "alice@example.test", "password": password})
    assert invalid.status_code == 422
    assert password[:40] not in invalid.text + caplog.text
    assert client.post("/v1/workspaces", json={"name": "Anonymous workspace"}).status_code == 401


def test_local_login_is_opt_in_and_requires_a_signing_key(client, monkeypatch):
    body = {"email": "alice@example.test", "password": "password-for-alice"}
    assert client.post("/v1/auth/local-session", json=body).status_code == 404
    monkeypatch.setattr(config, "WORKSPACE_LOCAL_AUTH_ENABLED", True)
    monkeypatch.setattr(config, "WORKSPACE_SESSION_SECRET", "too-short")
    assert client.post("/v1/auth/local-session", json=body).status_code == 503
