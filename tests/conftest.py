# flake8: noqa
import os
import shutil
import sys
import tempfile
from typing import List, Optional
from unittest.mock import Mock, patch

import pandas as pd
import pytest

# Add the parent directory to sys.path so we can import from api package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

# Import the global Flask app instance so that all API routes are accessible
from api.index import app as flask_app  # noqa: E402
from api.langchain.memory import MemoryRetriever  # noqa: E402
from api.matching_task import MatchingTask  # noqa: E402
from api.session_manager import SessionManager  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_cwd(tmp_path, monkeypatch):
    """Isolate each test's CWD to a temporary directory.

    This prevents tests from writing files like .source.csv/.target.csv or
    .source.json/.target.json into the project root.
    """
    monkeypatch.chdir(tmp_path)


@pytest.fixture(autouse=True)
def _default_session_is_test_session(monkeypatch):
    """Make API endpoints default to 'test_session' instead of 'default'.

    This avoids touching the real 'default' session during tests.
    """

    # Patch only the function used by routes to resolve session names
    def _extract_session_name(req):
        try:
            if getattr(req, "form", None) and req.form is not None:
                if "session_name" in req.form:
                    from api.utils import sanitize_session_name as _sanitize

                    return _sanitize(req.form.get("session_name"))
            if getattr(req, "json", None) and req.json is not None:
                from api.utils import sanitize_session_name as _sanitize

                return _sanitize(req.json.get("session_name", "test_session"))
        except Exception:
            pass
        return "test_session"

    monkeypatch.setattr(
        "api.index.extract_session_name", _extract_session_name, raising=True
    )


@pytest.fixture(scope="session", autouse=True)
def _kill_redis_6380_before_tests():
    """Ensure no Redis process is bound to 6380 before running tests."""
    try:
        import subprocess

        # Try lsof first (macOS/Linux), fall back to pkill
        result = subprocess.run(
            ["bash", "-lc", "lsof -ti :6380 || true"], capture_output=True, text=True
        )
        pids = result.stdout.strip()
        if pids:
            subprocess.run(["bash", "-lc", f"kill -9 {pids} || true"], check=False)
        else:
            subprocess.run(
                ["bash", "-lc", "pkill -f 'redis-server.*6380' || true"], check=False
            )
    except Exception:
        pass


@pytest.fixture(autouse=True)
def _redirect_matching_results(tmp_path, monkeypatch):
    """Redirect matching_results_*.json R/W to the temp directory.

    Prevents touching files under api/ such as matching_results_default.json.
    """

    def _export_cache_to_json(self, json_obj):
        output_path = tmp_path / f"matching_results_{self.session_name}.json"
        with open(output_path, "w") as f:
            import json as _json

            _json.dump(json_obj, f, indent=4)

    def _import_cache_from_json(self):
        import json as _json

        output_path = tmp_path / f"matching_results_{self.session_name}.json"
        if output_path.exists() and output_path.stat().st_size > 0:
            try:
                with open(output_path, "r") as f:
                    return _json.load(f)
            except Exception:
                return None
        return None

    monkeypatch.setattr(
        MatchingTask, "_export_cache_to_json", _export_cache_to_json, raising=True
    )
    monkeypatch.setattr(
        MatchingTask, "_import_cache_from_json", _import_cache_from_json, raising=True
    )


@pytest.fixture(autouse=True)
def _patch_tool_session_manager(session_manager, monkeypatch):
    """Ensure tools use the same SessionManager instance as tests."""
    monkeypatch.setattr(
        "api.tools.candidate_tools.SESSION_MANAGER", session_manager, raising=True
    )
    monkeypatch.setattr(
        "api.tools.query_tools.SESSION_MANAGER", session_manager, raising=True
    )
    monkeypatch.setattr(
        "api.tools.task_tools.SESSION_MANAGER", session_manager, raising=True
    )


