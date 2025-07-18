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
