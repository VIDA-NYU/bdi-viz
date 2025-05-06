import logging
from typing import Any, Dict, List, Optional

from langchain.tools.base import StructuredTool

from ..session_manager import SESSION_MANAGER

logger = logging.getLogger("bdiviz_flask.sub")


class CandidateButler:
    def __init__(self, session: str):
        self.matching_task = SESSION_MANAGER.get_session(session).matching_task

        self.search_candidates_tool = StructuredTool.from_function(
            func=self.search_candidates,
            name="search_candidates",
            description="""
            Search for candidates matching specific biomedical attributes.
            Args:
                source_column (Optional[str]): Source biomedical attribute.
                target_column (Optional[str]): Target biomedical attribute.
            Returns:
                List[Dict[str, Any]]: Matching candidate attributes.
            """.strip(),
        )

        self.get_attribute_candidates_tool = StructuredTool.from_function(
            func=self.get_candidates_for_source_attribute,
            name="get_attribute_candidates",
            description="""
            Retrieve all candidate matches for a specific biomedical attribute.
            Args:
                source_attribute (str): The biomedical attribute to analyze.
            Returns:
                List[Dict[str, Any]]: Potential attribute mappings.
            """.strip(),
        )

    def get_candidates_for_source_attribute(self, source_attribute: str):
        """
        Get all candidate mappings for a specific biomedical attribute.
        """
        candidates = self.matching_task.get_cached_candidates()
        return [
            candidate
            for candidate in candidates
            if candidate["sourceColumn"] == source_attribute
        ]

    def update_candidates_for_source_attribute(
        self, source_attribute: str, candidates: List[Dict[str, Any]]
    ):
        """
        Update mappings for a biomedical attribute based on expert knowledge.
        """
        new_candidates = []
        cached_candidates = self.matching_task.get_cached_candidates()
        for candidate in cached_candidates:
            if candidate["sourceColumn"] == source_attribute:
                continue
            new_candidates.append(candidate)
        logger.info(
            f"[CandidateButler] Updating {len(candidates)} mappings for "
            f"biomedical attribute: {source_attribute}"
        )
        new_candidates.extend(candidates)
        self.matching_task.set_cached_candidates(new_candidates)

    def append_candidates_from_agent(
        self, source_attribute: str, candidates: List[Dict[str, Any]]
    ):
        """
        Add domain-knowledge suggested mappings for a biomedical attribute.
        """
        self.matching_task.append_candidates_from_agent(source_attribute, candidates)

    def accept_mapping(self, source_attribute: str, target_attribute: str) -> bool:
        """
        Accept a biomedical attribute mapping as correct.
        """
        try:
            self.matching_task.accept_cached_candidate({
                "sourceColumn": source_attribute,
                "targetColumn": target_attribute
            })
            return True
        except Exception as e:
            logger.error(f"Failed to accept mapping: {str(e)}")
            return False

    def reject_mapping(self, source_attribute: str, target_attribute: str) -> bool:
        """
        Reject an incorrect biomedical attribute mapping.
        """
        try:
            self.matching_task.reject_cached_candidate({
                "sourceColumn": source_attribute,
                "targetColumn": target_attribute
            })
            return True
        except Exception as e:
            logger.error(f"Failed to reject mapping: {str(e)}")
            return False

    def search_candidates(
        self,
        source_column: Optional[str],
        target_column: Optional[str],
        top_k: int = 20,
    ):
        """
        Search for biomedical attribute mappings with optional filtering.
        Args:
            source_column (Optional[str]): Source biomedical attribute.
            target_column (Optional[str]): Target biomedical attribute.
            top_k (int): Maximum number of results to return.
        Returns:
            List[Dict[str, Any]]: Ranked potential attribute mappings.
        """
        candidates = self.matching_task.get_cached_candidates()
        if source_column is not None:
            candidates = [
                candidate
                for candidate in candidates
                if candidate["sourceColumn"] == source_column
            ]
        if target_column is not None:
            candidates = [
                candidate
                for candidate in candidates
                if candidate["targetColumn"] == target_column
            ]
        candidates = sorted(candidates, key=lambda x: x["score"], reverse=True)
        return candidates[:top_k]
