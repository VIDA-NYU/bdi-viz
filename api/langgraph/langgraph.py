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
            config={
                "retry": {"attempts": 3},
                "cache": {"mode": "simple"},
                "input_guardrails": ["pg-bdiviz-09d75c"],
                "output_guardrails": ["pg-bdiviz-09d75c"],
            },
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
                QueryTools(self.session_id, self.memory_retriever).get_tools(),
                self.worker_llm,
            ),
        )

        ontology_agent_tools = QueryTools(
            self.session_id, self.memory_retriever
        ).get_tools() + [self.memory_retriever.search_ontology_tool]
        workflow.add_node(
            "ontology_agent",
            self._create_agent_node(
                self._ontology_prompt,
                ontology_agent_tools,
                self.master_llm,
            ),
        )

        candidate_agent_tools = (
            QueryTools(self.session_id, self.memory_retriever).get_tools()
            + CandidateTools(self.session_id).get_tools()
        )
        workflow.add_node(
            "candidate_agent",
            self._create_agent_node(
                self._candidate_prompt,
                candidate_agent_tools,
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
            # Format conversation history for context
            conversation_history = (
                "\n".join(state.message)
                if state.message
                else "No previous conversation"
            )
            # Then format it with the state values including full conversation
            prompt = template.format(
                query=state.query,
                source_column=state.source_column,
                target_column=state.target_column,
                source_values=state.source_values,
                target_values=state.target_values,
                target_description=state.target_description,
                message=state.message,
                conversation_history=conversation_history,
                candidates=state.candidates,
                candidates_to_append=state.candidates_to_append,
            )

            agent_state = self._invoke(
                prompt, tools, AgentState, llm, self.memory_retriever
            )
            return agent_state

        return agent_node

    def _supervisor_prompt(self) -> str:
        return """
        You are a supervisor agent. Read source/target information, handle user 
        memory requests, answer queries, and route to the correct agent.

        CURRENT REQUEST: {query}
        Source: {source_column} | Target: {target_column}
        
        CONVERSATION HISTORY:
        {conversation_history}

        RESPONSIBILITIES:
        1. **Context awareness**: Use conversation history to understand follow-up
           questions, clarifications, and user intent evolution.
        2. **Read and pass information**: Use tools to read source/target data.
        3. **Memory management**: Use `remember_this` for storing information.
        4. **Query answering**: Use `recall_memory` for user questions.
        5. **Smart routing**: Route based on current query + conversation context.

        ROUTING LOGIC (consider conversation context):
        - Search new candidates → read source info, route to ["ontology"]
        - Manipulate existing candidates → read candidates, route to ["candidate"] 
        - Store information → use `remember_this`, set `next_agents` = []
        - Query stored info → use `recall_memory`, answer, set `next_agents` = []
        - Follow-up/clarification → use conversation history to understand intent
        - Unclear → ask clarification, set `next_agents` = []

        Use conversation history to make smarter routing decisions and provide
        better context to downstream agents.
        """

    def _ontology_prompt(self) -> str:
        return """
        You are an ontology agent. Search for relevant candidates using 
        conversation context, metadata, and source information.

        CURRENT REQUEST: {query}
        Source: {source_column} | Values: {source_values}
        
        CONVERSATION HISTORY:
        {conversation_history}

        INTELLIGENT WORKFLOW:
        1. **Analyze conversation**: Review history to understand user's evolving
           needs, previous searches, refinements, and clarifications.
           
        2. **Gather context**: Use `recall_memory` to retrieve relevant metadata
           (papers, data types, domain knowledge) mentioned in conversation.
           
        3. **Smart search**: Use `search_ontology` with:
           - Current source attribute and values
           - Context from conversation history
           - Retrieved metadata
           - Understanding of user's refined requirements
           
        4. **Contextual scoring**: Score candidates based on:
           - Relevance to source attribute
           - Alignment with conversation context
           - User's expressed preferences from history
           
        5. **Return results**: Append to `candidates_to_append`, route to 
           ["candidate"] for further processing.

        Use conversation history to provide more targeted and relevant candidates
        that align with the user's evolving understanding and requirements.
        """

    def _candidate_prompt(self) -> str:
        return """
        You are a candidate management agent. Handle all candidate operations
        with full conversation context awareness.

        CURRENT REQUEST: {query}
        Source: {source_column} | Target: {target_column}
        Source values: {source_values} | Target values: {target_values}
        Target description: {target_description}
        Current: {candidates} | New: {candidates_to_append}
        
        CONVERSATION HISTORY:
        {conversation_history}

        INTELLIGENT CAPABILITIES:
        1. **Context-aware decisions**: Use conversation history to understand:
           - User's evolving preferences and criteria
           - Previous explanations and clarifications given
           - Patterns in user's acceptance/rejection decisions
           - Follow-up questions and refinements
           
        2. **Smart operations**:
           - Append new candidates with `append_candidates`
           - Accept/reject/prune based on conversation patterns
           - Read missing info with appropriate tools as needed
           
        3. **Contextual reranking**: Calculate scores considering:
           - Conversation history and user feedback patterns
           - Recalled metadata (use `recall_memory`)
           - Source/target attributes and user-specified criteria
           - Previous scoring rationales and adjustments
           
        4. **Informed explanations**: Provide explanations that:
           - Reference previous conversation points
           - Build on earlier explanations
           - Address follow-up questions intelligently

        Use conversation history to make smarter decisions, provide better
        explanations, and anticipate user needs based on interaction patterns.
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
        reset: bool = False,
    ) -> Dict[str, Any]:
        """Invoke the LangGraph workflow.

        This method maintains conversation context across multiple calls, similar to
        ChatGPT sessions. To start a fresh session, pass ``reset=True``.
        """

        # Start a new session only when explicitly requested or on first run
        if reset or self._state is None:
            self._state = self._init_state()

        # Update (but do not overwrite unless provided) the tracked attributes
        self._state.query = query
        if source_column is not None:
            self._state.source_column = source_column
        if target_column is not None:
            self._state.target_column = target_column

        # Keep a simple running log of the conversation
        if query:
            self._state.message.append(f"USER: {query}")

        final_state = self.graph.invoke(self._state.model_dump())

        # Persist the updated state for the next turn
        self._state = AgentState(**final_state)

        return self._state.model_dump()


# Lazy initialization
LANGGRAPH_AGENT = None


def get_langgraph_agent(memory_retriever):
    global LANGGRAPH_AGENT
    if LANGGRAPH_AGENT is None:
        LANGGRAPH_AGENT = LangGraphAgent(memory_retriever)
    return LANGGRAPH_AGENT
