from unittest.mock import Mock, patch


class TestMemoryRetriever:
    """Test the MemoryRetriever class."""

    def test_init(self, mock_memory_retriever):
        """Test memory retriever initialization."""
        assert mock_memory_retriever.user_memory_count == 0
        assert mock_memory_retriever.collection is not None

    def test_target_schema(self, mock_memory_retriever):
        """Test target schema."""

        results = mock_memory_retriever.search_target_schema("")
        assert results is None

        mock_memory_retriever.put_target_schema(
            {
                "column_name": "test_column",
                "category": "test_category",
                "node": "test_node",
                "type": "string",
                "description": "Test description",
            }
        )

        results = mock_memory_retriever.search_target_schema("test_column")
        assert len(results) == 1
        assert "test_column" in results[0]
        assert "test_category" in results[0]
        assert "test_node" in results[0]
        assert "string" in results[0]
        assert "Test description" in results[0]

    def test_candidates(self, mock_memory_retriever):
        """Test candidates."""
        results = mock_memory_retriever.search_candidates("")
        assert results is None

        mock_memory_retriever.put_candidate(
            {
                "sourceColumn": "test_source_column",
                "targetColumn": "test_target_column",
                "score": 0.9,
                "matcher": "test_matcher",
            }
        )
        results = mock_memory_retriever.search_candidates("test_source_column")
        assert len(results) == 1
        assert "test_source_column" in results[0]
        assert "test_target_column" in results[0]
        assert "0.9" in results[0]
        assert "test_matcher" in results[0]

    def test_user_memory(self, mock_memory_retriever):
        """Test user memory."""
        results = mock_memory_retriever.search_user_memory("")
        assert results is None

        mock_memory_retriever.put_user_memory("This is a test memory content")
        results = mock_memory_retriever.search_user_memory("test_user_memory")
        assert len(results) == 1
        assert "This is a test memory content" in results[0]

    def test_clear_namespaces(self, mock_memory_retriever):
        """Test clearing specific namespaces."""
        mock_memory_retriever.put_user_memory("This is a test memory content")
        results = mock_memory_retriever.search_user_memory("test_user_memory")
        assert mock_memory_retriever.user_memory_count == 1

        mock_memory_retriever.clear_namespaces(["user_memory"])
        results = mock_memory_retriever.search_user_memory("test_user_memory")
        assert mock_memory_retriever.user_memory_count == 0
        assert results is None
