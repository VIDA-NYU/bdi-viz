import logging
import random
from typing import Any, Dict, List

from langchain.tools.base import StructuredTool

from ..session_manager import SESSION_MANAGER
from ..utils import load_property

logger = logging.getLogger("bdiviz_flask.sub")


class QueryTools:
    def __init__(self, session: str):
        self.matching_task = SESSION_MANAGER.get_session(session).matching_task

        self.read_source_candidates_tool = StructuredTool.from_function(
            func=self._read_source_candidates,
            name="read_source_candidates",
            description="""
            Read existing candidates for a specific source attribute.
            Args:
                source_attribute (str): The source biomedical attribute to read.
            Returns:
                List[Dict[str, Any]]: All candidates for the source attribute.
            """.strip(),
        )

        self.read_target_values_tool = StructuredTool.from_function(
            func=self._read_target_values,
            name="read_target_values",
            description="""
            Read the values for a specific target attribute.
            Args:
                target_attribute (str): The target biomedical attribute to read.
            Returns:
                List[str]: All values for the target attribute.
            """.strip(),
        )

        self.read_target_description_tool = StructuredTool.from_function(
            func=self._read_target_description,
            name="read_target_description",
            description="""
            Read the description for a specific target attribute.
            Args:
                target_attribute (str): The target biomedical attribute to read.
            Returns:
                str: The description for the target attribute.
            """.strip(),
        )
        
    def get_tools(self) -> List[StructuredTool]:
        logger.info("Initializing query tools")
        return [
            self.read_source_candidates_tool,
            self.read_target_values_tool,
            self.read_target_description_tool,
        ]

    def _read_source_candidates(self, source_attribute: str) -> List[Dict[str, Any]]:
        """
        Read existing candidates for a specific source attribute.

        Args:
            source_attribute (str): The source biomedical attribute to read.
        Returns:
            List[Dict[str, Any]]: All candidates for the source attribute.
        """
        logger.info(f"Tool called: read_source_candidates for {source_attribute}")
        candidates = self.matching_task.get_cached_candidates()
        return [
            candidate
            for candidate in candidates
            if candidate["sourceColumn"] == source_attribute
        ]
    
    def _read_target_values(self, target_attribute: str) -> List[str]:
        """
        Read the values for a specific target attribute.

        Args:
            target_attribute (str): The target biomedical attribute to read.
        Returns:
            List[str]: All values for the target attribute.
        """
        logger.info(f"Tool called: read_target_values for {target_attribute}")
        target_properties = load_property(target_attribute)
        if target_properties is not None:
            if "enum" in target_properties:
                target_values = target_properties["enum"]
                if len(target_values) >= 20:
                    target_values = random.sample(target_values, 20)
                return target_values
        return self.matching_task.get_target_unique_values(target_attribute)
    
    def _read_target_description(self, target_attribute: str) -> str:
        """
        Read the description for a specific target attribute.

        Args:
            target_attribute (str): The target biomedical attribute to read.
        Returns:
            str: The description for the target attribute.
        """
        logger.info(f"Tool called: read_target_description for {target_attribute}")
        target_properties = load_property(target_attribute)
        if target_properties is not None:
            if "description" in target_properties:
                return target_properties["description"]
        return ""
