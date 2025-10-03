from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest

from api.langchain.agent import Agent, AIMessage
from api.langchain.pydantic import (
    AttributeProperties,
    CandidateExplanation,
    Ontology,
    RelatedSources,
)

mock_candidate = {
    "sourceColumn": "age",
    "targetColumn": "age",
    "sourceValues": [70, 83],
    "targetValues": [70, 83],
}


def mock_candidate_explanation() -> CandidateExplanation:
    return CandidateExplanation(
        explanations=[
            {
                "title": "Test",
                "type": "semantic",
                "reason": "Test reason",
                "reference": None,
                "confidence": 1.0,
                "is_match": True,
            }
        ],
        is_match=True,
        relevant_knowledge=[],
    )


def mock_user_operation() -> Dict[str, Any]:
    return {
        "operation": "accept",
        "candidate": mock_candidate,
        "is_match_to_agent": True,
    }


def mock_related_sources() -> RelatedSources:
    return RelatedSources(sources=[])


def mock_infer_ontology_high_level() -> Dict[str, Dict[str, str]]:
    return {
        "age": {"category": "clinical", "node": "demographic"},
        "gender": {"category": "clinical", "node": "demographic"},
    }


def mock_infer_ontology_low_level() -> Ontology:
    return Ontology(
        properties=[
            AttributeProperties(
                column_name="age",
                category="clinical",
                node="demographic",
                type="integer",
                description="The patient's age",
                enum=None,
                maximum=None,
                minimum=None,
            ),
            AttributeProperties(
                column_name="gender",
                category="clinical",
                node="demographic",
                type="string",
                description="The patient's gender",
                enum=None,
                maximum=None,
                minimum=None,
            ),
        ]
    )


@pytest.fixture
def agent(mock_memory_retriever):
    # Patch create_react_agent globally for tests that use Agent.invoke
    with patch("api.langchain.agent.create_react_agent") as mock_create_agent:
        mock_executor = MagicMock()
        # For .stream(), yield a dict with the expected structure
        mock_executor.stream.return_value = iter(
            [
                {
                    "agent": {
                        "messages": [
                            {
                                "content": (
                                    '{"explanations": [{"title": "Test", '
                                    '"type": "semantic", "reason": '
                                    '"Test reason", "reference": null, '
                                    '"confidence": 1.0, "is_match": true}], '
                                    '"is_match": true, '
                                    '"relevant_knowledge": []}'
                                )
                            }
                        ]
                    }
                }
            ]
        )
        mock_create_agent.return_value = mock_executor
        yield Agent(mock_memory_retriever, llm_model=MagicMock())


class TestAgent:
    """Test the Agent class."""

    def test_explain(self, agent):
        with patch.object(agent, "invoke", return_value=mock_candidate_explanation()):
            result = agent.explain(mock_candidate)
            assert isinstance(result, CandidateExplanation)
            assert result.is_match is True

    def test_search_for_sources(self, agent):
        with patch.object(agent, "invoke", return_value=mock_related_sources()):
            result = agent.search_for_sources(mock_candidate)
            assert isinstance(result, RelatedSources)

    def test_infer_ontology(self, agent, sample_source_csv):
        # Patch create_react_agent so the high-level structure stream
        # returns our mocked mapping
        with patch("api.langchain.agent.create_react_agent") as mock_create_agent:
            mock_executor = MagicMock()
            # First call: structure response for high-level mapping
            mock_executor.stream.side_effect = [
                iter(
                    [
                        {
                            "agent": {
                                "messages": [
                                    AIMessage(
                                        content=(
                                            '{"age": {"category": "clinical", '
                                            '"node": "demographic"}, '
                                            '"gender": {"category": '
                                            '"clinical", "node": '
                                            '"demographic"}}'
                                        )
                                    )
                                ]
                            }
                        }
                    ]
                ),
            ]
            mock_create_agent.return_value = mock_executor

            # Patch low-level generation per batch
            with patch.object(
                agent, "invoke", return_value=mock_infer_ontology_low_level()
            ):
                results = list(agent.infer_ontology(sample_source_csv))
                assert isinstance(results, list)
                assert len(results) >= 1
                # Validate the first yielded ontology
                first_slice, first_ontology = results[0]
                assert isinstance(first_slice, list)
                assert isinstance(first_ontology, Ontology)
                assert first_ontology.properties[0].column_name in {
                    "age",
                    "gender",
                }

    def test_handle_operations(self, agent):
        # matches
        agent.handle_user_operation(
            operation="accept", candidate=mock_candidate, is_match_to_agent=True
        )
        assert agent.store.get_namespace_count("matches") == 1

        agent.handle_undo_operation(
            operation="accept", candidate=mock_candidate, is_match_to_agent=True
        )
        assert agent.store.get_namespace_count("matches") == 0
        agent.store.reset_memory()

        # false negatives
        agent.handle_user_operation(
            operation="accept", candidate=mock_candidate, is_match_to_agent=False
        )
        assert agent.store.get_namespace_count("false_negatives") == 1

        agent.handle_undo_operation(
            operation="accept", candidate=mock_candidate, is_match_to_agent=False
        )
        assert agent.store.get_namespace_count("false_negatives") == 0
        agent.store.reset_memory()

        # false positives
        agent.handle_user_operation(
            operation="reject", candidate=mock_candidate, is_match_to_agent=True
        )
        assert agent.store.get_namespace_count("false_positives") == 1

        agent.handle_undo_operation(
            operation="reject", candidate=mock_candidate, is_match_to_agent=True
        )
        assert agent.store.get_namespace_count("false_positives") == 0
        agent.store.reset_memory()

        # mismatches
        agent.handle_user_operation(
            operation="reject", candidate=mock_candidate, is_match_to_agent=False
        )
        assert agent.store.get_namespace_count("mismatches") == 1

        agent.handle_undo_operation(
            operation="reject", candidate=mock_candidate, is_match_to_agent=False
        )
        assert agent.store.get_namespace_count("mismatches") == 0
        agent.store.reset_memory()

    def test_remember_explanation(self, agent):
        agent.remember_explanation(
            explanations=mock_candidate_explanation().model_dump()["explanations"],
            user_operation=mock_user_operation(),
        )
        assert agent.store.get_namespace_count("explanations") == 1
        agent.store.reset_memory()

    def test_remember_ontology(self, agent):
        ontology = {
            "age": {
                "column_name": "age",
                "category": "clinical",
                "node": "demographic",
                "type": "integer",
                "description": "The patient's age",
            },
            "gender": {
                "column_name": "gender",
                "category": "clinical",
                "node": "demographic",
                "type": "string",
                "description": "The patient's gender",
            },
        }
        agent.remember_ontology(ontology=ontology)
        # MemoryRetriever stores schema in the 'schema' namespace
        assert agent.store.get_namespace_count("schema") == 2
        agent.store.reset_memory()
