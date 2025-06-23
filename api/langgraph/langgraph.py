import concurrent.futures
import json
import logging
import os
import time
import traceback
from enum import Enum
from typing import Any, Callable, Dict, Hashable, List, Optional

from dotenv import load_dotenv
from langchain.output_parsers import PydanticOutputParser
from langchain.tools import BaseTool
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import Graph, StateGraph
from langgraph.prebuilt import create_react_agent
from portkey_ai import createHeaders
from pydantic import BaseModel, Field

from ..langchain.memory import MemoryRetriver
from ..tools.candidate_tools import CandidateTools
from ..tools.query_tools import QueryTools

load_dotenv()

logger = logging.getLogger("bdiviz_flask.sub")


class Candidate(BaseModel):
    sourceColumn: str = Field(description="The source column of the candidate")
    targetColumn: str = Field(description="The target column of the candidate")
    score: float = Field(description="The score of the candidate")


class AgentState(BaseModel):
    """State for the agent workflow."""

    message: List[str] = Field(default_factory=list, description="Agent's thoughts")
    query: str = Field(description="The query of the user")
    source_column: Optional[str] = Field(default=None, description="Source column")
    source_values: Optional[List[str]] = Field(
        default=None, description="Source values"
    )
    target_column: Optional[str] = Field(default=None, description="Target column")
    target_values: Optional[List[str]] = Field(
        default=None, description="Target values"
    )
    target_description: Optional[str] = Field(
        default=None, description="Target description"
    )
    next_agents: List[str] = Field(
        default_factory=list, description="Next agents to call"
    )
    candidates: List[Candidate] = Field(
        default_factory=list, description="Current candidates"
    )
    candidates_to_append: List[Candidate] = Field(
        default_factory=list, description="New candidates"
    )


class AgentType(str, Enum):
    SUPERVISOR = "supervisor"
    ONTOLOGY = "ontology"
    RESEARCH = "research"
    CANDIDATE = "candidate"
    FINAL = "final"


