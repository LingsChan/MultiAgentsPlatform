"""Exercise two people and four polling agents over separate TCP clients."""
from contextlib import ExitStack
import secrets
import socket
import threading
import time

import httpx
import pytest
import uvicorn

from app.config import config
from app.firebase_auth import mint_workspace_session
from app.main import app
from app.models import Channel, ChannelMember, User, WorkspaceMember, WorkspaceMembership
from app.services.access_model import create_grant
from tests.test_visibility import no_push  # noqa: F401 - isolate external delivery hooks


@pytest.fixture
def server_url():
    # Use the real ASGI routes and sockets with the suite's isolated database.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(app, lifespan="off", log_level="warning"))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 10
            while not server.started and thread.is_alive() and time.monotonic() < deadline:
                time.sleep(0.01)
            assert server.started
            yield f"http://127.0.0.1:{port}"
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            assert not thread.is_alive()


@pytest.mark.parametrize("completion_routing", [False, True])
def test_cross_team_group_conversation(server_url, workspace, db, monkeypatch, no_push, completion_routing):
    monkeypatch.setattr(config, "WORKSPACE_SESSION_SECRET", secrets.token_urlsafe(32))
    monkeypatch.setattr(config, "ROUTER_LLM_ENABLED", False)
    monkeypatch.setattr(config, "COMPLETION_ROUTING_ENABLED", completion_routing)
    network = workspace["id"]
    team = {"alice@example.test": ["writer", "analyst"], "bob@example.test": ["editor", "reader"]}
    channel = Channel(workspace_id=network, name="joint-review", response_mode="passive")
    db.add(channel)
    db.flush()
    target = f"channel/{channel.name}"

    def post(client, source, content, session=None):
        response = client.post("/v1/events", json={
            "type": "workspace.message.posted", "network": network, "target": target,
            "source": source, "payload": {"message_type": "chat", "content": content},
            "metadata": {"session_id": session} if session else {},
        })
        response.raise_for_status()
        return response.json()["data"]

    def history(client, **filters):
        response = client.get("/v1/events", params={
            "network": network, "target": target, "type": "workspace.message.posted", **filters,
        })
        response.raise_for_status()
        return {event["id"]: event for event in response.json()["data"]["events"]}

    with ExitStack() as stack:
        def connect(headers):
            return stack.enter_context(httpx.Client(base_url=server_url, headers=headers, trust_env=False))

        people, agents, sessions = {}, {}, {}
        for email, names in team.items():
            user = User(email=email)
            db.add(user)
            db.flush()
            db.add(WorkspaceMembership(workspace_id=network, user_id=user.id, role="member"))
            token, _ = mint_workspace_session({"email": email, "email_verified": True})
            people[email] = connect({"Authorization": f"Bearer {token}"})
            for name in names:
                sessions[name] = secrets.token_hex(16)
                db.add(WorkspaceMember(workspace_id=network, agent_name=name, owner_email=email,
                                       session_id=sessions[name], status="online"))
                db.add(ChannelMember(channel_id=channel.id, agent_name=name))
                agents[name] = connect({"X-Workspace-Token": workspace["token"]})
                other = next(member for member in team if member != email)
                create_grant(db, network, resource_kind="agent", resource_id=name,
                             grantee_kind="human", grantee_id=other, rights=["act", "read"], granted_by=email)
        db.commit()

        alice, bob = team
        greeting = post(people[alice], f"human:{alice}", "乙，我们核对一下交付内容。")
        assert history(people[bob])[greeting["id"]]["payload"]["content"] == "乙，我们核对一下交付内容。"
        reply = post(people[bob], f"human:{bob}", "收到，我来安排复核。")
        assert reply["id"] in history(people[alice])
        for person in (alice, bob):
            request = post(people[person], f"human:{person}", "@writer、@editor 请分别起草和复核。")
            assert set(request["metadata"]["target_agents"]) == {"writer", "editor"}
            for agent in ("writer", "editor"):
                assert request["id"] in history(agents[agent], target_agents=agent)

        for sender in ("writer", "editor"):
            handoff = post(agents[sender], f"openagents:{sender}",
                           "@analyst，@reader 请分别核对数字和措辞。", sessions[sender])
            assert set(handoff["metadata"]["target_agents"]) == {"analyst", "reader"}
            for recipient in ("analyst", "reader"):
                assert handoff["id"] in history(agents[recipient], target_agents=recipient)
            assert handoff["id"] not in history(agents[sender], target_agents=sender)

        for reviewer in ("analyst", "reader"):
            result = post(agents[reviewer], f"openagents:{reviewer}", "已完成核对。", sessions[reviewer])
            assert result["metadata"]["target_agents"] == ["__no_response__"]
            for person in people.values():
                assert history(person)[result["id"]]["source"] == f"openagents:{reviewer}"
