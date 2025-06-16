import logging
import random
from typing import Any, Dict, Generator, List, Optional

import pandas as pd
from dotenv import load_dotenv

# Only set pandas display options when needed, not at module level
# pd.set_option("display.max_columns", None)


load_dotenv()
from langchain.output_parsers import PydanticOutputParser

# from langchain_anthropic import ChatAnthropic
# from langchain_ollama import ChatOllama
# from langchain_together import ChatTogether
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel

from ..tools.candidate_butler import CandidateButler
from ..tools.rag_researcher import retrieve_from_rag
from ..tools.source_scraper import scraping_websource
from ..utils import load_gdc_property, load_property
from .memory import MemoryRetriver
from .pydantic import (
    ActionResponse,
    AgentResponse,
    AgentSuggestions,
    AttributeProperties,
    CandidateExplanation,
    Ontology,
    RelatedSources,
    SearchResponse,
)

logger = logging.getLogger("bdiviz_flask.sub")


class Agent:
    def __init__(
        self,
        memory_retriever: MemoryRetriver,
        llm_model: Optional[BaseChatModel] = None,
    ) -> None:
        # OR claude-3-5-sonnet-20240620
        # self.llm = ChatAnthropic(model="claude-3-5-sonnet-latest")
        # self.llm = ChatOllama(base_url='https://ollama-asr498.users.hsrn.nyu.edu', model='llama3.1:8b-instruct-fp16', temperature=0.2)
        # self.llm = ChatOllama(model="deepseek-r1:1.5b", temperature=0.2)
        # self.llm = ChatTogether(model="meta-llama/Llama-3.3-70B-Instruct-Turbo")

        # Lazy initialization of LLM
        self._llm = None
        self._llm_model = llm_model

        self.agent_config = {"configurable": {"thread_id": "bdiviz-1"}}

        # self.memory = MemorySaver()
        self.store = memory_retriever

        self.system_messages = [
            """
    You are an assistant for BDI-Viz, a heatmap visualization tool designed for schema matching.
    Your role is to assist with schema matching operations and provide responses in a strict JSON schema format.
    Do not include any reasoning, apologies, or explanations in your responses.

    **Criteria for matching attributes:**
    1. Attribute names and values do not need to be identical.
    2. Ignore case, special characters, and spaces.
    3. Attributes should be considered a match if they are semantically similar and their datatype and values are comparable.
    4. Approach the task with the mindset of a biomedical expert.
            """,
        ]

    @property
    def llm(self):
        # Lazy initialization of LLM to save resources
        if self._llm is None:
            if self._llm_model is not None:
                self._llm = self._llm_model
            else:
                self._llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        return self._llm

    def search(self, query: str) -> SearchResponse:
        logger.info(f"[Agent] Searching for candidates...")

        tools = [
            self.store.query_candidates_tool,
        ]

        prompt = f"""
    Use the tools to search for candidates based on the user's input.

    User Query: {query}
        """

        logger.info(f"[SEARCH] Prompt: {prompt}")

        response = self.invoke(
            prompt=prompt,
            tools=tools,
            output_structure=SearchResponse,
        )

        return response

    def explain(self, candidate: Dict[str, Any]) -> CandidateExplanation:
        logger.info(f"[Agent] Explaining the candidate...")
        # logger.info(f"{diagnose}")

        # search for related false negative / false positive candidates
        related_matches = self.store.search_matches(candidate["sourceColumn"], limit=3)
        related_mismatches = self.store.search_mismatches(
            f"{candidate['sourceColumn']}::{candidate['targetColumn']}", limit=3
        )

        # search for related explanations
        related_explanations = self.store.search_explanations(
            f"{candidate['sourceColumn']}::{candidate['targetColumn']}", limit=3
        )

        target_description = load_property(candidate["targetColumn"])
        target_values = candidate["targetValues"]
        if "enum" in target_description:
            target_enum = target_description["enum"]
            if target_enum is not None:
                if len(target_enum) >= 50:
                    # Sample random 50 values
                    target_enum = random.sample(target_enum, 50)
                target_values = target_enum
        if target_description is not None:
            target_description = target_description["description"]
            if not isinstance(target_description, str):
                if len(target_description) >= 1:
                    target_description = target_description[0]["description"]

        prompt = f"""
    Analyze the following user operation details:

    - Source Attribute: {candidate["sourceColumn"]}
    - Target Attribute: {candidate["targetColumn"]}
    - Source Sample Values: {candidate["sourceValues"]}
    - Target Sample Values: {target_values}
    - Target Description: {target_description}

    Historical Data:
    - Related Matches: {related_matches}
    - Related Mismatches: {related_mismatches}
    - Related Explanations: {related_explanations}

    Instructions:
    1. Review the operation details alongside the historical data.
    2. Provide up to four possible explanations that justify whether the attributes are a match or not. Reference the historical matches, mismatches, and explanations where relevant.
    3. Conclude if the current candidate is a valid match based on:
        a. Your explanations,
        b. Similarity between the attribute names,
        c. Consistency of the sample values, and descriptions provide
        d. The history of false positives and negatives.
    4. Include any additional context or keywords that might support or contradict the current mapping.
        """
        logger.info(f"[EXPLAIN] Prompt: {prompt}")
        response = self.invoke(
            prompt=prompt,
            tools=[],
            output_structure=CandidateExplanation,
        )
        return response

    def explore_candidates(
        self, session: str, candidate: Dict[str, Any], query: str
    ) -> AgentResponse:
        source_attribute = candidate["sourceColumn"]
        logger.info(
            f"[Agent] Exploring candidates for {source_attribute} with query: {query}"
        )
        candidate_butler = CandidateButler(session)

        tools = [
            # Manipulate the existing candidates
            candidate_butler.read_candidates_tool,
            candidate_butler.update_candidates_tool,
            candidate_butler.prune_candidates_tool,
            candidate_butler.append_candidates_tool,
            # Search within the target ontology
            self.store.search_ontology_tool,
        ]

        prompt = f"""
        Analyze the user's query and perform the appropriate actions using the available tools.
        
        Source Attribute: {source_attribute}
        User Query: {query}
        
        Instructions:
        1. If the user wants to filter, discard, or remove candidates:
           - Use read_candidates to retrieve current candidates
           - Filter based on user criteria
           - Pass the filtered list to update_candidates to save the filtered list
        
        2. If the user wants to explore or find new matches:
           - Use search_ontology to find relevant target attributes
           - Consider domain-specific terminology (like AJCC, FIGO, etc.)
           - Pass the candidates list found by search_ontology to append_candidates
        
        3. If the user wants information about specific terminology:
           - Use search_ontology to find related attributes and their descriptions
        
        Respond under AgentResponse schema:
        - status: success or failure
        - tool_uses: the tool(s) used
        - response: the response to the user's query
        - candidates: the candidates found, empty if you did not manipulate the candidates list
        - terminologies: the terminologies found, empty if you did not search the ontology
        """

        logger.info(f"[EXPLORE] Prompt: {prompt}")
        response = self.invoke(
            prompt=prompt,
            tools=tools,
            output_structure=AgentResponse,
        )
        return response

    def make_suggestion(
        self, explanations: List[Dict[str, Any]], user_operation: Dict[str, Any]
    ) -> AgentSuggestions:
        """
        Generate suggestions based on the user operation and diagnosis.

        Args:
            explanations (List[Dict[str, Any]]): A list of explanations to consider.
                [
                    {
                        'type': ExplanationType;
                        'content': string;
                        'confidence': number;
                    },
                    ...
                ]
            user_operation (Dict[str, Any]): The user operation to consider.
        """
        logger.info(f"[Agent] Making suggestion to the agent...")
        # logger.info(f"{diagnosis}")

        explanations_str = "\n".join(
            f"\tDiagnosis: {explanation['content']}, Confidence: {explanation['confidence']}"
            for explanation in explanations
        )
        user_operation_str = f"""
Operation: {user_operation["operation"]}
Candidate: {user_operation["candidate"]}
        """

        prompt = f"""
User Operation:
{user_operation_str}

Diagnosis:
{explanations_str}

**Instructions**:
    1. Generate 2-3 suggestions based on the user operation and diagnosis:
        - **undo**: Undo the last action if it seems incorrect.
        - **prune_candidates**: Suggest pruning candidates based on RAG expertise.
        - **update_embedder**: Recommend a more accurate model if matchings seem wrong.
    2. Provide a brief explanation for each suggestion.
    3. Include a confidence score for each suggestion.
        """

        logger.info(f"[SUGGESTION] Prompt: {prompt}")

        response = self.invoke(
            prompt=prompt,
            tools=[],
            output_structure=AgentSuggestions,
        )

        return response

    def search_for_sources(self, candidate: Dict[str, Any]) -> RelatedSources:
        logger.info(f"[Agent] Searching for sources...")

        tools = [
            scraping_websource,
        ]

        prompt = f"""
    Use the tools to search for related sources based on the candidate details.

    Candidate:
    - Source Column: {candidate["sourceColumn"]}
    - Target Column: {candidate["targetColumn"]}
    - Source Sample Values: {candidate["sourceValues"]}
    - Target Sample Values: {candidate["targetValues"]}
        """

        logger.info(f"[SEARCH-SOURCES] Prompt: {prompt}")

        response = self.invoke(
            prompt=prompt,
            tools=tools,
            output_structure=RelatedSources,
        )

        return response

    def infer_ontology(self, target_df: pd.DataFrame) -> Ontology:
        logger.info(f"[Agent] Inferring ontology...")

        # Set pandas display options only when needed
        pd.set_option("display.max_columns", None)
        df_preview = target_df.head().to_string()
        # Reset to default to save memory
        pd.reset_option("display.max_columns")

        prompt = f"""
    Analyze the target DataFrame preview below to create an ontology for each column.

    DataFrame Preview:
    {df_preview}

    Task:
    Create an AttributeProperties object for EACH column with the following information:
    - column_name: The exact name of the column
    - category: Group columns into at most 3 high-level categories (grandparent level)
    - node: Group columns into at most 10 mid-level nodes (parent level)
    - type: Classify as "enum" (categorical), "number", "string", "boolean", or "other"
    - description: A clear description of what the column represents
    - enum: For categorical columns, list observed and inferred possible values
    - maximum/minimum: For numerical columns, provide range constraints if applicable

    Important:
    - Organize columns into NO MORE THAN 3 categories and 10 nodes total
    - For "enum" types, include all observed values plus likely additional values
    - Return ONLY a valid JSON object following the Ontology schema with no additional text
    """

        logger.info(f"[INFER-ONTOLOGY] Prompt: {prompt}")
        response = self.invoke(
            prompt=prompt,
            tools=[],
            output_structure=Ontology,
        )
        return response

    def apply(
        self, session: str, action: Dict[str, Any], previous_operation: Dict[str, Any]
    ) -> Optional[ActionResponse]:
        user_operation = previous_operation["operation"]
        candidate = previous_operation["candidate"]
        # references = previous_operation["references"]

        candidate_butler = CandidateButler(session)

        source_cluster = candidate_butler.read_source_cluster_details(
            candidate["sourceColumn"]
        )

        logger.info(f"[Agent] Applying the action: {action}")

        if action["action"] == "prune_candidates":
            tools = candidate_butler.get_toolset() + [retrieve_from_rag]
            prompt = f"""
You have access to the user's previous operations and the related source column clusters. 
Your goal is to help prune (remove) certain candidate mappings in the related source columns based on the user's decisions following the instructions below.

**Previous User Operation**:
Operation: {user_operation}
Candidate: {candidate}

**Related Source Columns and Their Candidates**:
{source_cluster}

**Instructions**:
1. Identify **Related Source Columns and Their Candidates**.
2. Consult Domain Knowledge (using **retrieve_from_rag**) if any clarifications are needed.
3. Decide Which Candidates to Prune based on your understanding and the user's previous operations, then compile the candidates after pruning into a **dictionary** like this:
    [
        {{"sourceColumn": "source_column_1", "targetColumn": "target_column_1", "score": 0.9, "matcher": "magneto_zs_bp"}},
        {{"sourceColumn": "source_column_1", "targetColumn": "target_column_15", "score": 0.7, "matcher": "magneto_zs_bp"}},
        ...
    ]
4. Call **update_candidates** with this updated dictionary as the parameter to refine the heatmap.
                """

            logger.info(f"[ACTION-PRUNE] Prompt: {prompt}")
            response = self.invoke(
                prompt=prompt,
                tools=tools,
                output_structure=ActionResponse,
            )
            return response

        elif action["action"] == "undo":
            return ActionResponse(
                status="success",
                response="Action successfully undone.",
                action="undo",
            )
        else:
            logger.info(f"[Agent] Applying the action: {action}")
            return

    def remember_fp(self, candidate: Dict[str, Any]) -> None:
        logger.info(f"[Agent] Remembering the false positive...")
        self.store.put_mismatch(candidate)

    def remember_fn(self, candidate: Dict[str, Any]) -> None:
        logger.info(f"[Agent] Remembering the false negative...")
        self.store.put_match(candidate)

    def remember_explanation(
        self, explanations: List[Dict[str, Any]], user_operation: Dict[str, Any]
    ) -> None:
        logger.info(f"[Agent] Remembering the explanation...")
        self.store.put_explanation(explanations, user_operation)

    def remember_candidates(self, candidates: List[Dict[str, Any]]) -> None:
        logger.info(f"[Agent] Remembering the candidates...")
        for candidate in candidates:
            self.store.put_candidate(candidate)

    def remember_ontology(self, ontology: Dict[str, AttributeProperties]) -> None:
        logger.info(f"[Agent] Remembering the ontology...")
        for _, property in ontology.items():
            self.store.put_target_schema(property)
        logger.info(f"[Agent] Ontology remembered!")

    def invoke(
        self, prompt: str, tools: List, output_structure: BaseModel
    ) -> BaseModel:
        output_parser = PydanticOutputParser(pydantic_object=output_structure)

        prompt = self.generate_prompt(prompt, output_parser)
        agent_executor = create_react_agent(
            self.llm, tools, store=self.store
        )  # checkpointer=self.memory

        responses = []
        for chunk in agent_executor.stream(
            {
                "messages": [
                    SystemMessage(content=self.system_messages[0]),
                    HumanMessage(content=prompt),
                ]
            },
            self.agent_config,
        ):
            logger.info(chunk)
            logger.info("----")
            responses.append(chunk)

        final_response = responses[-1]["agent"]["messages"][0].content
        response = output_parser.parse(final_response)

        return response

    def invoke_system(self, prompt: str) -> Generator[AIMessage, None, None]:
        agent_executor = create_react_agent(self.llm, store=self.store)
        for chunk in agent_executor.stream(
            {"messages": [SystemMessage(content=prompt)]}, self.agent_config
        ):
            logger.info(chunk)
            yield chunk

    def bind_tools(self, tools: List, tool_choice: Optional[str] = None) -> None:
        if tool_choice is not None:
            return self.llm.bind_tools(tools, tool_choice=tool_choice)
        else:
            logger.info(f"[Agent] Binding tools to the agent...")
            return self.llm.bind_tools(tools)

    def generate_prompt(self, prompt: str, output_parser: PydanticOutputParser) -> str:
        instructions = output_parser.get_format_instructions()
        template = f"""
Directly return the JSON in the exact schema described below. 
No extra text before or after the JSON.

{instructions}

Prompt: {prompt}
"""
        return template


# Lazy initialization of the global agent
AGENT = None


def get_agent(memory_retriever):
    global AGENT
    if AGENT is None:
        AGENT = Agent(memory_retriever)
    return AGENT