class LangGraphAgent:
    def __init__(self, memory_retriever: MemoryRetriver, session_id: str = "default"):
        portkey_headers = createHeaders(
            api_key=os.getenv("PORTKEY_API_KEY"),
            virtual_key=os.getenv("PROVIDER_API_KEY"),
        )

        # Configurable timeout from environment or default to 1000 seconds
        llm_timeout = int(os.getenv("LLM_TIMEOUT", "1000"))

        self.master_llm = ChatOpenAI(
            model="gemini-2.5-pro",
            temperature=0,
            base_url="https://ai-gateway.apps.cloud.rt.nyu.edu/v1/",
            default_headers=portkey_headers,
            timeout=llm_timeout,
            max_retries=3,
        )
        self.worker_llm = ChatOpenAI(
            model="gemini-2.5-flash",
            temperature=0,
            base_url="https://ai-gateway.apps.cloud.rt.nyu.edu/v1/",
            default_headers=portkey_headers,
            timeout=llm_timeout,
            max_retries=3,
        )
        self.memory_retriever = memory_retriever
        self.session_id = session_id
        self._state = self._init_state()
        self.graph = self._build_graph()

    def _pretty_print_state(self, state: Dict[str, Any], prefix: str = "") -> str:
        """Pretty print the agent state for logging."""
        try:
            # Convert state to dict if it's a Pydantic model
            if hasattr(state, "model_dump"):
                state = state.model_dump()

            # Custom JSON encoder to handle Pydantic models
            class PydanticEncoder(json.JSONEncoder):
                def default(self, obj):
                    if hasattr(obj, "model_dump"):
                        return obj.model_dump()
                    return str(obj)

            # Format the state with indentation and sorting
            formatted = json.dumps(state, indent=2, sort_keys=True, cls=PydanticEncoder)

            # Add prefix if provided
            if prefix:
                lines = formatted.split("\n")
                formatted = "\n".join(f"{prefix}{line}" for line in lines)

            return formatted
        except Exception as e:
            return f"Error formatting state: {str(e)}"

    def _init_state(self) -> AgentState:
        return AgentState(
            message=[],
            query="",
            source_column=None,
            target_column=None,
            source_values=None,
            target_values=None,
            target_description=None,
            candidates=[],
            candidates_to_append=[],
            next_agents=[],
        )

    def _build_graph(self) -> Graph:
        workflow = StateGraph(AgentState)

        # Define agent nodes with minimal prompts
        workflow.add_node(
            "supervisor",
            self._create_agent_node(
                self._supervisor_prompt,
                QueryTools(self.session_id).get_tools(),
                self.worker_llm,
            ),
        )

        workflow.add_node(
            "ontology_agent",
            self._create_agent_node(
                self._ontology_prompt,
                [self.memory_retriever.search_ontology_tool],
                self.master_llm,
            ),
        )

        workflow.add_node(
            "candidate_agent",
            self._create_agent_node(
                self._candidate_prompt,
                CandidateTools(self.session_id).get_tools(),
                self.worker_llm,
            ),
        )

        workflow.add_node("final", self._final_node)

        # Define routing
        def route_to_agents(state: AgentState) -> List[Hashable]:
            return state.next_agents

        # Add edges
        workflow.add_conditional_edges(
            "supervisor",
            route_to_agents,
            {
                AgentType.ONTOLOGY: "ontology_agent",
                AgentType.CANDIDATE: "candidate_agent",
            },
        )

        workflow.add_edge("ontology_agent", "candidate_agent")
        workflow.add_edge("candidate_agent", "final")
        workflow.set_entry_point("supervisor")

        return workflow.compile()

    def _create_agent_node(
        self, prompt_template: str, tools: List[BaseTool], llm: BaseChatModel
    ) -> Callable:
        """Create an agent node with a template and tools."""

        def agent_node(state: AgentState) -> AgentState:
            # Get the prompt template string first
            template = prompt_template()
            # Then format it with the state values
            prompt = template.format(
                query=state.query,
                source_column=state.source_column,
                target_column=state.target_column,
                source_values=state.source_values,
                target_values=state.target_values,
                target_description=state.target_description,
                message=state.message,
                candidates=state.candidates,
                candidates_to_append=state.candidates_to_append,
            )

            agent_state = self._invoke(
                prompt, tools, AgentState, llm, self.memory_retriever
            )
            logger.critical(
                f"\nState after agent execution:\n"
                f"{self._pretty_print_state(agent_state)}"
            )
            return agent_state

        return agent_node

    def _supervisor_prompt(self) -> str:
        return """
        You are a supervisor agent. Your job is to analyze the user's query and determine their intent, then update the state accordingly and route to the correct agent.
        
        User Query: {query}
        Source attribute: {source_column}
        Target attribute: {target_column}
        
        INTENT DETECTION:
        1. If the user wants information or explanation about the source or target attribute (e.g., "What does the target mean?", "Explain the target attribute", "Show me the description of X"), update the `target_description` (or `source_values`/`target_values` as appropriate) using the tools, add an explanatory message, set `next_agents` to ["candidate"].
        2. If the user wants to search for candidates related to a concept (e.g., "Find candidates related to biopsy"), update `source_column` and `source_values` using the tools, set `next_agents` to ["ontology"].
        3. If the user wants to manipulate candidates (e.g., accept/reject/prune/update, "Rerank candidates", "Sort candidates", "Filter candidates"), set `next_agents` to ["candidate"].
        4. If the user asks a general knowledge question not directly tied to candidate management or specific dataset attributes (e.g., "What is metastasis?", "Explain the meaning of BRCA1"), do **not** call any tools. Provide a direct answer in the `message` field and set `next_agents` to [].
        5. For any other intent, update the state and route as appropriate.
        
        TODOS:
        - Detect the user's intent and update the state fields accordingly.
        - Only call tools if needed for the intent (e.g., for explanations or candidate search).
            - Call read_source_candidates tool and pass the result as "candidates" if the user wants to manipulate candidates.
            - Call read_source_values tool and pass the result as "source_values" if the user wants to search for additional candidates.
            - Call read_target_values tool and pass the result as "target_values" or "target_description" based on the user's intent (e.g. they want information or explanation).
        - Add a message explaining your reasoning and what you updated.
        - Set the next_agents list to the correct next agent(s).
        """

    def _ontology_prompt(self) -> str:
        return """
        You are an ontology agent. Your job is to search for relevant candidates based on the user's intent and the current state.
        
        User Input: {query}
        Source attribute: {source_column}
        Source values: {source_values}
        
        INTENT DETECTION:
        1. If the user's intent is to search for candidates, use the search_ontology tool with as much detail as possible (source_column, source_values, etc.), append the results to candidates_to_append, and set next_agents to ["candidate"].
        2. Make sure the candidates searched are scored based on their correlation to the source attribute unless the user specifies otherwise, use your best judgement based on the source attribute and values for scoring.
        3. For any other intent, update the state and pass to the next agent as appropriate.
        
        TODOS:
        - Detect the user's intent from the state and query.
        - Only call tools if the intent is to search for candidates.
        - If only explanation is needed, do not call tools, just update the message and pass the state.
        - If searching, use all available information to make the search precise.
        - Update candidates_to_append with new candidates if found.
        - Add a message explaining your reasoning and what you updated.
        - Set next_agents to ["candidate"].
        """

    def _candidate_prompt(self) -> str:
        return """
        You are a candidate management agent. Your job is to handle candidate explanations and manipulations based on the user's intent and the current state.
        
        Manage candidates for query: {query}
        Source attribute: {source_column}
        Target attribute: {target_column}
        Source values: {source_values}
        Target values: {target_values}
        Target description: {target_description}
        Current candidates: {candidates}
        New candidates: {candidates_to_append}
        
        INTENT DETECTION:
        0. If the user's query is a generic knowledge question unrelated to candidate management or dataset attributes, simply answer the question in the `message` field without calling any tools, keep other state fields unchanged, and set `next_agents` to [].
        1. If the user's intent is only to get information or explanation (e.g., about the target attribute or candidates), do NOT call any tools. Just update the message with an explanation and return the state as is.
        2. If the user's intent is to append/search for new candidates, call append_candidates with candidates_to_append, update the candidates list, and add a message.
        3. If the user's intent is to accept/reject/prune/update candidates, call the appropriate tool(s) and update the candidates list and message.
        4. For any other intent, update the state and message as appropriate.
        
        TODOS:
        - Detect the user's intent from the state and query.
        - **Infer that if the queried or existing candidates should be rescored based on their correlation to the source attribute and values, use your best judgement.
        - Only call tools if the intent is to manipulate or append candidates.
        - If only explanation is needed, do not call tools, just update the message and return the state.
        - Add a message explaining your reasoning and what you updated.
        - Set next_agents to [] (end of workflow).
        """

    def _final_node(self, state: AgentState) -> AgentState:
        """Final node that collects results."""
        return state

    def _invoke(
        self,
        prompt: str,
        tools: List[BaseTool],
        output_structure: BaseModel,
        llm: BaseChatModel,
        store: MemoryRetriver,
    ) -> BaseModel:
        output_parser = PydanticOutputParser(pydantic_object=output_structure)
        prompt = f"""
        Return JSON matching this schema:
        {output_parser.get_format_instructions()}
        
        {prompt}
        """

        agent_executor = create_react_agent(llm, tools, store=store)

        # Retry logic with exponential backoff for handling gateway timeouts
        max_retries = 3
        base_delay = 1  # seconds

        for attempt in range(max_retries):
            try:
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(
                        self._stream_responses, agent_executor, prompt, self.session_id
                    )
                    # Reduced timeout to 2 minutes for better error handling
                    responses = future.result(timeout=120)
                    break  # Success, exit retry loop
            except concurrent.futures.TimeoutError:
                logger.warning(
                    f"Request timeout on attempt {attempt + 1}/{max_retries}"
                )
                if attempt < max_retries - 1:
                    delay = base_delay * (2**attempt)  # Exponential backoff
                    logger.info(f"Retrying in {delay} seconds...")
                    time.sleep(delay)
                    continue
                else:
                    logger.error("All retry attempts exhausted due to timeouts")
                    return self._init_state()
            except Exception as e:
                logger.error(f"Agent execution error: {e}\nPrompt was:\n{prompt}")
                logger.error(traceback.format_exc())

                # Handle specific gateway timeout errors
                if "504" in str(e) or "Gateway Time-out" in str(e):
                    logger.warning(
                        f"Gateway timeout on attempt {attempt + 1}/{max_retries}"
                    )
                    if attempt < max_retries - 1:
                        delay = base_delay * (2**attempt)
                        logger.info(f"Retrying in {delay} seconds...")
                        time.sleep(delay)
                        continue

                return self._init_state()

        if not responses:
            logger.error(f"Agent returned no responses. Prompt was:\n{prompt}")
            return self._init_state()

        try:
            final_response = responses[-1]["agent"]["messages"][0].content
            return output_parser.parse(final_response)
        except Exception as e:
            logger.error(f"Response parsing error: {e}\nResponse was: {responses}")
            logger.error(traceback.format_exc())
            return self._init_state()

    def _stream_responses(
        self, agent_executor, prompt: str, session_id: str
    ) -> List[Any]:
        """Stream responses from agent executor."""
        return list(
            agent_executor.stream(
                {"messages": [HumanMessage(content=prompt)]},
                {"configurable": {"thread_id": f"bdiviz-{session_id}"}},
            )
        )

    def invoke(
        self,
        query: str,
        source_column: Optional[str] = None,
        target_column: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Invoke the LangGraph workflow."""
        self._state = self._init_state()
        self._state.query = query
        self._state.source_column = source_column
        self._state.target_column = target_column

        final_state = self.graph.invoke(self._state.model_dump())
        logger.critical(f"\nFinal state:\n{self._pretty_print_state(final_state)}")
        self._state = AgentState(**final_state)

        return self._state.model_dump()


# Lazy initialization
LANGGRAPH_AGENT = None


def get_langgraph_agent(memory_retriever):
    global LANGGRAPH_AGENT
    if LANGGRAPH_AGENT is None:
        LANGGRAPH_AGENT = LangGraphAgent(memory_retriever)
    return LANGGRAPH_AGENT
