# BDI-Viz API Tests

This directory contains unit tests for the BDI-Viz backend API.

## Test Structure

- `conftest.py`: pytest configuration and fixtures
- `test_memory.py`: Tests for memory retrieval functionality
- `test_matching.py`: Tests for matching task functionality
- `test_api_endpoints.py`: Tests for API endpoints
- `pytest.ini`: pytest configuration file
- `requirements.txt`: Test dependencies

## Test Coverage

### Memory Tests (`test_memory.py`)
- Memory retriever initialization
- Namespace clearing functionality
- Schema and candidate storage
- User memory management
- Search functionality

### Matching Tests (`test_matching.py`)
- Matching task execution
- Ontology inference
- File handling
- Error handling
- Memory clearing on task start

### API Endpoint Tests (`test_api_endpoints.py`)
- All major API endpoints
- Request/response handling
- Authentication and session management
- File upload handling
- Error responses

## Running Tests

### Prerequisites
Install test dependencies:
```bash
pip install -r requirements.txt
```

### Run all tests:
```bash
pytest
```

### Run specific test file:
```bash
pytest test_memory.py
pytest test_matching.py
pytest test_api_endpoints.py
```

### Run with coverage:
```bash
pytest --cov=api
```

### Run specific test:
```bash
pytest test_memory.py::TestMemoryRetriever::test_init
```

## Test Features

### Mocking
- All external dependencies are mocked
- ChromaDB client is mocked for isolation
- Flask app is configured for testing
- Celery tasks are mocked for synchronous testing

### Fixtures
- `app`: Flask application instance
- `client`: Test client for API requests
- `mock_memory`: Mocked memory retriever
- `mock_session_manager`: Mocked session manager
- `mock_celery_task`: Mocked Celery tasks

### Test Data
- Sample CSV data for testing
- Mock ontology data
- Mock matching results

## Best Practices

1. **Isolation**: Each test is isolated with proper mocking
2. **Comprehensive**: Tests cover happy paths and error cases
3. **Fast**: All external dependencies are mocked
4. **Maintainable**: Clear test structure and naming
5. **Reliable**: Tests are deterministic and repeatable

## Adding New Tests

1. Create test functions following the `test_*` naming convention
2. Use appropriate fixtures for dependencies
3. Mock external services and databases
4. Test both success and error scenarios
5. Add appropriate assertions for expected behavior

## Common Test Patterns

### API Endpoint Testing
```python
def test_endpoint(self, client, mock_session_manager):
    response = client.post('/api/endpoint', 
                          data=json.dumps(test_data),
                          content_type='application/json')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'success'
```

### Memory Testing
```python
def test_memory_function(self, mock_memory):
    mock_memory.some_method.return_value = expected_result
    result = function_under_test()
    assert result == expected_result
    mock_memory.some_method.assert_called_once()
```

### Exception Testing
```python
def test_error_handling(self, mock_dependency):
    mock_dependency.side_effect = Exception("Test error")
    result = function_under_test()
    assert result['status'] == 'failed'
    assert 'Test error' in result['message']
``` 