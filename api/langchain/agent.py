# flake8: noqa
import logging
import os
import random
from typing import Any, Dict, Generator, List, Optional, Tuple

import pandas as pd
from dotenv import load_dotenv
from portkey_ai import createHeaders

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
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel

from ..tools.source_scraper import scraping_websource
from ..utils import load_property
from .memory import MemoryRetriever
from .pydantic import (
    AttributeProperties,
    CandidateExplanation,
    Ontology,
    RelatedSources,
)

logger = logging.getLogger("bdiviz_flask.sub")


class Agent:
    def __init__(
        self,
        memory_retriever: MemoryRetriever,
        llm_model: Optional[BaseChatModel] = None,
        retries: int = 3,
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

    **CRITERIA FOR MATCHING ATTRIBUTES:**
    1. Attribute names and values do not need to be identical.
    2. Ignore case, special characters, and spaces.
    3. Attributes should be considered a match if they are semantically similar, their datatype and values are comparable, or if the units are convertible.
    4. Approach the task with the mindset of a biomedical expert.
            """,
        ]

        self.retries = retries

    @property
    def llm(self):
        # Lazy initialization of LLM to save resources
        if self._llm is None:
            if self._llm_model is not None:
                self._llm = self._llm_model
            else:
                self._llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        return self._llm

    def explain(
        self, candidate: Dict[str, Any], with_memory=True
    ) -> CandidateExplanation:
        logger.info(f"[Agent] Explaining the candidate...")

        if self.store.get_namespace_count("user_memory") <= 0:
            with_memory = False

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
    """

        instructions_with_memory = """
    **Tools you can use:**
    - `recall_memory`: Recall the history of matches, mismatches, and explanations.
    - `search_false_negatives`: Search for false negatives in the memory.
    - `search_false_positives`: Search for false positives in the memory.
    - `search_mismatches`: Search for mismatches in the memory.
    - `search_matches`: Search for matches in the memory.

    1. Provide up to four possible explanations that justify whether the attributes are a match or not. Reference the historical matches, mismatches, and explanations where relevant.
    2. If the values are convertable, provide possible convertion methods in your explanation.
    3. Conclude if the current candidate is a valid match based on:
        a. Your explanations,
        b. Similarity between the attribute names,
        c. Consistency of the sample values, and descriptions provided,
        d. The history of false positives and negatives,
        e. The context from `recall_memory`.
        f. The history of false positives and negatives (where the user and agent disagree), matches and mismatches.
    4. Include any additional context or keywords that might support or contradict the current mapping.
    """

        instructions_without_memory = """
    **Tools you can use:**
    - `search_false_negatives`: Search for false negatives in the memory.
    - `search_false_positives`: Search for false positives in the memory.
    - `search_mismatches`: Search for mismatches in the memory.
    - `search_matches`: Search for matches in the memory.

    1. Provide up to four possible explanations that justify whether the attributes are a match or not. Reference the historical matches, mismatches, and explanations where relevant.
    2. If the values are convertable, provide possible convertion methods in your explanation.
    3. Conclude if the current candidate is a valid match based on:
        a. Your explanations,
        b. Similarity between the attribute names,
        c. Consistency of the sample values, and descriptions provided,
        d. The history of false positives and negatives (where the user and agent disagree), matches and mismatches.
    4. Include any additional context or keywords that might support or contradict the current mapping.
    """

        prompt += (
            instructions_with_memory if with_memory else instructions_without_memory
        )

        tools = self.store.get_validation_tools(with_memory)
        logger.info(f"[EXPLAIN] Prompt: {prompt}")
        response = self.invoke(
            prompt=prompt,
            tools=tools,
            output_structure=CandidateExplanation,
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
    Analyze the DataFrame preview below to create an ontology for each column.

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

    def stream_infer_ontology(
        self, target_df: pd.DataFrame
    ) -> Generator[Tuple[List[str], Ontology], None, None]:
        """
        Streams ontology inference with a two-phase workflow:
        1. First generates high-level structure (categories and nodes) for all columns
        2. Then generates detailed attributes for each batch
        Each yield is a tuple (column_slice, ontology_dict).
        """

        pd.set_option("display.max_columns", None)
        columns = target_df.columns.tolist()
        pd.reset_option("display.max_columns")

        # Phase 1: Generate high-level ontology structure for all columns
        structure_prompt = f"""
Directly return the JSON in the exact schema described below. 
No extra text before or after the JSON.

The output should be formatted as a JSON instance that conforms to the JSON example below.
Here is the output example:
{{
    "column1": {{"category": "category1", "node": "node1"}},
    "column2": {{"category": "category1", "node": "node2"}}
}}

Analyze all column names from a DataFrame and create a high-level ontology structure.

All Column Names: {columns}

Task:
Create a high-level ontology structure that organizes ALL columns into:
- At most 3 categories (grandparent level)
- At most 10 nodes (parent level)

For each column, determine:
- Which category it belongs to
- Which node within that category it belongs to

Important:
- Keep category and node names concise (max 10 characters if possible)
- Group semantically related columns together
- Return a simple mapping structure showing column -> category -> node relationships
- Focus only on categorization, not detailed attributes
"""

        # Get high-level structure first
        agent_executor = create_react_agent(self.llm, tools=[])
        structure_responses = []
        for chunk in agent_executor.stream(
            {
                "messages": [
                    SystemMessage(
                        content="You are a helpful assistant that creates ontology structures."
                    ),
                    HumanMessage(content=structure_prompt),
                ]
            },
            {"configurable": {"thread_id": "bdiviz-1"}},
        ):
            structure_responses.append(chunk)

        # Parse the structure response
        structure_response = structure_responses[-1]["agent"]["messages"][0].content
        # Extract JSON from the response (assuming it's in the response)
        import json
        import re

        try:
            # Clean the response to extract just the JSON content
            # Remove any prefix like "Assistant" and extract content between ```json and ```
            json_match = re.search(
                r"```json\s*\n(.*?)\n```", structure_response, re.DOTALL
            )
            if json_match:
                json_content = json_match.group(1).strip()
            else:
                # If no markdown blocks, try to find JSON-like content
                # Look for content between { and } (handle nested braces)
                json_match = re.search(r"(\{.*\})", structure_response, re.DOTALL)
                if json_match:
                    json_content = json_match.group(1).strip()
                else:
                    json_content = structure_response.strip()

            structure_data = json.loads(json_content)
        except (json.JSONDecodeError, AttributeError) as e:
            # Fallback to basic categorization if parsing fails
            logger.critical(f"[INFER-ONTOLOGY] JSON parsing error: {e}")
            structure_data = {
                col: {"category": "data", "node": "general"} for col in columns
            }

        # Phase 2: Generate detailed attributes for each batch using the structure
        for idx in range(0, len(columns), 5):
            if idx + 5 > len(columns):
                column_slice = columns[idx:]
            else:
                column_slice = columns[idx : idx + 5]
            col_data = target_df[column_slice]

            # Build detailed prompt using the structure
            batch_structure = {
                col: structure_data.get(col, {"category": "data", "node": "general"})
                for col in column_slice
            }

            # Only filters the unique non-null values, and concat into a df
            df_new = pd.DataFrame()
            for col in column_slice:
                unique_values = list(col_data[col].dropna().unique())
                if len(unique_values) < 5:
                    unique_values.extend(["NaN"] * (5 - len(unique_values)))
                df_new[col] = unique_values[:5]

            prompt = f"""
Analyze the following columns from a DataFrame and create detailed ontology descriptions.

Column Names: {column_slice}
Sample Values: {df_new.to_string()}

High-level Structure (use this as node and category for each column):
{batch_structure}

Task:
Create an Ontology object for the columns with the following information:
- properties: List of AttributeProperties objects for each column

Important:
- Use the provided category and node assignments from the structure
- For "enum" types, include all observed values plus likely additional values
- Return ONLY a valid JSON object following the Ontology schema with no additional text
"""
            response = self.invoke(
                prompt=prompt,
                tools=[],
                output_structure=Ontology,
            )

            yield (column_slice, response)

    def _remember_false_positive(self, candidate: Dict[str, Any]) -> None:
        logger.info(f"🧠Memory: Remembering the false positive...")
        self.store.put_false_positive(candidate)

    def _remember_false_negative(self, candidate: Dict[str, Any]) -> None:
        logger.info(f"🧠Memory: Remembering the false negative...")
        self.store.put_false_negative(candidate)

    def _remember_match(self, candidate: Dict[str, Any]) -> None:
        logger.info(f"🧠Memory: Remembering the match...")
        self.store.put_match(candidate)

    def _remember_mismatch(self, candidate: Dict[str, Any]) -> None:
        logger.info(f"🧠Memory: Remembering the mismatch...")
        self.store.put_mismatch(candidate)

    def _forget_match(self, candidate: Dict[str, Any]) -> None:
        logger.info(f"🧠Memory: Forgetting the match...")
        self.store.delete_match(candidate)

    def _forget_mismatch(self, candidate: Dict[str, Any]) -> None:
        logger.info(f"🧠Memory: Forgetting the mismatch...")
        self.store.delete_mismatch(candidate)

    def _forget_false_positive(self, candidate: Dict[str, Any]) -> None:
        logger.info(f"🧠Memory: Forgetting the false positive...")
        self.store.delete_false_positive(candidate)

    def _forget_false_negative(self, candidate: Dict[str, Any]) -> None:
        logger.info(f"🧠Memory: Forgetting the false negative...")
        self.store.delete_false_negative(candidate)

    def handle_user_operation(
        self, operation: str, candidate: Dict[str, Any], is_match_to_agent: bool
    ) -> None:
        if operation == "accept":
            if is_match_to_agent:
                self._remember_match(candidate)
            else:
                self._remember_false_negative(candidate)
        elif operation == "reject":
            if is_match_to_agent:
                self._remember_false_positive(candidate)
            else:
                self._remember_mismatch(candidate)

    def handle_undo_operation(
        self, operation: str, candidate: Dict[str, Any], is_match_to_agent: bool
    ) -> None:
        if operation == "accept":
            if is_match_to_agent:
                self._forget_match(candidate)
            else:
                self._forget_false_negative(candidate)
        elif operation == "reject":
            if is_match_to_agent:
                self._forget_false_positive(candidate)
            else:
                self._forget_mismatch(candidate)

    def remember_explanation(
        self, explanations: List[Dict[str, Any]], user_operation: Dict[str, Any]
    ) -> None:
        logger.info(f"🧠Memory: Remembering the explanation...")
        self.store.put_explanation(explanations, user_operation)

    def remember_candidates(self, candidates: List[Dict[str, Any]]) -> None:
        logger.info(f"🧠Memory: Remembering the candidates...")
        for candidate in candidates:
            self.store.put_candidate(candidate)

    def remember_ontology(self, ontology: Dict[str, AttributeProperties]) -> None:
        logger.info(f"🧠Memory: Remembering the ontology...")
        for _, property in ontology.items():
            self.store.put_target_schema(property)
        logger.info(f"🧠Memory: Ontology remembered!")

    def invoke(
        self, prompt: str, tools: List, output_structure: BaseModel
    ) -> BaseModel:
        output_parser = PydanticOutputParser(pydantic_object=output_structure)
        prompt = self.generate_prompt(prompt, output_parser)
        agent_executor = create_react_agent(self.llm, tools, store=self.store)

        last_exception = None
        for attempt in range(self.retries):
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
            try:
                response = output_parser.parse(final_response)
                return response
            except Exception as e:
                logger.critical(
                    f"[AGENT] Error parsing response (attempt {attempt+1}/{self.retries}): {e}, retrying..."
                )
                last_exception = e
                continue
        # If all retries fail, raise the last error
        raise RuntimeError(
            f"Failed to parse agent response after {self.retries} attempts. Last error: {last_exception}"
        )

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
        llm_provider = os.getenv("LLM_PROVIDER", "portkey")
        docker_env = os.getenv("DOCKER_ENV", "local")
        if llm_provider == "portkey":
            portkey_headers = createHeaders(
                api_key=os.getenv("PORTKEY_API_KEY"),  # Here is my portkey api key
                virtual_key=os.getenv("PROVIDER_API_KEY"),  # gemini-vertexai-cabcb6
                metadata={"_user": "yfw215"},
            )
            llm_model = ChatOpenAI(
                model="gemini-2.5-flash",
                temperature=0,
                # If env var is set to "hsrn" use https://portkey-lb.rt.nyu.edu/v1/, else use https://ai-gateway.apps.cloud.rt.nyu.edu/v1/
                base_url=(
                    "https://portkey-lb.rt.nyu.edu/v1/"
                    if docker_env == "hsrn"
                    else "https://ai-gateway.apps.cloud.rt.nyu.edu/v1/"
                ),
                default_headers=portkey_headers,
                timeout=1000,
                max_retries=3,
            )
        elif llm_provider == "openai":
            llm_model = ChatOpenAI(model="gpt-4.1-mini", temperature=0)
        else:
            raise ValueError(f"Invalid LLM provider: {llm_provider}")
        AGENT = Agent(memory_retriever, llm_model=llm_model)
    return AGENT
