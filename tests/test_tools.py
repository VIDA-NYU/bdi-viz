import json
from unittest.mock import MagicMock, patch

import pytest

from api.tools.candidate_tools import CandidateTools
from api.tools.online_research_tools import OnlineResearchTools
from api.tools.query_tools import QueryTools
from api.tools.source_scraper import scraping_websource
from api.tools.task_tools import TaskTools


class TestCandidateTools:

    @pytest.fixture(autouse=True)
    def _manage_test_session(
        self, client, session_manager, sample_source_csv, sample_target_csv
    ):
        """Create and clean up a dedicated 'test_session' for this class.

        This uses the API endpoints to mirror real behavior and ensures the
        class's tests run with a predictable session lifecycle.
        """
        create_resp = client.post(
            "/api/session/create", json={"session_name": "test_session"}
        )
        assert create_resp.status_code == 200
        assert "test_session" in create_resp.get_json().get("sessions", [])
        self.session_manager = session_manager
        self.matching_task = session_manager.get_session("test_session").matching_task
        self.matching_task.update_dataframe(sample_source_csv, sample_target_csv)
        # Prime candidates cache to ensure tools can operate
        self.matching_task.get_candidates()

        yield

        delete_resp = client.post(
            "/api/session/delete", json={"session_name": "test_session"}
        )
        assert delete_resp.status_code == 200
        assert delete_resp.get_json().get("message") == "success"

    def test_candidate_tools(self):
        candidate_tools = CandidateTools("test_session")
        tools = candidate_tools.get_tools()
        assert len(tools) > 0

        for tool in tools:
            assert tool.name is not None

    def test_accept_match(self):
        candidate_tools = CandidateTools("test_session")
        candidates = self.matching_task.get_cached_candidates()
        candidate_to_accept = candidates[0]
        for candidate in candidates:
            if candidate["status"] == "idle":
                candidate_to_accept = candidate
                break

        source_column = candidate_to_accept["sourceColumn"]
        target_column = candidate_to_accept["targetColumn"]
        assert candidate_to_accept["status"] == "idle"

        ret = candidate_tools.accept_match(source_column, target_column)

        assert ret is True

        candidates = self.matching_task.get_cached_candidates()
        for candidate in candidates:
            if (
                candidate["sourceColumn"] == source_column
                and candidate["targetColumn"] == target_column
            ):
                print(candidate)
                assert candidate["status"] == "accepted"

    def test_reject_match(self):
        candidate_tools = CandidateTools("test_session")
        candidates = self.matching_task.get_cached_candidates()
        candidate_to_reject = candidates[0]
        for candidate in candidates:
            if candidate["status"] == "idle":
                candidate_to_reject = candidate
                break

        source_column = candidate_to_reject["sourceColumn"]
        target_column = candidate_to_reject["targetColumn"]
        assert candidate_to_reject["status"] == "idle"

        ret = candidate_tools.reject_match(source_column, target_column)

        assert ret is True

        candidates = self.matching_task.get_cached_candidates()
        for candidate in candidates:
            if (
                candidate["sourceColumn"] == source_column
                and candidate["targetColumn"] == target_column
            ):
                assert candidate["status"] == "rejected"

    def test_update_candidates(self):
        candidate_tools = CandidateTools("test_session")
        candidates = self.matching_task.get_cached_candidates()
        source_attribute = candidates[0]["sourceColumn"]
        candidates_to_update = []
        for candidate in candidates:
            if candidate["sourceColumn"] == source_attribute:
                candidates_to_update.append(candidate)

        candidates_to_update = [
            {
                "sourceColumn": candidate["sourceColumn"],
                "targetColumn": candidate["targetColumn"],
                "score": candidate["score"] * 0.9,
                "status": candidate["status"],
                "matcher": candidate["matcher"],
            }
            for candidate in candidates_to_update
        ]

        ret = candidate_tools.source_candidates_update(
            source_attribute, candidates_to_update
        )

        assert ret is True

        candidates = self.matching_task.get_cached_candidates()
        for candidate in candidates:
            if candidate["sourceColumn"] == source_attribute:
                for candidate_to_update in candidates_to_update:
                    same_target = (
                        candidate["targetColumn"] == candidate_to_update["targetColumn"]
                    )
                    same_matcher = (
                        candidate["matcher"] == candidate_to_update["matcher"]
                    )
                    if same_target and same_matcher:
                        expected_score = candidate_to_update["score"]
                        expected_status = candidate_to_update["status"]
                        assert candidate["score"] == expected_score
                        assert candidate["status"] == expected_status

    def test_prune_candidates(self):
        candidate_tools = CandidateTools("test_session")
        candidates = self.matching_task.get_cached_candidates()
        source_attribute = candidates[0]["sourceColumn"]
        candidates_to_prune = []
        for candidate in candidates:
            if candidate["sourceColumn"] == source_attribute:
                candidates_to_prune.append(candidate)
        ret = candidate_tools.source_candidates_prune(
            source_attribute, candidates_to_prune
        )

        assert ret is True

        candidates = self.matching_task.get_cached_candidates()
        for candidate_to_prune in candidates_to_prune:
            for candidate in candidates:
                if (
                    candidate["sourceColumn"] == candidate_to_prune["sourceColumn"]
                    and candidate["targetColumn"] == candidate_to_prune["targetColumn"]
                    and candidate["matcher"] == candidate_to_prune["matcher"]
                ):
                    assert False

    def test_append_candidates(self):
        candidate_tools = CandidateTools("test_session")
        candidates = self.matching_task.get_cached_candidates()
        source_attribute = candidates[0]["sourceColumn"]
        candidates_to_append = [
            {
                "sourceColumn": source_attribute,
                "targetColumn": "gagaga",
                "score": 0.9,
                "status": "idle",
                "matcher": "gagaga",
            }
        ]

        ret = candidate_tools.source_candidates_append(
            source_attribute, candidates_to_append
        )

        assert ret is True

        candidates = self.matching_task.get_cached_candidates()
        for candidate in candidates:
            if (
                candidate["sourceColumn"] == source_attribute
                and candidate["targetColumn"] == "gagaga"
            ):
                assert candidate["score"] == 0.9
                assert candidate["status"] == "idle"
                assert candidate["matcher"] == "gagaga"
                break


