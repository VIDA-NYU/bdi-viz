import logging
import random
from typing import Any, Dict, List

from langchain.tools.base import StructuredTool

from ..langchain.memory import MemoryRetriever
from ..session_manager import SESSION_MANAGER
from ..utils import load_property

logger = logging.getLogger("bdiviz_flask.sub")


class QueryTools:
    def __init__(self, session: str, memory_retriever: MemoryRetriever):
        self.matching_task = SESSION_MANAGER.get_session(session).matching_task
        self.memory_retriever = memory_retriever

        self.read_source_candidates_tool = StructuredTool.from_function(
            func=self._read_source_candidates,
            name="read_source_candidates",
            description="""
            Read existing candidates for a specific source attribute.
            Args:
                source_attribute (str): The source biomedical attribute to
                read.
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
                session_id (str): The current session ID.
                target_attribute (str): The target biomedical attribute to
                read.
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
                session_id (str): The current session ID.
                target_attribute (str): The target biomedical attribute to
                read.
            Returns:
                str: The description for the target attribute.
            """.strip(),
        )

        self.read_source_values_tool = StructuredTool.from_function(
            func=self._read_source_values,
            name="read_source_values",
            description="""
            Read the values for a specific source attribute.
            Args:
                session_id (str): The current session ID.
                source_attribute (str): The source biomedical attribute to
                read.
            Returns:
                List[str]: All values for the source attribute.
            """.strip(),
        )

        self.read_source_description_tool = StructuredTool.from_function(
            func=self._read_source_description,
            name="read_source_description",
            description="""
            Read the description for a specific source attribute.
            Args:
                session_id (str): The current session ID.
                source_attribute (str): The source biomedical attribute to read.
            Returns:
                str: The description for the source attribute.
            """.strip(),
        )

    def get_tools(self) -> List[StructuredTool]:
        logger.info("Initializing query tools")
        return [
            self.read_source_candidates_tool,
            self.read_source_values_tool,
            self.read_target_values_tool,
            self.read_target_description_tool,
            self.read_source_description_tool,
            self.memory_retriever.remember_this_tool,
            self.memory_retriever.recall_memory_tool,
        ]

    def _read_source_candidates(self, source_attribute: str) -> List[Dict[str, Any]]:
        """
        Read existing candidates for a specific source attribute.

        Args:
            source_attribute (str): The source biomedical attribute to read.
        Returns:
            List[Dict[str, Any]]: All candidates for the source attribute.
        """
        candidates = self.matching_task.get_cached_candidates()
        # Filter candidates by source attribute and group by sourceColumn and targetColumn
        filtered_candidates = [
            candidate
            for candidate in candidates
            if candidate["sourceColumn"] == source_attribute
        ]

        # Get matcher weights for weighted scoring
        matcher_weights = {}
        matchers = self.matching_task.get_matchers()
        for matcher in matchers:
            matcher_weights[matcher["name"]] = matcher["weight"]

        # Group by sourceColumn and targetColumn, collecting scores and matchers
        grouped_candidates = {}
        for candidate in filtered_candidates:
            key = (candidate["sourceColumn"], candidate["targetColumn"])
            if key not in grouped_candidates:
                grouped_candidates[key] = {
                    "sourceColumn": candidate["sourceColumn"],
                    "targetColumn": candidate["targetColumn"],
                    "scores": [],
                    "matchers": [],
                }
            grouped_candidates[key]["scores"].append(candidate["score"])
            grouped_candidates[key]["matchers"].append(
                candidate.get("matcher", "unknown")
            )

        # Calculate weighted average scores and create final results
        results = []
        for key, group in grouped_candidates.items():
            if matcher_weights:
                # Calculate weighted average using matcher weights
                weighted_avg_score = 0.0
                for i, matcher in enumerate(group["matchers"]):
                    weight = matcher_weights.get(matcher, 1.0)
                    weighted_avg_score += group["scores"][i] * weight
            else:
                # Fallback to simple average if no weights available
                weighted_avg_score = sum(group["scores"]) / len(group["scores"])

            results.append(
                {
                    "sourceColumn": group["sourceColumn"],
                    "targetColumn": group["targetColumn"],
                    "score": weighted_avg_score,
                }
            )
        logger.info(
            "🧰Tool called: read_source_candidates for %s found %s candidates",
            source_attribute,
            len(results),
        )
        return results

    def _read_target_values(self, session_id: str, target_attribute: str) -> List[str]:
        """
        Read the values for a specific target attribute.

        Args:
            session_id (str): The current session ID.
            target_attribute (str): The target biomedical attribute to read.
        Returns:
            List[str]: All values for the target attribute.
        """
        results = []  # Initialize results to avoid UnboundLocalError
        target_properties = load_property(
            target_attribute, is_target=True, session=session_id
        )
        if target_properties is not None:
            if "enum" in target_properties:
                target_values = target_properties["enum"]
                if len(target_values) >= 20:
                    target_values = random.sample(target_values, 20)
                results = target_values
            else:
                # If no enum property, fall back to matching_task
                results = self.matching_task.get_target_unique_values(target_attribute)
        else:
            results = self.matching_task.get_target_unique_values(target_attribute)
        logger.info(
            "🧰Tool called: read_target_values for session %s, target %s found %s values",
            session_id,
            target_attribute,
            len(results),
        )
        return results

    def _read_source_values(self, session_id: str, source_attribute: str) -> List[str]:
        """
        Read the values for a specific source attribute.

        Args:
            session_id (str): The current session ID.
            source_attribute (str): The source biomedical attribute to read.
        Returns:
            List[str]: All values for the source attribute.
        """
        results = []  # Initialize results to avoid UnboundLocalError
        source_properties = load_property(
            source_attribute, is_target=False, session=session_id
        )
        if source_properties is not None:
            if "enum" in source_properties:
                source_values = source_properties["enum"]
                if len(source_values) >= 20:
                    source_values = random.sample(source_values, 20)
                results = source_values
            else:
                # If no enum property, fall back to matching_task
                results = self.matching_task.get_source_unique_values(source_attribute)
        else:
            results = self.matching_task.get_source_unique_values(source_attribute)
        logger.info(
            "🧰Tool called: read_source_values for session %s, source %s found %s values",
            session_id,
            source_attribute,
            len(results),
        )
        return results

    def _read_target_description(self, session_id: str, target_attribute: str) -> str:
        """
        Read the description for a specific target attribute.

        Args:
            session_id (str): The current session ID.
            target_attribute (str): The target biomedical attribute to read.
        Returns:
            str: The description for the target attribute.
        """
        results = ""  # Initialize results to avoid UnboundLocalError
        target_properties = load_property(
            target_attribute, is_target=True, session=session_id
        )
        if target_properties is not None:
            if "description" in target_properties:
                results = target_properties["description"]
            # If no description property, results remains empty string
        # If target_properties is None, results remains empty string
        logger.info(
            "🧰Tool called: read_target_description for session %s, target %s found: %s...",
            session_id,
            target_attribute,
            results[:10],
        )
        return results

    def _read_source_description(self, session_id: str, source_attribute: str) -> str:
        """
        Read the description for a specific source attribute.

        Args:
            session_id (str): The current session ID.
            source_attribute (str): The source biomedical attribute to read.
        Returns:
            str: The description for the source attribute.
        """
        results = ""  # Initialize results to avoid UnboundLocalError
        source_properties = load_property(
            source_attribute, is_target=False, session=session_id
        )
        if source_properties is not None:
            if "description" in source_properties:
                results = source_properties["description"]
            # If no description property, results remains empty string
        # If source_properties is None, results remains empty string
        logger.info(
            "🧰Tool called: read_source_description for session %s, source %s found: %s...",
            session_id,
            source_attribute,
            results[:10],
        )
        return results
