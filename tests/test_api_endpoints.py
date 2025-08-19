from unittest.mock import patch, MagicMock

from api.index import SESSION_MANAGER


class TestAPIEndpoints:
    """Test the API endpoints."""

    def test_get_history(
        self,
        client,
        sample_source_csv,
        sample_target_csv,
    ):
        """POST /api/history should return 200 and success message."""

        # Prepare the default session's matching task with sample data.
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)

        # Send an empty JSON payload to satisfy application/json requirement.
        response = client.post("/api/history", json={})

        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"

    def test_get_results(self, client, sample_source_csv, sample_target_csv):
        """POST /api/results should return 200 and success message."""

        # Prepare the default session's matching task with sample data.
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)

        # Send an empty JSON payload to satisfy application/json requirement.
        response = client.post("/api/results", json={})

        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        results = data["results"]
        assert "candidates" in results
        assert "sourceClusters" in results

    def test_start_matching_csv_input(self, client, sample_source_csv):
        """
        POST /api/matching/start with csv_input form should return task_id.
        """

        source_csv = sample_source_csv.to_csv(index=False)
        form = {
            "type": "csv_input",
            "source_csv": source_csv,
        }
        # no target => target defaults to GDC_DATA_PATH in handler
        response = client.post(
            "/api/matching/start",
            data=form,
            content_type="multipart/form-data",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert "task_id" in data

    def test_matching_status_pending(self, client):
        """POST /api/matching/status returns pending for unknown task id."""

        response = client.post("/api/matching/status", json={"taskId": "non-existent"})
        assert response.status_code == 200
        data = response.get_json()
        assert "status" in data

    def test_value_bins(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)

        response = client.post("/api/value/bins", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "results" in data

    def test_value_matches(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)

        response = client.post("/api/value/matches", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "results" in data

    def test_gdc_ontology(self, client):
        response = client.post("/api/gdc/ontology", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "results" in data

    def test_target_ontology(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        response = client.post("/api/ontology/target", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "results" in data

    def test_source_ontology(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        response = client.post("/api/ontology/source", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "results" in data

    def test_gdc_property(self, client):
        response = client.post("/api/gdc/property", json={"targetColumn": "age"})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "property" in data

    def test_property(self, client):
        response = client.post("/api/property", json={"targetColumn": "age"})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "property" in data

    def test_candidates_results_csv(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        default_task.get_candidates()
        response = client.post("/api/candidates/results", json={"format": "csv"})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert isinstance(data["results"], str)

    def test_candidates_results_json(
        self, client, sample_source_csv, sample_target_csv
    ):
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        default_task.get_candidates()
        response = client.post("/api/candidates/results", json={"format": "json"})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert isinstance(data["results"], list)
        assert len(data["results"]) > 0

    def test_get_matchers(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        default_task.get_candidates()
        response = client.post("/api/matchers", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert isinstance(data["matchers"], list)

    def test_new_matcher_and_status(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)

        with patch("api.index.run_new_matcher_task.delay") as mock_delay:
            mock_result = MagicMock()
            mock_result.id = "task-1"
            mock_delay.return_value = mock_result
            response = client.post(
                "/api/matcher/new",
                json={"name": "m1", "code": "", "params": {}},
            )
            assert response.status_code == 200
            data = response.get_json()
            assert "task_id" in data

        with patch("api.index.run_new_matcher_task.AsyncResult") as mock_async:
            mock_task = MagicMock()
            mock_task.state = "SUCCESS"
            mock_task.result = {"status": "completed", "error": None}
            mock_async.return_value = mock_task
            response = client.post("/api/matcher/status", json={"taskId": "task-1"})
            assert response.status_code == 200
            data = response.get_json()
            assert data["status"] in {"completed", "pending", "failed"}

    def test_agent_explain(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        with patch("api.index.get_agent") as mock_get_agent:
            mock_agent = MagicMock()
            mock_agent.explain.return_value = MagicMock(
                model_dump=lambda: {
                    "explanations": [],
                    "is_match": True,
                    "relevant_knowledge": [],
                }
            )
            mock_get_agent.return_value = mock_agent
            response = client.post(
                "/api/agent/explain",
                json={"sourceColumn": "Age", "targetColumn": "age"},
            )
            assert response.status_code == 200
            data = response.get_json()
            assert "explanations" in data

    def test_agent_thumb(self, client):
        with patch("api.index.get_agent") as mock_get_agent:
            mock_agent = MagicMock()
            mock_get_agent.return_value = mock_agent
            response = client.post(
                "/api/agent/thumb",
                json={
                    "explanation": {"title": "t"},
                    "userOperation": {"operation": "accept"},
                },
            )
            assert response.status_code == 200
            data = response.get_json()
            assert data["message"] == "success"

    def test_user_operation_apply(self, client):
        with patch("api.index.get_agent") as mock_get_agent:
            mock_agent = MagicMock()
            mock_get_agent.return_value = mock_agent
            response = client.post(
                "/api/user-operation/apply",
                json={
                    "userOperations": [
                        {
                            "operation": "accept",
                            "candidate": {
                                "sourceColumn": "Age",
                                "targetColumn": "age",
                                "status": "idle",
                                "score": 0.7,
                                "matcher": "m1",
                            },
                            "references": [],
                            "isMatchToAgent": True,
                        }
                    ]
                },
            )
            assert response.status_code == 200
            data = response.get_json()
            assert data["message"] == "success"

    def test_user_operation_undo_redo(self, client):
        response = client.post("/api/user-operation/undo", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert "message" in data

        response = client.post("/api/user-operation/redo", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert "message" in data

    def test_matching_rematch(self, client):
        with patch("api.index.os.path.exists", return_value=True):
            response = client.post(
                "/api/matching/rematch",
                json={"nodes": ["n1", "n2"]},
            )
            # Accepted, returns task id
            assert response.status_code == 200
            data = response.get_json()
            assert "task_id" in data

    def test_ontology_status_endpoints(self, client):
        # Source ontology status: SUCCESS
        with patch("api.index.infer_source_ontology_task.AsyncResult") as mock_async:
            mock_task = MagicMock()
            mock_task.state = "SUCCESS"
            mock_task.result = {"status": "completed", "taskId": "task-src-1"}
            mock_async.return_value = mock_task
            response = client.post("/api/ontology/source/status", json={"taskId": "task-src-1"})
            assert response.status_code == 200
            data = response.get_json()
            assert data["status"] in {"completed", "pending", "failed", "SUCCESS"}

        # Target ontology status: PENDING
        with patch("api.index.infer_target_ontology_task.AsyncResult") as mock_async:
            mock_task = MagicMock()
            mock_task.state = "PENDING"
            mock_task.result = None
            mock_async.return_value = mock_task
            response = client.post("/api/ontology/target/status", json={"taskId": "task-tgt-1"})
            assert response.status_code == 200
            data = response.get_json()
            assert data["status"] in {"pending", "PENDING"}

    def test_agent_endpoint(self, client):
        with patch("api.index.get_agent") as mock_get_agent:
            mock_agent = MagicMock()
            mock_response = MagicMock()
            mock_response.model_dump.return_value = {"answer": "ok"}
            mock_agent.invoke.return_value = mock_response
            mock_get_agent.return_value = mock_agent
            response = client.post("/api/agent", json={"prompt": "hello"})
            assert response.status_code == 200
            data = response.get_json()
            assert data.get("answer") == "ok"

    def test_agent_explore_endpoint(self, client):
        with patch("api.index.get_langgraph_agent") as mock_get_agent:
            mock_agent = MagicMock()
            mock_agent.invoke.return_value = {"result": "explored"}
            mock_get_agent.return_value = mock_agent
            response = client.post("/api/agent/explore", json={"query": "q"})
            assert response.status_code == 200
            data = response.get_json()
            assert data.get("result") == "explored"

    def test_agent_outer_source_endpoint(self, client, sample_source_csv, sample_target_csv):
        # Ensure matching task has data loaded
        default_task = SESSION_MANAGER.get_session("default").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        response = client.post(
            "/api/agent/outer-source",
            json={"sourceColumn": "Age", "targetColumn": "age"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
