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
from ..tools.task_tools import TaskTools

load_dotenv()

logger = logging.getLogger("bdiviz_flask.sub")


class Candidate(BaseModel):
    sourceColumn: str = Field(description="The source column of the candidate")
    targetColumn: str = Field(description="The target column of the candidate")
    score: float = Field(description="The score of the candidate")


class ConversationTurn(BaseModel):
    """A single turn in the conversation history."""

    user_query: str = Field(description="The user's query or input")
    agent_response: str = Field(description="The agent's complete response")
    timestamp: str = Field(description="Timestamp of the conversation turn")
    context: Optional[Dict[str, Any]] = Field(
        default=None, description="Additional context (candidates, operations, etc.)"
    )


class AgentState(BaseModel):
    """State for the agent workflow with professional conversation tracking."""

    # Current turn information
    message: str = Field(
        default="", description="Agent's current thought/reasoning for this query"
    )
    query: str = Field(description="The current user query")

    # Conversation history management
    conversation_history: List[ConversationTurn] = Field(
        default_factory=list,
        description="Complete conversation history with user and agent turns",
    )

    # Working context
    source_column: Optional[str] = Field(
        default=None, description="Current source column"
    )
    source_values: Optional[List[str]] = Field(
        default=None, description="Source column values"
    )
    target_column: Optional[str] = Field(
        default=None, description="Current target column"
    )
    target_values: Optional[List[str]] = Field(
        default=None, description="Target column values"
    )
    target_description: Optional[str] = Field(
        default=None, description="Target column description"
    )

    # Workflow control
    next_agents: List[str] = Field(
        default_factory=list, description="Next agents to invoke in workflow"
    )

    # Candidate management
    candidates: List[Candidate] = Field(
        default_factory=list, description="Current working candidates"
    )
    candidates_to_append: List[Candidate] = Field(
        default_factory=list, description="New candidates to be added"
    )

    # Task management
    task_id: Optional[str] = Field(
        default=None, description="The id of the current matching task"
    )
    matcher_task_id: Optional[str] = Field(
        default=None, description="The id of the current new matcher task"
    )


class AgentType(str, Enum):
    SUPERVISOR = "supervisor"
    ONTOLOGY = "ontology"
    RESEARCH = "research"
    CANDIDATE = "candidate"
    TASK = "task"
    FINAL = "final"


