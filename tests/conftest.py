# flake8: noqa
import os
import sys
import pytest
import tempfile
import shutil
import pandas as pd
from typing import List, Optional
from unittest.mock import Mock, patch

# Add the parent directory to sys.path so we can import from api package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

# Import the global Flask app instance so that all API routes are accessible
from api.index import app as flask_app  # noqa: E402
from api.langchain.memory import MemoryRetriever  # noqa: E402
from api.session_manager import SessionManager  # noqa: E402
from api.matching_task import MatchingTask  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_cwd(tmp_path, monkeypatch):
    """Isolate each test's CWD to a temporary directory.

    This prevents tests from writing files like .source.csv/.target.csv or
    .source.json/.target.json into the project root.
    """
    monkeypatch.chdir(tmp_path)


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
}


@pytest.fixture
def session_manager():
    """Create a session manager for testing."""
    # remove cache
    if os.path.exists("../matching_results_test_session.json"):
        os.remove("../matching_results_test_session.json")
    return SessionManager()


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


def _mock_load_ontology(dataset: str = "target", columns: Optional[List[str]] = None):
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
        ]


def _mock_load_property(target_column: str):
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
