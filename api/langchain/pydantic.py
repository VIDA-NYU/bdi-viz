from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


class CandidateObject(BaseModel):
    """Object for single candidate match or mismatch."""

    sourceColumn: str = Field(description="The source column name")
    targetColumn: str = Field(description="The target column name")
    score: float = Field(description="The score of the candidate")
    # matcher: str = Field(description="The matcher used for the candidate")


class DiagnoseObject(BaseModel):
    """Object for single diagnosing the agent based on user operation."""

    reason: str = Field(description="The reason for the diagnosis")
    confidence: float = Field(description="The confidence of the diagnosis")


class AgentAction(BaseModel):
    action: str = Field(description="""The action for the agent.""")
    reason: str = Field(description="The reason for the action")
    confidence: float = Field(description="The confidence of the action")


class AgentSuggestions(BaseModel):
    actions: List[AgentAction] = Field(
        description="""The agent actions suggected based on the diagnosis user selected."""
    )


class Explanation(BaseModel):
    """A detailed explanation for a candidate's match or mismatch, intended for automated analysis."""

    title: str = Field(
        description="""A concise title for the explanation, e.g. '_site' or '_Code' to differentiate meanings in tumor analysis."""
    )
    type: str = Field(
        description="""The explanation type, chosen from:
- semantic: based on column semantics,
- name: based on column names,
- token: derived from tokens in column names or values,
- value: inferred from column values,
- pattern: based on value patterns,
- history: based on historical data,
- knowledge: using external expert knowledge,
- other: for any other rationale."""
    )
    reason: str = Field(
        description="A precise description of the rationale underpinning the explanation."
    )
    reference: Optional[str] = Field(
        description="Additional reference information, if available."
    )
    confidence: Optional[float] = Field(
        description="A confidence score ranging from 0 (low) to 1 (high) indicating the reliability of the explanation."
    )
    is_match: bool = Field(
        description="Indicates whether the explanation supports a candidate match (True) or not (False)."
    )


class RelevantKnowledge(BaseModel):
    entry: str = Field(
        description="The entry of the relevant knowledge. Example: FIGO, AJCC, UICC"
    )
    description: str = Field(description="The description of the relevant knowledge")


class SearchResponse(BaseModel):
    """Response from the agent search."""

    status: str = Field(description="The status of the response: success or failure")
    candidates: Optional[List[CandidateObject]] = Field(
        description="The searched candidates"
    )
    terminologies: Optional[List[RelevantKnowledge]] = Field(
        description="The terminologies related to the candidates and the search query"
    )


class CandidateExplanation(BaseModel):
    """Explanation for the candidate based on the diagnosis."""

    explanations: List[Explanation] = Field(
        description="List of explanations for the candidate."
    )
    is_match: bool = Field(description="Flag indicating if the candidate is a match")
    relevant_knowledge: List[RelevantKnowledge] = Field(
        description="""Relevant knowledge related to the candidate in RelevantKnowledge format.
        """
    )


class SuggestedValueMappings(BaseModel):
    """Value mappings between source and target values."""

    sourceColumn: str = Field(description="The source column name")
    targetColumn: str = Field(description="The target column name")
    matchingValues: List[List[Union[str, float, int, bool, None]]] = Field(
        description="""Possible matching values between source and target values.
        Example:
        [
            ["ia", "FIGO IA"],
            ["ib", "FIGO IB"],
            ["iia", "FIGO IIA"],
        ]
        """
    )


class ActionResponse(BaseModel):
    status: str = Field(description="The status of the action: success or failure")
    response: str = Field(description="The response from the agent")
    action: str = Field(
        description="""The action on candidates, must be one of:
        prune - prune the target candidates list from the existing candidates.
        replace - replace the target candidates list with the new candidates.
        undo - undo the last action taken by the user.
        """
    )
    target_candidates: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="""The updated candidates for source column(s), the layered dictionary looks like:
        [
            {"sourceColumn": "source_column_1", "targetColumn": "target_column_1", "score": 0.9, "matcher": "magneto_zs_bp"},
            {"sourceColumn": "source_column_1", "targetColumn": "target_column_15", "score": 0.7, "matcher": "magneto_zs_bp"},
            ...
        ]""",
    )


class TargetClusterInfo(BaseModel):
    """Target cluster information from the agent."""

    name: str = Field(description="The name of the target cluster")
    keywords: List[str] = Field(description="The keywords of the target cluster")
    description: str = Field(description="The description of the target cluster")


class TargetClusters(BaseModel):
    """Target clusters from the agent."""

    clusters: List[TargetClusterInfo] = Field(description="The target clusters")


class RelatedSource(BaseModel):
    """Related source from the agent."""

    snippet: str = Field(description="The snippet of the related source")
    title: str = Field(description="The title of the related source")
    link: str = Field(description="The link of the related source")


class RelatedSources(BaseModel):
    """Related sources from the agent."""

    sources: List[RelatedSource] = Field(description="The related sources")


class AttributeProperties(BaseModel):
    """Attribute properties from the agent."""

    column_name: str = Field(description="The name of the column")
    category: str = Field(description="The category of the column, grandparent level")
    node: str = Field(description="The node of the column, parent level")
    type: str = Field(
        description="""The type of the column, e.g.
- enum: categorical value
- number: numerical value
- string: string value
- boolean: boolean value
- other: other types"""
    )
    description: str = Field(description="The description of the column")
    enum: Optional[List[str]] = Field(
        default=None, description="The enum values of the column, if applicable"
    )
    maximum: Optional[Union[float, int]] = Field(
        default=None, description="The maximum value of the column, if applicable"
    )
    minimum: Optional[Union[float, int]] = Field(
        default=None, description="The minimum value of the column, if applicable"
    )


class Ontology(BaseModel):
    """Ontology information from the agent."""

    properties: List[AttributeProperties] = Field(
        description="The properties of the ontology, including column name, category, node, type, description, enum, maximum, minimum"
    )


class AgentResponse(BaseModel):
    """Response from the agent."""

    status: str = Field(description="The status of the response: success or failure")
    tool_uses: Optional[List[str]] = Field(
        default=None,
        description="The tool uses from the agent",
    )
    response: str = Field(description="The response from the agent")
    candidates: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="""The candidates for source column(s), the layered dictionary looks like:
        [
            {"sourceColumn": "source_column_1", "targetColumn": "target_column_1", "score": 0.9, "matcher": "agent", "status": "idle"},
            ...
        ]
        If you did not manipulate the candidates list, candidates will be empty.
        """,
    )
    terminologies: Optional[List[RelevantKnowledge]] = Field(
        default=None,
        description="The terminologies related to the candidates and the search query, try to find as many as possible.",
    )