class TestQueryTools:
    @pytest.fixture(autouse=True)
    def _setup(self, client, session_manager, sample_source_csv, sample_target_csv):
        create_resp = client.post(
            "/api/session/create", json={"session_name": "test_session"}
        )
        assert create_resp.status_code == 200
        assert "test_session" in create_resp.get_json().get("sessions", [])
        self.session_manager = session_manager
        self.matching_task = session_manager.get_session("test_session").matching_task
        self.matching_task.update_dataframe(sample_source_csv, sample_target_csv)
        self.matching_task.get_candidates()
        yield
        delete_resp = client.post(
            "/api/session/delete", json={"session_name": "test_session"}
        )
        assert delete_resp.status_code == 200
        assert delete_resp.get_json().get("message") == "success"

    def test_query_tools(self):
        tools = QueryTools("test_session", memory_retriever=MagicMock())
        tool_list = tools.get_tools()
        assert len(tool_list) >= 4
        # basic calls
        cached = self.matching_task.get_cached_candidates()
        source_attr = cached[0]["sourceColumn"]
        target_attr = cached[0]["targetColumn"]
        assert isinstance(tools._read_source_candidates(source_attr), list)
        assert isinstance(tools._read_source_values("test_session", source_attr), list)
        assert isinstance(tools._read_target_values("test_session", target_attr), list)
        assert isinstance(
            tools._read_target_description("test_session", target_attr), str
        )
        assert isinstance(
            tools._read_source_description("test_session", source_attr), str
        )


