import logging
import os
from typing import Any, Dict, Generator, List, Optional

from dotenv import load_dotenv

load_dotenv()
from flask.logging import default_handler
from langchain.output_parsers import PydanticOutputParser
from langchain_core.messages import AIMessage, HumanMessage

# from langchain_anthropic import ChatAnthropic
# from langchain_ollama import ChatOllama
# from langchain_together import ChatTogether
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel

from ..tools.candidate_butler import candidate_butler_tools, read_source_cluster_details
from ..tools.rag_researcher import retrieve_from_rag
from .pydantic import ActionResponse, AgentSuggestions, CandidateExplanation

logger = logging.getLogger("bdiviz_flask.sub")


class Agent:
    def __init__(self) -> None:
        # OR claude-3-5-sonnet-20240620
        # self.llm = ChatAnthropic(model="claude-3-5-sonnet-latest")
        # self.llm = ChatOllama(base_url='https://ollama-asr498.users.hsrn.nyu.edu', model='llama3.1:8b-instruct-fp16', temperature=0.2)
        # self.llm = ChatTogether(model="meta-llama/Llama-3.3-70B-Instruct-Turbo")
        self.llm = ChatOpenAI(model="gpt-4o")

        self.memory = MemorySaver()

    def explain(self, candidate: Dict[str, Any]) -> CandidateExplanation:
        logger.info(f"[Agent] Explaining the candidate...")
        # logger.info(f"{diagnose}")
        prompt = f"""
Please diagnose the following user operation:
Source: {candidate["sourceColumn"]}
Target: {candidate["targetColumn"]}
Source Value Sample: {candidate["sourceValues"]}
Target Value Sample: {candidate["targetValues"]}
Please use RAG tool to help you retrieve the relative knowledge.
"""
        logger.info(f"[EXPLAIN] Prompt: {prompt}")
        response = self.invoke(
            prompt=prompt,
            tools=[retrieve_from_rag],
            output_structure=CandidateExplanation,
        )
        return response

    def make_suggestion(
        self, user_operation: Dict[str, Any], diagnosis: Dict[str, float]
    ) -> AgentSuggestions:
        logger.info(f"[Agent] Making suggestion to the agent...")
        # logger.info(f"{diagnosis}")

        diagnosis_str = "\n".join(f"{key}: {value}" for key, value in diagnosis.items())
        user_operation_str = "\n".join(
            f"{key}: {value}" for key, value in user_operation.items()
        )

        prompt = f"""
Based on the following user operation and diagnosis, provide a suggestion:

User Operation:
{user_operation_str}

Diagnosis:
{diagnosis_str}

Generate a suggestion using the diagnosis and your memory.
    """

        logger.info(f"[SUGGESTION] Prompt: {prompt}")

        response = self.invoke(
            prompt=prompt,
            tools=[],
            output_structure=AgentSuggestions,
        )

        return response

    def apply(
        self, actions: List[Dict[str, Any]], previous_operation: Dict[str, Any]
    ) -> Generator[ActionResponse, None, None]:
        user_operation = previous_operation["operation"]
        candidate = previous_operation["candidate"]
        # references = previous_operation["references"]

        source_cluster = read_source_cluster_details(candidate["sourceColumn"])

        for action in actions:
            logger.info(f"[Agent] Applying the action: {action}")

            if action["action"] == "prune_candidates":
                tools = candidate_butler_tools + [retrieve_from_rag]
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
3. Decide Which Candidates to Prune based on your understanding and the user’s previous operations, then compile the candidates after pruning into a **dictionary** like this:
{{
  "source_col_1": [("target_col_1", 0.9), ("target_col_2", 0.7)],
  "source_col_2": [("target_col_3", 0.8)]
}}
4. Call **update_candidates** with this updated dictionary as the parameter to refine the heatmap.
                """

                logger.info(f"[ACTION-PRUNE] Prompt: {prompt}")
                response = self.invoke(
                    prompt=prompt,
                    tools=tools,
                    output_structure=ActionResponse,
                )
                yield response
            else:
                logger.info(f"[Agent] Applying the action: {action}")
                yield

    def invoke(
        self, prompt: str, tools: List, output_structure: BaseModel
    ) -> BaseModel:
        output_parser = PydanticOutputParser(pydantic_object=output_structure)

        prompt = self.generate_prompt(prompt, output_parser)
        agent_executor = create_react_agent(self.llm, tools, checkpointer=self.memory)

        responses = []
        config = {"configurable": {"thread_id": "bdiviz-1"}}
        for chunk in agent_executor.stream(
            {"messages": [HumanMessage(content=prompt)]}, config
        ):
            logger.info(chunk)
            logger.info("----")
            responses.append(chunk)

        final_response = responses[-1]["agent"]["messages"][0].content
        response = output_parser.parse(final_response)

        return response

    def bind_tools(self, tools: List, tool_choice: Optional[str] = None) -> None:
        if tool_choice is not None:
            return self.llm.bind_tools(tools, tool_choice=tool_choice)
        else:
            logger.info(f"[Agent] Binding tools to the agent...")
            return self.llm.bind_tools(tools)

    def generate_prompt(self, prompt: str, output_parser: PydanticOutputParser) -> str:
        instructions = output_parser.get_format_instructions()
        template = f"""
You are a helpful assistant on BDI-Viz: A heatmap visualizaition tool for schema matching.
You are an assistant that must return information in a strict schema.
Do not provide any reasoning, apologies, or explanations.
Directly return the JSON in the exact schema described below. 
No extra text before or after the JSON.

{instructions}

Prompt: {prompt}
"""
        return template


AGENT = Agent()
