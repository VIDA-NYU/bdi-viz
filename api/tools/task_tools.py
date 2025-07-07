import json
import logging
import os
from typing import Any, Dict, List, Optional

import pandas as pd
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
            self.initialize_task_tool,
            self.create_matcher_tool,
            self.get_all_nodes_tool,
            self.rematch_with_nodes_tool,
        ]

    # Task Initialization and Status Tools

    @property
    def initialize_task_tool(self) -> StructuredTool:
        """Tool to initialize a new matching task with source and target data."""

        class InitializeTaskInput(BaseModel):
            source_data_path: Optional[str] = Field(
                default=None,
                description="Path to source CSV file. If not provided, will use cached source data.",
            )
            target_data_path: Optional[str] = Field(
                default=None,
                description="Path to target CSV file. If not provided, will use default GDC data.",
            )
            nodes: Optional[List[str]] = Field(
                default=None,
                description="List of target nodes to filter by (e.g., ['Demographic', 'Clinical']).",
            )

        def _initialize_task(
            source_data_path: Optional[str] = None,
            target_data_path: Optional[str] = None,
            nodes: Optional[List[str]] = None,
        ) -> str:
            try:
                matching_task = SESSION_MANAGER.get_session(
                    self.session_id
                ).matching_task

                # Load source data
                if source_data_path and os.path.exists(source_data_path):
                    source = pd.read_csv(source_data_path)
                elif os.path.exists(".source.csv"):
                    source = pd.read_csv(".source.csv")
                else:
                    return "Error: No source data available. Please provide source_data_path."

                # Load target data
                if target_data_path and os.path.exists(target_data_path):
                    target = pd.read_csv(target_data_path)
                    target_json = None
                elif os.path.exists(".target.csv"):
                    target = pd.read_csv(".target.csv")
                    target_json = None
                else:
                    target = pd.read_csv(GDC_DATA_PATH)
                    target_json = json.load(open(GDC_JSON_PATH, "r"))

                # Update dataframes
                matching_task.update_dataframe(source_df=source, target_df=target)

                # Set nodes filter if provided
                if nodes:
                    matching_task.set_nodes(nodes)

                # Initialize task state
                matching_task._initialize_task_state()

                # Cache the data
                source.to_csv(".source.csv", index=False)
                target.to_csv(".target.csv", index=False)
                if target_json:
                    with open(".target.json", "w") as f:
                        json.dump(target_json, f)

                return (
                    f"Task initialized successfully with {len(source.columns)} source columns and {len(target.columns)} target columns."
                    + (f" Filtered to nodes: {nodes}" if nodes else "")
                )

            except Exception as e:
                logger.error(f"Error initializing task: {str(e)}")
                return f"Error initializing task: {str(e)}"

        return StructuredTool.from_function(
            func=_initialize_task,
            name="initialize_task",
            description="Initialize a new matching task with source and target datasets. Optionally filter target by specific nodes.",
            args_schema=InitializeTaskInput,
        )

    # Matcher Management Tools

    @property
    def create_matcher_tool(self) -> StructuredTool:
        """Tool to create a new custom matcher."""

        class CreateMatcherInput(BaseModel):
            name: str = Field(description="Name of the new matcher")
            code: str = Field(description="Python code for the matcher implementation")
            params: Dict[str, Any] = Field(
                default_factory=dict, description="Parameters for the matcher"
            )

        def _create_matcher(name: str, code: str, params: Dict[str, Any] = None) -> str:
            try:
                if params is None:
                    params = {}

                matching_task = SESSION_MANAGER.get_session(
                    self.session_id
                ).matching_task
                error, matchers = matching_task.new_matcher(name, code, params)

                if error:
                    return f"Error creating matcher '{name}': {error}"

                return f"Matcher '{name}' created successfully. Total matchers: {len(matchers)}"

            except Exception as e:
                logger.error(f"Error creating matcher: {str(e)}")
                return f"Error creating matcher: {str(e)}"

        return StructuredTool.from_function(
            func=_create_matcher,
            name="create_matcher",
            description="Create a new custom matcher with specified code and parameters.",
            args_schema=CreateMatcherInput,
        )

    # Rematching Tools

    @property
    def get_all_nodes_tool(self) -> StructuredTool:
        """Tool to get all nodes from the ontology."""

        def _get_all_nodes() -> str:
            matching_task = SESSION_MANAGER.get_session(self.session_id).matching_task
            nodes = matching_task.get_all_nodes()
            return json.dumps(nodes, indent=2)

        return StructuredTool.from_function(
            func=_get_all_nodes,
            name="get_all_nodes",
            description="Get all nodes from the ontology.",
        )

    @property
    def rematch_with_nodes_tool(self) -> StructuredTool:
        """Tool to rematch with specific target nodes filter."""

        class RematchInput(BaseModel):
            nodes: List[str] = Field(
                description="List of target nodes to filter by (e.g., ['Demographic', 'Clinical'])"
            )

        def _rematch_with_nodes(nodes: List[str]) -> str:
            try:
                matching_task = SESSION_MANAGER.get_session(
                    self.session_id
                ).matching_task

                # Set the nodes filter
                matching_task.set_nodes(nodes)

                # Regenerate candidates with the new filter
                candidates = matching_task.get_candidates(is_candidates_cached=False)

                return f"Rematching completed with nodes filter: {nodes}. Generated {len(candidates)} candidates."

            except Exception as e:
                logger.error(f"Error rematching with nodes: {str(e)}")
                return f"Error rematching with nodes: {str(e)}"

        return StructuredTool.from_function(
            func=_rematch_with_nodes,
            name="rematch_with_nodes",
            description="Rematch source and target data with specific target node filters.",
            args_schema=RematchInput,
        )
