import os

from api.session_manager import SessionManager


def test_add_session_reorders_and_lru():
    manager = SessionManager()
    for name in ["s1", "s2", "s3", "s4"]:
        manager.add_session(name)

    # Move default to the most-recent position so it is not evicted.
    manager.get_session("default")

    manager.add_session("s5")
    assert "s1" not in manager.sessions
    assert "s5" in manager.sessions
    assert len(manager.sessions) <= manager.max_sessions

    manager.add_session("s2")
    assert manager.queue[-1] == "s2"


def test_get_session_disk_and_fallback(tmp_path, monkeypatch):
    manager = SessionManager()
    monkeypatch.setattr("api.utils.SESSIONS_ROOT", str(tmp_path), raising=True)

    fallback = manager.get_session("missing")
    assert fallback is manager.sessions["default"]

    (tmp_path / "disk_session").mkdir()
    disk_session = manager.get_session("disk_session")
    assert "disk_session" in manager.sessions
    assert disk_session is manager.sessions["disk_session"]
    assert "disk_session" in manager.queue


def test_get_active_sessions_and_remove(tmp_path, monkeypatch):
    manager = SessionManager()
    monkeypatch.setattr("api.utils.SESSIONS_ROOT", str(tmp_path), raising=True)
    # SessionManager caches SESSIONS_ROOT on import; patch the module-level copy too.
    monkeypatch.setattr(
        "api.session_manager.SESSIONS_ROOT", str(tmp_path), raising=True
    )
    (tmp_path / "disk_only").mkdir()

    manager.add_session("in_memory")
    names = manager.get_active_sessions()
    assert set(["disk_only", "in_memory", "default"]).issubset(set(names))

    manager.remove_session("default")
    assert "default" in manager.sessions

    manager.remove_session("in_memory")
    assert "in_memory" not in manager.sessions