MOCK_TARGET_ONTOLOGY = {
    "gender": {
        "column_name": "gender",
        "category": "clinical",
        "node": "demographic",
        "type": "enum",
        "description": "The patient's gender.",
        "enum": ["male", "female"],
    },
    "age": {
        "column_name": "age",
        "category": "clinical",
        "node": "demographic",
        "type": "integer",
        "description": "The patient's age (in years) on the reference or "
        "anchor date used during date obfuscation.",
    },
    "ajcc_pathologic_t": {
        "column_name": "ajcc_pathologic_t",
        "category": "clinical",
        "node": "tumor",
        "type": "enum",
        "description": "The patient's AJCC pathologic T stage.",
        "enum": ["AI", "II"],
    },
    "age_is_obfuscated": {
        "column_name": "age_is_obfuscated",
        "category": "clinical",
        "node": "demographic",
        "type": "boolean",
        "description": "Whether the patient's age is obfuscated.",
    },
}

MOCK_SOURCE_ONTOLOGY = {
    "Gender": {
        "column_name": "Gender",
        "category": "demographic",
        "node": "demographic",
        "type": "enum",
        "description": "The patient's gender.",
        "enum": ["Male", "Female"],
    },
    "Age": {
        "column_name": "Age",
        "category": "demographic",
        "node": "demographic",
        "type": "integer",
        "description": "The patient's age (in years) on the reference or "
        "anchor date used during date obfuscation.",
    },
    "AJCC_Path_pT": {
        "column_name": "AJCC_Path_pT",
        "category": "tumor",
        "node": "tumor",
        "type": "enum",
        "description": "The patient's AJCC pathologic T stage.",
        "enum": ["pTa1", "pT2"],
    },
    "Is_Obfuscated": {
        "column_name": "Is_Obfuscated",
        "category": "demographic",
        "node": "demographic",
        "type": "boolean",
        "description": "Whether the patient's age is obfuscated.",
    },
}


@pytest.fixture
def session_manager():
    """Create a session manager for testing."""
    # remove cache
    if os.path.exists("../matching_results_test_session.json"):
        os.remove("../matching_results_test_session.json")

    session_manager = SessionManager()
    session_manager.add_session("test_session")
    return session_manager


@pytest.fixture
def app():
    """Provide the main Flask application (with routes) to each test."""
    # Create a temporary directory for the test run (e.g., for temporary CSVs)
    test_dir = tempfile.mkdtemp()

    # Update configuration for testing
    flask_app.config.update(
        {
            "TESTING": True,
            "CELERY": {
                "broker_url": "memory://",
                "result_backend": "cache+memory://",
                "task_always_eager": True,
            },
        }
    )

    # Push an application context so that the app can be used in the tests
    with flask_app.app_context():
        yield flask_app

    # Clean up any temporary files/directories created during the test
    shutil.rmtree(test_dir, ignore_errors=True)


@pytest.fixture
def client(app):
    """A test client for the app."""
    return app.test_client()


@pytest.fixture
def runner(app):
    """A test runner for the app's Click commands."""
    return app.test_cli_runner()


@pytest.fixture
def mock_memory_retriever():
    """Mock memory retriever for testing."""
    memory_retriever = MemoryRetriever()
    memory_retriever.reset_memory()
    return memory_retriever


@pytest.fixture
def sample_source_csv():
    """Sample source CSV data for testing."""
    return pd.DataFrame(
        {
            "Gender": ["Male", "Female"],
            "Age": ["70", "83"],
            "AJCC_Path_pT": ["pTa1", "pT2"],
            "Is_Obfuscated": [True, True],
        }
    )


@pytest.fixture
def sample_target_csv():
    """Sample target CSV data for testing."""
    return pd.DataFrame(
        {
            "gender": ["male", "female"],
            "age": ["70", "83"],
            "ajcc_pathologic_t": ["AI", "II"],
            "age_is_obfuscated": [True, False],
        }
    )


# Mock utils load ontology
@pytest.fixture(scope="session", autouse=True)
def mock_load_ontology_flat():
    """Mock load ontology for testing."""
    with patch("api.matching_task.load_ontology_flat") as mock_load_ontology_flat:
        mock_load_ontology_flat.return_value = MOCK_TARGET_ONTOLOGY
        yield mock_load_ontology_flat