class LangGraphAgent:
    def __init__(self, memory_retriever: MemoryRetriver, session_id: str = "default"):
        portkey_headers = createHeaders(
            api_key=os.getenv("PORTKEY_API_KEY"),
            virtual_key=os.getenv("PROVIDER_API_KEY"),
            metadata={"_user": "yfw215"},
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

    def _summarize_conversation_history(
        self, conversation_history: List[ConversationTurn], max_detailed_turns: int = 5
    ) -> str:
        """
        Summarize conversation history to save token space while preserving
        context.
        """
        if not conversation_history:
            return "No previous conversation"

        if len(conversation_history) <= max_detailed_turns:
            # Short history - return in full detail
            return self._format_detailed_history(conversation_history)

        # Split into older (to summarize) and recent (keep detailed)
        older_turns = conversation_history[:-max_detailed_turns]
        recent_turns = conversation_history[-max_detailed_turns:]

        summary_parts = []

        # Summarize older conversations
        if older_turns:
            summary = self._create_conversation_summary(older_turns)
            summary_parts.append(f"EARLIER CONVERSATION SUMMARY:\n{summary}")

        # Add recent detailed conversations
        recent_detailed = self._format_detailed_history(recent_turns)
        summary_parts.append(f"RECENT CONVERSATION:\n{recent_detailed}")

        return "\n\n".join(summary_parts)

    def _format_detailed_history(
        self, conversation_turns: List[ConversationTurn]
    ) -> str:
        """Format conversation turns in full detail."""
        formatted_turns = []
        for i, turn in enumerate(conversation_turns, 1):
            formatted_turns.append(
                f"Turn {i}:\n"
                f"  User: {turn.user_query}\n"
                f"  Agent: {turn.agent_response}"
            )
            if turn.context:
                formatted_turns.append(f"  Context: {turn.context}")

        return "\n\n".join(formatted_turns)

    def _create_conversation_summary(self, older_turns: List[ConversationTurn]) -> str:
        """Create a concise summary of older conversation turns."""
        if not older_turns:
            return "No earlier conversation"

        # Extract key themes and patterns
        user_interests = []
        agent_actions = []
        key_decisions = []

        for turn in older_turns:
            # Extract user interests and questions
            query_lower = turn.user_query.lower()
            if any(word in query_lower for word in ["what", "how", "why", "explain"]):
                user_interests.append(f"Asked about: {turn.user_query[:50]}...")

            # Extract agent actions and decisions
            response_lower = turn.agent_response.lower()
            if any(
                word in response_lower for word in ["recommend", "suggest", "found"]
            ):
                agent_actions.append(f"Recommended: {turn.agent_response[:50]}...")

            # Extract key decisions from context
            if turn.context:
                if turn.context.get("candidates_count", 0) > 0:
                    key_decisions.append(
                        f"Worked with {turn.context['candidates_count']} candidates"
                    )
                if turn.context.get("source_column"):
                    key_decisions.append(
                        f"Focused on source: {turn.context['source_column']}"
                    )
                if turn.context.get("task_id"):
                    key_decisions.append(
                        f"Started matching task: {turn.context['task_id']}"
                    )
                if turn.context.get("matcher_task_id"):
                    key_decisions.append(
                        f"Started matcher task: {turn.context['matcher_task_id']}"
                    )

        # Build concise summary
        summary_parts = []

        if user_interests:
            summary_parts.append(
                f"User showed interest in: {'; '.join(user_interests[:3])}"
            )

        if agent_actions:
            summary_parts.append(f"Agent provided: {'; '.join(agent_actions[:3])}")

        if key_decisions:
            summary_parts.append(f"Key context: {'; '.join(key_decisions[:3])}")

        if not summary_parts:
            summary_parts.append(
                f"Discussed data matching topics over {len(older_turns)} turns"
            )

        return " | ".join(summary_parts)

    def _format_conversation_history(
        self, conversation_history: List[ConversationTurn], max_turns: int = 10
    ) -> str:
        """Format conversation history for agent prompts with summarization."""
        return self._summarize_conversation_history(
            conversation_history,
            max_detailed_turns=max_turns // 2,  # Keep half as detailed, summarize rest
        )

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
        """Initialize a clean agent state."""
        return AgentState(
            message="",
            query="",
            conversation_history=[],
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

        # Define agent nodes with enhanced prompts for conversation awareness
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

        task_agent_tools = TaskTools(self.session_id).get_tools()
        workflow.add_node(
            "task_agent",
            self._create_agent_node(
                self._task_prompt,
                task_agent_tools,
                self.master_llm,
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
                AgentType.TASK: "task_agent",
            },
        )

        workflow.add_edge("ontology_agent", "candidate_agent")
        workflow.add_edge("candidate_agent", "final")
        workflow.add_edge("task_agent", "final")
        workflow.set_entry_point("supervisor")

        return workflow.compile()

    def _create_agent_node(
        self, prompt_template: str, tools: List[BaseTool], llm: BaseChatModel
    ) -> Callable:
        """Create an agent node with conversation-aware templates."""

        def agent_node(state: AgentState) -> AgentState:
            # Get the prompt template string first
            template = prompt_template()

            # Format conversation history for context
            conversation_context = self._format_conversation_history(
                state.conversation_history
            )

            # Format the prompt with current state and conversation context
            prompt = template.format(
                query=state.query,
                source_column=state.source_column,
                target_column=state.target_column,
                source_values=state.source_values,
                target_values=state.target_values,
                target_description=state.target_description,
                conversation_history=conversation_context,
                candidates=state.candidates,
                candidates_to_append=state.candidates_to_append,
                current_message=state.message,
                task_id=state.task_id,
                matcher_task_id=state.matcher_task_id,
            )

            agent_state = self._invoke(
                prompt, tools, AgentState, llm, self.memory_retriever
            )
            return agent_state

        return agent_node

    def _supervisor_prompt(self) -> str:
        return """
        You are an intelligent supervisor agent for a data matching system.
        IMPORTANT ROLE GUIDELINES:
        - You are a highly skilled biomedical data integration expert.
        - NEVER mention being an AI language model or providing "subjective opinions".
        - Speak decisively and professionally, offering clear domain-specific guidance.
        - Avoid generic disclaimers; instead, provide actionable advice grounded in
          biomedical data matching expertise.
        Your role is to understand user intent, manage context, and route 
        requests intelligently.

        CURRENT REQUEST: {query}
        Current Context: Source="{source_column}" | Target="{target_column}"
        
        CONVERSATION HISTORY:
        {conversation_history}

        CORE RESPONSIBILITIES:
        1. **Contextual Understanding**: Analyze the conversation history to:
           - Understand follow-up questions and clarifications
           - Identify when users are building on previous discussions
           - Recognize patterns in user preferences and decision-making
           - Ask intelligent clarifying questions when needed

        2. **Information Management**: 
           - Use tools to read source/target data as needed
           - Store important insights with `remember_this`
           - Retrieve relevant context with `recall_memory`

        3. **Smart Routing**: Based on conversation context and current query:
           - New candidate search → route to ["ontology"]
           - Candidate operations → route to ["candidate"]
           - Task operations → route to ["task"] (e.g. new task, new matcher, update node filter)
           - Information requests → handle directly, set next_agents = []
           - Unclear intent → ask clarification, set next_agents = []

        INTELLIGENT CONVERSATION PATTERNS:
        - If user asks about "the candidate" → check history for context
        - If user asks "what should I do?" → analyze their previous actions
        - If user seems uncertain → offer guided suggestions
        - If user references "it" or "that" → resolve from conversation

        CLARIFICATION EXAMPLES:
        - "Based on your previous question about X, are you asking about Y?"
        - "I see you were interested in Z earlier. Should I focus on that?"
        - "To better help you, could you clarify if you mean A or B?"

        Provide thoughtful, context-aware responses that build naturally 
        on the conversation flow. Write a concise, user-facing biomedical explanation in `message`.
        Do NOT include meta-reasoning; do NOT start with "As an AI ...".
        """

    def _ontology_prompt(self) -> str:
        return """
        You are an ontology search specialist. Your job is to find relevant 
        candidates by leveraging conversation context and domain knowledge.

        CURRENT REQUEST: {query}
        Source Context: "{source_column}" with values: {source_values}
        
        CONVERSATION HISTORY:
        {conversation_history}

        INTELLIGENT SEARCH STRATEGY:
        1. **Context Analysis**: Review conversation history to understand:
           - User's domain and data type preferences
           - Previously discussed attributes and concepts
           - Refinement patterns and feedback given
           - Any mentioned constraints or requirements

        2. **Knowledge Integration**:
           - Use `recall_memory` for relevant domain knowledge
           - Consider user's past search patterns and results
           - Incorporate feedback from previous candidate discussions

        3. **Targeted Search**: Execute `search_ontology` with:
           - Current source attribute and representative values
           - Contextual keywords from conversation history
           - Domain-specific terminology the user has mentioned
           - Refinement criteria based on past feedback

        4. **Quality Assessment**: Score and filter candidates considering:
           - Alignment with user's expressed preferences
           - Relevance to ongoing conversation themes
           - Quality indicators from domain knowledge

        5. **Conversation Continuity**: In your reasoning (`message`), reference:
           - How this search builds on previous discussions
           - Why certain candidates align with user's stated goals
           - Any patterns you've noticed in their preferences

        Store results in `candidates_to_append` and set next_agents = ["candidate"]
        for further processing and presentation to the user.
        """

    def _candidate_prompt(self) -> str:
        return """
        You are a candidate management specialist. You handle all candidate 
        operations with deep conversation awareness and user preference learning.

        CURRENT REQUEST: {query}
        Working Context:
        - Source: "{source_column}" (values: {source_values})
        - Target: "{target_column}" (values: {target_values})
        - Description: {target_description}
        - Current candidates: {candidates}
        - New candidates: {candidates_to_append}
        
        CONVERSATION HISTORY:
        {conversation_history}

        INTELLIGENT OPERATIONS:
        1. **Pattern Recognition**: From conversation history, identify:
           - User's acceptance/rejection patterns and criteria
           - Preferred attribute types and domains
           - Quality thresholds and scoring preferences
           - Common concerns and decision factors

        2. **Contextual Processing**:
           - Use `append_candidates` for new candidates
           - Apply conversation-informed filtering and ranking
           - Consider user's evolving understanding and preferences
           - Use domain tools as needed for additional context

        3. **Intelligent Recommendations**: Based on patterns, suggest:
           - High-quality candidates that match user preferences
           - Alternative approaches when current options are limited
           - Refinements based on previous feedback
           - Next steps that align with user's workflow

        4. **Conversational Responses**: In your reasoning (`message`):
           - Reference specific points from the conversation
           - Explain how recommendations connect to user's goals
           - Ask relevant follow-up questions when appropriate
           - Provide actionable insights and suggestions

        RESPONSE PATTERNS:
                 - "Given your interest in X from earlier, candidate Y might be 
           ideal"
        - "Based on your preference for Z, I've prioritized candidates with..."
        - "I notice you typically prefer A over B, so I recommend..."
        - "Since you asked about C, here are some related options..."

        Focus on building a helpful, context-aware dialogue that guides 
        the user toward effective data matching decisions.
        """

    def _task_prompt(self) -> str:
        return """
        You are a task management specialist. You handle all task operations with deep conversation awareness and user preference learning.

        CURRENT REQUEST: {query}
        CONVERSATION HISTORY:
        {conversation_history}

        INTELLIGENT OPERATIONS:
        1. **Start Matching Task**: 
          - Use `start_matching_task` to start a new matching task.
          - Extract the task ID from the response and store it in `task_id`.
          - Optionally provide nodes filter if user specifies target categories.
        2. **Update Node Filter and Rematch**: 
          - Use `get_all_nodes` to get all nodes from the ontology.
          - Based on user's query, determine appropriate nodes filter.
          - Use `start_matching_task` to start a rematch task with the filtered nodes list.
          - Extract the task ID from the response and store it in `task_id`.
        3. **New Matcher**:
          - Based on user's query, writes a complete python code snippet for a new matcher (starts with import statements, then the class definition, then the __init__ method, then the match method).
            Here is an example of a complete python code snippet for a new matcher, note that top_matches method is required with the output format:
```
from typing import Any, Dict, List, Tuple
import pandas as pd
from rapidfuzz import fuzz, process, utils


class RapidFuzzMatcher():
    def __init__(self, name: str, weight: int = 1) -> None:
        self.threshold = 0.0
        self.name = name
        self.weight = weight

    def top_matches(
        self, source: pd.DataFrame, target: pd.DataFrame, top_k: int = 20, **kwargs
    ) -> List[Dict[str, Any]]:
        matches = self._get_matches(source, target, top_k)
        matcher_candidates = self._layer_candidates(matches, self.name)
        return matcher_candidates

    def _get_matches(
        self, source: pd.DataFrame, target: pd.DataFrame, top_k: int
    ) -> Dict[str, Dict[str, float]]:
        pass

    def _layer_candidates(
        self,
        matches: Dict[str, Dict[str, float]],
        matcher: str,
    ) -> List[Dict[str, Any]]:
        layered_candidates = []
        for source_column, target_columns in matches.items():
            for target_column, score in target_columns.items():
                candidate = {{
                    "sourceColumn": source_column,
                    "targetColumn": target_column,
                    "score": score,
                    "matcher": matcher,
                    "status": "idle",
                }}
            layered_candidates.append(candidate)
        return layered_candidates
```
            - Pass the new matcher to `create_matcher_task` tool, the parameters are:
               - name: the name of the new matcher object (e.g. "PubMedBERTMatcher")
               - code: the python code snippet for the new matcher
               - params: the additional parameters for the new matcher
        
        TASK ID HANDLING:
            - When a tool returns a task ID, extract it from the response message.
            - Store the task ID in the appropriate field (task_id, matcher_task_id).
            - Include the task ID in your response to the user so they can track progress.
        After you finish thinking, write your **public answer** in `message`.  
        Include task IDs in your response when tasks are started.
        """

    def _final_node(self, state: AgentState) -> AgentState:
        """Final node that prepares the response for the user."""
        # The final node just returns the state as-is
        # The conversation history will be updated in the main invoke method
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
                    f"Request timeout on attempt {attempt + 1}/" f"{max_retries}"
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
                logger.error(f"Agent execution error: {e}\n" f"Prompt was:\n{prompt}")
                logger.error(traceback.format_exc())

                # Handle specific gateway timeout errors
                if "504" in str(e) or "Gateway Time-out" in str(e):
                    logger.warning(
                        f"Gateway timeout on attempt {attempt + 1}/" f"{max_retries}"
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
        """
        Invoke the LangGraph workflow with professional conversation management.

        This method maintains intelligent conversation context across multiple
        calls, enabling the agent to ask clarifying questions and provide
        contextual responses. To start a fresh session, pass reset=True.
        """
        from datetime import datetime

        # Start a new session only when explicitly requested or on first run
        if reset or self._state is None:
            self._state = self._init_state()

        # Update working context (preserve existing values if not provided)
        self._state.query = query
        if source_column is not None:
            self._state.source_column = source_column
        if target_column is not None:
            self._state.target_column = target_column

        # Execute the workflow
        final_state = self.graph.invoke(self._state.model_dump())
        updated_state = AgentState(**final_state)

        # Create conversation turn and add to history
        conversation_turn = ConversationTurn(
            user_query=query,
            agent_response=updated_state.message,
            timestamp=datetime.now().isoformat(),
            context={
                "source_column": updated_state.source_column,
                "target_column": updated_state.target_column,
                "candidates_count": len(updated_state.candidates),
                "new_candidates_count": len(updated_state.candidates_to_append),
                "task_id": updated_state.task_id,
                "matcher_task_id": updated_state.matcher_task_id,
            },
        )

        # Add to conversation history
        updated_state.conversation_history.append(conversation_turn)

        # Keep conversation history manageable (last 20 turns)
        if len(updated_state.conversation_history) > 20:
            updated_state.conversation_history = updated_state.conversation_history[
                -20:
            ]

        # Persist the updated state for the next turn
        self._state = updated_state

        return self._state.model_dump()


# Lazy initialization
LANGGRAPH_AGENT = None


def get_langgraph_agent(memory_retriever):
    global LANGGRAPH_AGENT
    if LANGGRAPH_AGENT is None:
        LANGGRAPH_AGENT = LangGraphAgent(memory_retriever)
    return LANGGRAPH_AGENT
