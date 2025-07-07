import json
import logging
import os
from typing import Any, Dict, List, Optional

from langchain.tools.base import StructuredTool
from pydantic import BaseModel, Field

from ..session_manager import SESSION_MANAGER

logger = logging.getLogger("bdiviz_flask.sub")

GDC_DATA_PATH = os.path.join(os.path.dirname(__file__), "../resources/cptac-3.csv")
GDC_JSON_PATH = os.path.join(
    os.path.dirname(__file__), "../resources/gdc_ontology_flat.json"
)


class TaskTools:
    """Tools for managing matching tasks, matchers, and operations."""

    def __init__(self, session_id: str = "default"):
        self.session_id = session_id

    def get_tools(self) -> List[StructuredTool]:
        """Return all task management tools."""
        return [
            self.start_matching_task_tool,
            self.create_matcher_task_tool,
            self.get_all_nodes_tool,
        ]

    # Task Initialization and Status Tools

    @property
    def start_matching_task_tool(self) -> StructuredTool:
        """Tool to start a new matching task with source and target data."""

        class StartMatchingTaskInput(BaseModel):
            nodes: Optional[List[str]] = Field(
                description="List of target nodes to filter by (e.g., ['diagnosis', 'clinical'])."
            )

        def _start_matching_task(nodes: Optional[List[str]] = None) -> str:
            try:
                # Import celery task here to avoid circular imports
                from ..index import run_matching_task

                # Start the celery task
                task = run_matching_task.delay(self.session_id, nodes)

                logger.info(f"🧰Tool called: start_matching_task with nodes: {nodes}")

                return f"Task started successfully. Task ID: {task.id}"

            except Exception as e:
                logger.error(
                    f"🧰Tool error: start_matching_task with nodes: {nodes} with error: {str(e)}"
                )
                return f"Error starting matching task: {str(e)}"

        return StructuredTool.from_function(
            func=_start_matching_task,
            name="start_matching_task",
            description="Start a new matching task with current source and target data. Optionally filter target by specific nodes. Returns task ID for status checking.",
            args_schema=StartMatchingTaskInput,
        )

    # Matcher Management Tools

    @property
    def create_matcher_task_tool(self) -> StructuredTool:
        """Tool to create a new custom matcher via celery task."""

        class CreateMatcherTaskInput(BaseModel):
            name: str = Field(description="Name of the new matcher")
            code: str = Field(description="Python code for the matcher implementation")
            params: Optional[Dict[str, Any]] = Field(
                description="Parameters for the matcher"
            )

        def _create_matcher_task(
            name: str, code: str, params: Dict[str, Any] = None
        ) -> str:
            try:
                if params is None:
                    params = {}

                # Import celery task here to avoid circular imports
                from ..index import run_new_matcher_task

                # Start the celery task
                task = run_new_matcher_task.delay(self.session_id, name, code, params)

                logger.info(
                    f"🧰Tool called: create_matcher_task with name: {name}, code: {code[:100]}..., params: {params}"
                )

                return f"Matcher creation task started. Task ID: {task.id}"

            except Exception as e:
                logger.error(
                    f"🧰Tool error: create_matcher_task with name: {name}, code: {code[:100]}..., params: {params} with error: {str(e)}"
                )
                return f"Error starting matcher creation task: {str(e)}"

        return StructuredTool.from_function(
            func=_create_matcher_task,
            name="create_matcher_task",
            description="Start a celery task to create a new custom matcher with specified code and parameters. Returns task ID for status checking.",
            args_schema=CreateMatcherTaskInput,
        )

    # Rematching Tools

    @property
    def get_all_nodes_tool(self) -> StructuredTool:
        """Tool to get all nodes from the ontology."""

        def _get_all_nodes() -> str:
            matching_task = SESSION_MANAGER.get_session(self.session_id).matching_task
            nodes = matching_task.get_all_nodes()
            logger.info(f"🧰Tool called: get_all_nodes with nodes: {nodes}")
            return json.dumps(nodes, indent=2)

        return StructuredTool.from_function(
            func=_get_all_nodes,
            name="get_all_nodes",
            description="Get all nodes from the ontology.",
        )