@pytest.fixture(scope="session", autouse=True)
def mock_load_ontology_flat_utils():
    """Mock load ontology for testing."""
    with patch("api.utils.load_ontology_flat") as mock_load_ontology_flat:
        mock_load_ontology_flat.return_value = MOCK_SOURCE_ONTOLOGY
        yield mock_load_ontology_flat


def _mock_load_ontology(
    dataset: str = "target",
    columns: Optional[List[str]] = None,
    session: Optional[str] = None,
):
    if dataset == "target":
        if columns is None:
            columns = list(MOCK_TARGET_ONTOLOGY.keys())

        mock_target_tree = [
            {
                "name": "gender",
                "parent": "demographic",
                "grandparent": "clinical",
            },
            {
                "name": "age",
                "parent": "demographic",
                "grandparent": "clinical",
            },
            {
                "name": "ajcc_pathologic_t",
                "parent": "tumor",
                "grandparent": "clinical",
            },
            {
                "name": "age_is_obfuscated",
                "parent": "demographic",
                "grandparent": "clinical",
            },
        ]
        return [node for node in mock_target_tree if node["name"] in columns]
    else:
        return [
            {
                "name": "Gender",
                "parent": "demographic",
                "grandparent": "demographic",
            },
            {
                "name": "Age",
                "parent": "demographic",
                "grandparent": "demographic",
            },
            {
                "name": "AJCC_Path_pT",
                "parent": "tumor",
                "grandparent": "tumor",
            },
            {
                "name": "Is_Obfuscated",
                "parent": "demographic",
                "grandparent": "demographic",
            },
        ]


def _mock_load_property(target_column: str, session: Optional[str] = None):
    return MOCK_TARGET_ONTOLOGY[target_column]


@pytest.fixture(scope="session", autouse=True)
def mock_load_ontology():
    """Mock load ontology for testing."""
    with patch("api.matching_task.load_ontology") as mock_load_ontology:
        mock_load_ontology.side_effect = _mock_load_ontology
        yield mock_load_ontology


@pytest.fixture(scope="session", autouse=True)
def mock_load_ontology_utils():
    """Mock load ontology for testing."""
    with patch("api.utils.load_ontology") as mock_load_ontology:
        mock_load_ontology.side_effect = _mock_load_ontology
        yield mock_load_ontology


@pytest.fixture(scope="session", autouse=True)
def mock_load_property():
    """Mock load property for testing."""
    with patch("api.matching_task.load_property") as mock_load_property:
        mock_load_property.side_effect = _mock_load_property
        yield mock_load_property


@pytest.fixture(scope="session", autouse=True)
def mock_load_property_utils():
    """Mock load property for testing."""
    with patch("api.utils.load_property") as mock_load_property:
        mock_load_property.side_effect = _mock_load_property
        yield mock_load_property


@pytest.fixture(scope="session", autouse=True)
def mock_load_property_rapidfuzz_value():
    """Ensure RapidFuzzValueMatcher uses the mocked load_property.

    RapidFuzzValueMatcher imports load_property directly from api.utils via
    a relative import (from ..utils import load_property). To affect that
    bound name, we must patch in the module namespace where it is used.
    """
    with patch("api.matcher.rapidfuzz_value.load_property") as mock_load_property:
        mock_load_property.side_effect = _mock_load_property
        yield mock_load_property


@pytest.fixture
def mock_celery_task():
    """Mock Celery task for testing."""
    with patch("api.index.run_matching_task") as mock_task:
        mock_result = Mock()
        mock_result.id = "test-task-id"
        mock_result.state = "PENDING"
        mock_result.info = None
        mock_result.result = None
        mock_task.delay.return_value = mock_result
        mock_task.AsyncResult.return_value = mock_result
        yield mock_task