class TestTaskTools:
    @pytest.fixture(autouse=True)
    def _setup(self, client, session_manager):
        create_resp = client.post(
            "/api/session/create", json={"session_name": "test_session"}
        )
        assert create_resp.status_code == 200
        assert "test_session" in create_resp.get_json().get("sessions", [])
        self.session_manager = session_manager
        yield
        delete_resp = client.post(
            "/api/session/delete", json={"session_name": "test_session"}
        )
        assert delete_resp.status_code == 200
        assert delete_resp.get_json().get("message") == "success"

    def test_task_tools(self):
        tools = TaskTools(session_id="test_session")
        with patch("api.index.run_matching_task") as mock_run, patch(
            "api.index.run_new_matcher_task"
        ) as mock_new:
            mock_task = MagicMock()
            mock_task.id = "task-123"
            mock_run.delay.return_value = mock_task
            mock_new.delay.return_value = mock_task
            msg = tools.start_matching_task_tool.invoke({"nodes": ["demographic"]})
            assert "Task ID: task-123" in msg
            payload = {"name": "A", "code": "class A: pass", "params": {}}
            msg = tools.create_matcher_task_tool.invoke(payload)
            assert "Task ID: task-123" in msg


class TestSourceScraper:
    def test_source_scraper_tool(self):
        out = scraping_websource.invoke({"query": "cancer", "topk": 3})
        assert isinstance(out, list)


class TestOnlineResearchTools:
    @pytest.fixture(autouse=True)
    def _setup(self, client, session_manager):
        create_resp = client.post(
            "/api/session/create", json={"session_name": "test_session"}
        )
        assert create_resp.status_code == 200
        assert "test_session" in create_resp.get_json().get("sessions", [])
        self.session_manager = session_manager
        self.tools = OnlineResearchTools()
        yield
        delete_resp = client.post(
            "/api/session/delete", json={"session_name": "test_session"}
        )
        assert delete_resp.status_code == 200
        assert delete_resp.get_json().get("message") == "success"

    def test_search_methods(self, monkeypatch):
        class Resp:
            def __init__(self, status_code=200, payload=None):
                self.status_code = status_code
                self._payload = payload or {}

            def json(self):
                return self._payload

        def mock_get(url, params=None, headers=None, timeout=None):
            if "eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch" in url:
                return Resp(200, {"esearchresult": {"idlist": ["1"]}})
            if "eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary" in url:
                return Resp(
                    200,
                    {
                        "result": {
                            "1": {
                                "title": "T",
                                "authors": [],
                                "fulljournalname": "J",
                                "pubdate": "2020",
                            }
                        }
                    },
                )
            if "ebi.ac.uk/biostudies" in url:
                return Resp(
                    200,
                    {
                        "hits": [
                            {
                                "_score": 100,
                                "_source": {
                                    "title": "T",
                                    "authors": [],
                                    "accession": "E-1",
                                },
                            }
                        ]
                    },
                )
            if "zenodo.org/api/records" in url:
                return Resp(
                    200,
                    {
                        "hits": {
                            "hits": [
                                {
                                    "metadata": {"title": "Z"},
                                    "files": [],
                                    "links": {"html": "u"},
                                }
                            ]
                        }
                    },
                )
            return Resp(404, {})

        def mock_post(url, json=None, headers=None, timeout=None):
            if "api.figshare.com/v2/articles/search" in url:
                return Resp(200, [{"title": "F", "authors": []}])
            return Resp(404, {})

        monkeypatch.setattr("requests.get", mock_get)
        monkeypatch.setattr("requests.post", mock_post)

        # Internal methods
        assert self.tools._search_pubmed_datasets("x", 1)
        assert self.tools._search_biostudies_datasets("x", 1)
        assert self.tools._search_figshare_datasets("x", 1)
        assert self.tools._search_zenodo_datasets("x", 1)

        # Aggregated tool
        out = self.tools.search_for_dataset_tool.invoke(
            {
                "query": "x",
                "sources": [
                    "pubmed",
                    "biostudies",
                    "figshare",
                    "zenodo",
                ],
                "limit": 1,
            }
        )
        data = json.loads(out)
        assert data["total_results"] >= 4
