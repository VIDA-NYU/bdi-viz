from unittest.mock import MagicMock, patch

from api.index import SESSION_MANAGER


class TestAPIEndpoints:
    """Test the API endpoints."""

    def test_session_create(self, client):
        response = client.post(
            "/api/session/create", json={"session_name": "test_session"}
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "sessions" in data
        assert "test_session" in data["sessions"]

    def test_session_list(self, client):
        response = client.post(
            "/api/session/list", json={"session_name": "test_session"}
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "sessions" in data
        assert "test_session" in data["sessions"]
        assert "default" in data["sessions"]

    def test_get_history(
        self,
        client,
        sample_source_csv,
        sample_target_csv,
    ):
        """POST /api/history should return 200 and success message."""

        # Prepare the test_session session's matching task with sample data.
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)

        # Send an empty JSON payload to satisfy application/json requirement.
        response = client.post("/api/history", json={})

        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"

    def test_get_results(self, client, sample_source_csv, sample_target_csv):
        """POST /api/results should return 200 and success message."""

        # Prepare the test_session session's matching task with sample data.
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)

        # Send an empty JSON payload to satisfy application/json requirement.
        response = client.post("/api/results", json={})

        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        results = data["results"]
        assert "candidates" in results

    def test_start_matching_csv_input(
        self, client, sample_source_csv, sample_target_csv
    ):
        """
        POST /api/matching/start with csv_input form should return task_id.
        """

        source_csv = sample_source_csv.to_csv(index=False)
        target_csv = sample_target_csv.to_csv(index=False)
        form = {
            "type": "csv_input",
            "source_csv": source_csv,
            "target_csv": target_csv,
            "source_csv_name": "mock_source.csv",
            "target_csv_name": "mock_target.csv",
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

    def test_start_matching_with_groundtruth(
        self, client, sample_source_csv, sample_target_csv
    ):
        """POST /api/matching/start with groundtruth CSV should enqueue task successfully."""

        source_csv = sample_source_csv.to_csv(index=False)
        target_csv = sample_target_csv.to_csv(index=False)
        groundtruth_csv = "source_attribute,target_attribute\nGender,gender\nAge,age\n"
        form = {
            "type": "csv_input",
            "source_csv": source_csv,
            "target_csv": target_csv,
            "groundtruth_csv": groundtruth_csv,
            "source_csv_name": "mock_source.csv",
            "target_csv_name": "mock_target.csv",
            "groundtruth_csv_name": "mock_groundtruth.csv",
        }

        response = client.post(
            "/api/matching/start",
            data=form,
            content_type="multipart/form-data",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert "task_id" in data

    def test_start_matching_with_groundtruth_value_mappings(
        self, client, sample_source_csv, sample_target_csv
    ):
        """POST /api/matching/start with 4-column groundtruth should enqueue and prefer mappings."""

        source_csv = sample_source_csv.to_csv(index=False)
        target_csv = sample_target_csv.to_csv(index=False)
        groundtruth_csv = (
            "source_attribute,target_attribute,source_value,target_value\n"
            "Gender,gender,Male,male\n"
            "Gender,gender,Female,female\n"
        )
        form = {
            "type": "csv_input",
            "source_csv": source_csv,
            "target_csv": target_csv,
            "groundtruth_csv": groundtruth_csv,
            "source_csv_name": "mock_source.csv",
            "target_csv_name": "mock_target.csv",
            "groundtruth_csv_name": "mock_groundtruth_values.csv",
        }

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
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)

        response = client.post("/api/value/bins", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "results" in data

    def test_value_matches(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
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
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        response = client.post("/api/ontology/target", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "results" in data

    def test_source_ontology(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
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
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
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
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        default_task.get_candidates()
        response = client.post("/api/candidates/results", json={"format": "json"})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert isinstance(data["results"], list)
        assert len(data["results"]) > 0

    def test_candidates_results_mapping_csv_4col(
        self, client, sample_source_csv, sample_target_csv
    ):
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        # Seed accepted candidate and value mapping quickly via groundtruth
        groundtruth_mappings = [
            ("Gender", "gender", "Male", "male"),
            ("Gender", "gender", "Female", "female"),
        ]
        default_task.get_candidates(
            groundtruth_pairs=[], groundtruth_mappings=groundtruth_mappings
        )
        response = client.post(
            "/api/candidates/results", json={"format": "mapping_csv_4col"}
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        text = data["results"]
        assert "source_attribute,target_attribute,source_value,target_value" in text
        assert "Gender,gender,Male,male" in text

    def test_get_matchers(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        default_task.get_candidates()
        response = client.post("/api/matchers", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert isinstance(data["matchers"], list)

    def test_new_matcher_and_status(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
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
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
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

    def test_agent_reset(self, client):
        with patch("api.index.get_langgraph_agent") as mock_get_agent, patch(
            "api.index.get_memory_retriever"
        ) as mock_get_mem:
            mock_agent = MagicMock()
            mock_get_agent.return_value = mock_agent
            mock_memory = MagicMock()
            mock_get_mem.return_value = mock_memory

            response = client.post("/api/agent/reset", json={})
            assert response.status_code == 200
            data = response.get_json()
            assert data["message"] == "success"
            mock_agent.reset_state.assert_called_once()
            mock_memory.clear_namespaces.assert_called_with(["user_memory"])

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

    def test_matching_rematch(self, client, sample_source_csv, sample_target_csv):
        """Test rematch endpoint uses session-specific file paths."""
        from api.utils import get_session_file
        import os
        
        # Create session files
        session = "test_session"
        source_path = get_session_file(session, "source.csv", create_dir=True)
        target_path = get_session_file(session, "target.csv", create_dir=True)
        sample_source_csv.to_csv(source_path, index=False)
        sample_target_csv.to_csv(target_path, index=False)
        
        response = client.post(
            "/api/matching/rematch",
            json={"nodes": ["n1", "n2"]},
        )
        # Accepted, returns task id
        assert response.status_code == 200
        data = response.get_json()
        assert "task_id" in data
        
        # Clean up
        if os.path.exists(source_path):
            os.remove(source_path)
        if os.path.exists(target_path):
            os.remove(target_path)

    def test_ontology_status_endpoints(self, client):
        # Source ontology status: SUCCESS
        with patch("api.index.infer_source_ontology_task.AsyncResult") as mock_async:
            mock_task = MagicMock()
            mock_task.state = "SUCCESS"
            mock_task.result = {"status": "completed", "taskId": "task-src-1"}
            mock_async.return_value = mock_task
            response = client.post(
                "/api/ontology/source/status", json={"taskId": "task-src-1"}
            )
            assert response.status_code == 200
            data = response.get_json()
            assert data["status"] in {"completed", "pending", "failed", "SUCCESS"}

        # Target ontology status: PENDING
        with patch("api.index.infer_target_ontology_task.AsyncResult") as mock_async:
            mock_task = MagicMock()
            mock_task.state = "PENDING"
            mock_task.result = None
            mock_async.return_value = mock_task
            response = client.post(
                "/api/ontology/target/status", json={"taskId": "task-tgt-1"}
            )
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

            class DummyAgent:
                def run_with_stream(
                    self,
                    query,
                    source_column=None,
                    target_column=None,
                    reset=False,
                    event_cb=None,
                ):
                    if event_cb:
                        event_cb(
                            "delta",
                            {
                                "state": {
                                    "message": "thinking",
                                    "next_agents": [],
                                    "candidates": [],
                                    "candidates_to_append": [],
                                }
                            },
                            "supervisor",
                        )
                        event_cb("final", {"result": "explored"}, "final")
                    return {"result": "explored"}

            mock_get_agent.return_value = DummyAgent()
            response = client.get(
                "/api/agent/explore",
                query_string={"session_name": "test_session", "query": "q"},
            )
            assert response.status_code == 200
            # SSE stream content type
            assert "text/event-stream" in response.content_type
            body = response.get_data(as_text=True)
            assert "event: ready" in body
            assert "event: final" in body
            assert '"result": "explored"' in body

    def test_agent_explore_tool_events(self, client):
        with patch("api.index.get_langgraph_agent") as mock_get_agent:

            class DummyAgent:
                def run_with_stream(
                    self,
                    query,
                    source_column=None,
                    target_column=None,
                    reset=False,
                    event_cb=None,
                ):
                    if event_cb:
                        # Agent thinking (delta)
                        event_cb(
                            "delta",
                            {
                                "state": {
                                    "message": "thinking",
                                    "next_agents": [],
                                    "candidates": [],
                                    "candidates_to_append": [],
                                }
                            },
                            "supervisor",
                        )
                        # Tool call (phase=call)
                        event_cb(
                            "tool",
                            {
                                "tool": {
                                    "phase": "call",
                                    "calls": [
                                        {
                                            "name": "search_ontology",
                                            "args": {"query": "histology"},
                                        }
                                    ],
                                }
                            },
                            "ontology_agent",
                        )
                        # Tool result (phase=result)
                        event_cb(
                            "tool",
                            {
                                "tool": {
                                    "phase": "result",
                                    "name": "read_source_candidates",
                                    "content": "[]",
                                    "is_error": False,
                                }
                            },
                            "candidate_agent",
                        )
                        # Final
                        event_cb("final", {"result": "done"}, "final")
                    return {"result": "done"}

            mock_get_agent.return_value = DummyAgent()
            response = client.get(
                "/api/agent/explore",
                query_string={"session_name": "test_session", "query": "q"},
            )
            assert response.status_code == 200
            assert "text/event-stream" in response.content_type
            body = response.get_data(as_text=True)
            # Agent message covered
            assert "event: delta" in body
            assert '"message": "thinking"' in body
            # Tool call covered
            assert "event: tool" in body
            assert '"phase": "call"' in body
            assert '"search_ontology"' in body
            # Tool result covered
            assert '"phase": "result"' in body
            assert '"read_source_candidates"' in body
            # Final covered
            assert "event: final" in body

    def test_agent_outer_source_endpoint(
        self, client, sample_source_csv, sample_target_csv
    ):
        # Ensure matching task has data loaded
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        response = client.post(
            "/api/agent/outer-source",
            json={"sourceColumn": "Age", "targetColumn": "age"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"

    def test_value_update_endpoint(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        response = client.post(
            "/api/value/update",
            json={
                "operation": "source",
                "column": "Gender",
                "value": "Male",
                "newValue": "M",
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"

        response = client.post(
            "/api/value/update",
            json={
                "operation": "target",
                "sourceColumn": "Gender",
                "sourceValue": "male",
                "targetColumn": "gender",
                "newTargetValue": "female",
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"

    def test_candidate_create_endpoint(
        self, client, sample_source_csv, sample_target_csv
    ):
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        response = client.post(
            "/api/candidate/create",
            json={
                "candidate": {
                    "sourceColumn": "Age",
                    "targetColumn": "age",
                    "status": "idle",
                    "score": 0.8,
                    "matcher": "m1",
                }
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"

        # test undo
        response = client.post("/api/user-operation/undo", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"

        # test redo
        response = client.post("/api/user-operation/redo", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"

    def test_get_dataset_names_endpoint(self, client, sample_source_csv, sample_target_csv):
        """Test getting dataset names with metadata."""
        from api.utils import write_session_csv_with_comments
        
        # Set up session files with metadata
        write_session_csv_with_comments(
            sample_source_csv,
            "test_session",
            "source",
            {
                "original_filename": "mock_source.csv",
                "timestamp": None,
                "size": None,
            },
        )
        write_session_csv_with_comments(
            sample_target_csv,
            "test_session",
            "target",
            {
                "original_filename": "mock_target.csv",
                "timestamp": None,
                "size": None,
            },
        )
        
        response = client.post("/api/datasets/names", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "sourceMeta" in data
        assert "targetMeta" in data
        assert data["sourceMeta"]["name"] == "mock_source.csv"
        assert data["targetMeta"]["name"] == "mock_target.csv"

    def test_candidate_delete_endpoint(
        self, client, sample_source_csv, sample_target_csv
    ):
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        response = client.post(
            "/api/candidate/delete",
            json={
                "candidate": {
                    "sourceColumn": "Age",
                    "targetColumn": "age",
                }
            },
        )

        # test undo
        response = client.post("/api/user-operation/undo", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"

        # test redo
        response = client.post("/api/user-operation/redo", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"

    def test_run_new_matcher_task(self, client, sample_source_csv, sample_target_csv):
        default_task = SESSION_MANAGER.get_session("test_session").matching_task
        default_task.update_dataframe(sample_source_csv, sample_target_csv)
        response = client.post(
            "/api/matcher/new",
            json={
                "name": "m1",
                "code": """
            class MyCustomMatcher():
                def __init__(self, name, weight=1, **params):
                    self.name = name
                    self.weight = 1
                def top_matches(self, source, target, top_k=20, **kwargs):
                    return []
                def top_value_matches(self, source_values, target_values, top_k=20, **kwargs):
                    return []
            """,
                "params": {},
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert "task_id" in data

        response = client.post("/api/matcher/status", json={"taskId": data["task_id"]})
        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] in {"completed", "pending", "failed"}

    def test_session_delete(self, client):
        response = client.post(
            "/api/session/delete", json={"session_name": "test_session"}
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "sessions" in data
        assert "test_session" not in data["sessions"]
        assert "default" in data["sessions"]

    def test_session_export(self, client, sample_source_csv, sample_target_csv):
        """Test session export endpoint."""
        from api.utils import get_session_file
        import os
        
        # Create session files
        session = "test_session"
        source_path = get_session_file(session, "source.csv", create_dir=True)
        target_path = get_session_file(session, "target.csv", create_dir=True)
        sample_source_csv.to_csv(source_path, index=False)
        sample_target_csv.to_csv(target_path, index=False)
        
        response = client.get(
            "/api/session/export",
            query_string={"session_name": session}
        )
        assert response.status_code == 200
        assert response.content_type == "application/zip"
        assert f"{session}.zip" in response.headers.get("Content-Disposition", "")
        
        # Clean up
        if os.path.exists(source_path):
            os.remove(source_path)
        if os.path.exists(target_path):
            os.remove(target_path)

    def test_session_export_not_found(self, client):
        """Test session export with non-existent session."""
        response = client.get(
            "/api/session/export",
            query_string={"session_name": "non_existent_session"}
        )
        assert response.status_code == 404
        data = response.get_json()
        assert data["message"] == "error"
        assert "not found" in data["error"].lower()

    def test_session_import(self, client, sample_source_csv, sample_target_csv):
        """Test session import endpoint."""
        import io
        import os
        import shutil
        import zipfile
        from api.utils import get_session_file
        from api.index import SESSION_MANAGER
        
        # Clean up any existing imported_session first
        try:
            imported_session_dir = get_session_file("imported_session", "dummy", create_dir=False)
            imported_session_dir = os.path.dirname(imported_session_dir)
            if os.path.exists(imported_session_dir):
                shutil.rmtree(imported_session_dir, ignore_errors=True)
            # Also remove from session manager if it exists
            if "imported_session" in SESSION_MANAGER.sessions:
                SESSION_MANAGER.delete_session("imported_session")
        except Exception:
            pass

        # Create a zip file with session data
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("source.csv", sample_source_csv.to_csv(index=False))
            zf.writestr("target.csv", sample_target_csv.to_csv(index=False))
        zip_buffer.seek(0)

        response = client.post(
            "/api/session/import",
            data={
                "file": (zip_buffer, "test_session.zip"),
                "session_name": "imported_session",
                "overwrite": "false"
            },
            content_type="multipart/form-data"
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert data["session"] == "imported_session"
        assert "imported_session" in data["sessions"]

        # Verify files were imported
        imported_source = get_session_file("imported_session", "source.csv", create_dir=False)
        imported_target = get_session_file("imported_session", "target.csv", create_dir=False)
        assert os.path.exists(imported_source)
        assert os.path.exists(imported_target)

        # Clean up
        if os.path.exists(imported_source):
            os.remove(imported_source)
        if os.path.exists(imported_target):
            os.remove(imported_target)

    def test_session_import_missing_file(self, client):
        """Test session import without file."""
        response = client.post(
            "/api/session/import",
            data={"session_name": "test_import"},
            content_type="multipart/form-data"
        )
        assert response.status_code == 400
        data = response.get_json()
        assert data["message"] == "error"
        assert "zip file" in data["error"].lower()

    def test_comments_list_all(self, client):
        """Test listing all comments."""
        response = client.post("/api/comments/list", json={})
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "commentsMap" in data
        assert isinstance(data["commentsMap"], dict)

    def test_comments_list_specific(self, client):
        """Test listing comments for a specific cell."""
        # First add a comment
        response = client.post(
            "/api/comments/add",
            json={
                "sourceColumn": "Age",
                "targetColumn": "age",
                "text": "Test comment"
            }
        )
        assert response.status_code == 200
        
        # Then list comments for that cell
        response = client.post(
            "/api/comments/list",
            json={"sourceColumn": "Age", "targetColumn": "age"}
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "comments" in data
        assert isinstance(data["comments"], list)
        assert len(data["comments"]) > 0
        assert data["comments"][0]["text"] == "Test comment"

    def test_comments_add(self, client):
        """Test adding a comment."""
        response = client.post(
            "/api/comments/add",
            json={
                "sourceColumn": "Gender",
                "targetColumn": "gender",
                "text": "This is a test comment"
            }
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "comments" in data
        assert len(data["comments"]) > 0
        assert data["comments"][-1]["text"] == "This is a test comment"
        assert "createdAt" in data["comments"][-1]

    def test_comments_add_missing_fields(self, client):
        """Test adding comment with missing fields."""
        response = client.post(
            "/api/comments/add",
            json={"sourceColumn": "Age"}
        )
        assert response.status_code == 400
        data = response.get_json()
        assert data["message"] == "failure"
        assert "error" in data

    def test_comments_set(self, client):
        """Test setting comments for a cell."""
        comments = [
            {"text": "First comment", "createdAt": "2024-01-01T00:00:00"},
            {"text": "Second comment", "createdAt": "2024-01-02T00:00:00"}
        ]
        response = client.post(
            "/api/comments/set",
            json={
                "sourceColumn": "Age",
                "targetColumn": "age",
                "comments": comments
            }
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        assert "comments" in data
        assert len(data["comments"]) == 2

    def test_comments_set_invalid_payload(self, client):
        """Test setting comments with invalid payload."""
        response = client.post(
            "/api/comments/set",
            json={
                "sourceColumn": "Age",
                "comments": "not a list"
            }
        )
        assert response.status_code == 400
        data = response.get_json()
        assert data["message"] == "failure"

    def test_comments_clear(self, client):
        """Test clearing comments for a cell."""
        # First add a comment
        response = client.post(
            "/api/comments/add",
            json={
                "sourceColumn": "Gender",
                "targetColumn": "gender",
                "text": "Comment to be cleared"
            }
        )
        assert response.status_code == 200
        
        # Then clear it
        response = client.post(
            "/api/comments/clear",
            json={
                "sourceColumn": "Gender",
                "targetColumn": "gender"
            }
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "success"
        
        # Verify it's cleared
        response = client.post(
            "/api/comments/list",
            json={"sourceColumn": "Gender", "targetColumn": "gender"}
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["comments"]) == 0

    def test_comments_clear_missing_fields(self, client):
        """Test clearing comments with missing fields."""
        response = client.post(
            "/api/comments/clear",
            json={"sourceColumn": "Age"}
        )
        assert response.status_code == 400
        data = response.get_json()
        assert data["message"] == "failure"