# Ensure Celery tasks do not try to connect to Redis during tests
@pytest.fixture(autouse=True)
def _mock_celery_apply_async(monkeypatch):
    """Mock Celery apply_async and AsyncResult for API tasks to avoid broker IO."""

    # Mock run_matching_task.apply_async
    def _mock_apply_async_match(args, kwargs=None, queue=None):
        mock_result = Mock()
        mock_result.id = "test-matching-task-id"
        return mock_result

    def _mock_async_result_match(task_id):
        mock_result = Mock()
        mock_result.state = "PENDING"
        mock_result.info = None
        mock_result.result = None
        mock_result.traceback = None
        return mock_result

    monkeypatch.setattr(
        "api.index.run_matching_task.apply_async", _mock_apply_async_match, raising=True
    )
    monkeypatch.setattr(
        "api.index.run_matching_task.AsyncResult",
        _mock_async_result_match,
        raising=True,
    )

    # Mock infer_source_ontology_task.apply_async
    def _mock_apply_async_source(args, queue=None):
        mock_result = Mock()
        mock_result.id = "test-source-task-id"
        return mock_result

    def _mock_async_result_source(task_id):
        mock_result = Mock()
        mock_result.state = "PENDING"
        mock_result.info = None
        mock_result.result = None
        mock_result.traceback = None
        return mock_result

    monkeypatch.setattr(
        "api.index.infer_source_ontology_task.apply_async",
        _mock_apply_async_source,
        raising=True,
    )
    monkeypatch.setattr(
        "api.index.infer_source_ontology_task.AsyncResult",
        _mock_async_result_source,
        raising=True,
    )

    # Mock infer_target_ontology_task.apply_async
    def _mock_apply_async_target(args, queue=None):
        mock_result = Mock()
        mock_result.id = "test-target-task-id"
        return mock_result

    def _mock_async_result_target(task_id):
        mock_result = Mock()
        mock_result.state = "PENDING"
        mock_result.info = None
        mock_result.result = None
        mock_result.traceback = None
        return mock_result

    monkeypatch.setattr(
        "api.index.infer_target_ontology_task.apply_async",
        _mock_apply_async_target,
        raising=True,
    )
    monkeypatch.setattr(
        "api.index.infer_target_ontology_task.AsyncResult",
        _mock_async_result_target,
        raising=True,
    )

    # Mock run_new_matcher_task.delay and AsyncResult to avoid broker IO
    def _mock_delay_new_matcher(session, name, code, params):
        mock_result = Mock()
        mock_result.id = "test-new-matcher-task-id"
        return mock_result

    def _mock_async_result_new_matcher(task_id):
        mock_result = Mock()
        mock_result.state = "SUCCESS"
        mock_result.info = None
        mock_result.result = {"status": "completed", "error": None}
        mock_result.traceback = None
        return mock_result

    monkeypatch.setattr(
        "api.index.run_new_matcher_task.delay",
        _mock_delay_new_matcher,
        raising=True,
    )
    monkeypatch.setattr(
        "api.index.run_new_matcher_task.AsyncResult",
        _mock_async_result_new_matcher,
        raising=True,
    )


@pytest.fixture(autouse=True)
def _mock_agents(monkeypatch):
    """Mock agent factories to avoid real OpenAI usage during tests."""

    class _DummyAgent:
        def handle_user_operation(self, operation, candidate, is_match_to_agent):
            return None

        def handle_undo_operation(self, operation, candidate, is_match_to_agent):
            return None

        def remember_ontology(self, ontology):
            return None

        # Optional helpers if an endpoint accidentally calls them
        def explain(self, candidate, with_memory=True):
            from api.langchain.pydantic import CandidateExplanation

            return CandidateExplanation(
                explanations=[], is_match=True, relevant_knowledge=[]
            )

        def invoke(self, *args, **kwargs):
            class _Resp:
                def model_dump(self):
                    return {"answer": "ok"}

            return _Resp()

    def _get_agent(session: str = "test_session"):
        return _DummyAgent()

    def _get_langgraph_agent(session: str = "test_session"):
        return _DummyAgent()

    monkeypatch.setattr("api.index.get_agent", _get_agent, raising=True)
    monkeypatch.setattr(
        "api.index.get_langgraph_agent", _get_langgraph_agent, raising=True
    )
