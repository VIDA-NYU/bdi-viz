import logging
from typing import Any, Dict, List

from langchain.tools.base import StructuredTool

from ..session_manager import SESSION_MANAGER

logger = logging.getLogger("bdiviz_flask.sub")


class CandidateTools:
    def __init__(self, session: str):
        self.matching_task = SESSION_MANAGER.get_session(session).matching_task

        self.update_candidates_tool = StructuredTool.from_function(
            func=self.source_candidates_update,
            name="update_candidates",
            description="""
            Update the candidate matches for a specific biomedical attribute.
            Args:
                source_attribute (str): The biomedical attribute to analyze.
                candidates (List[Dict[str, Any]]): New candidates to set.
            Returns:
                bool: Success status of the operation.
            """.strip(),
        )

        self.prune_candidates_tool = StructuredTool.from_function(
            func=self.source_candidates_delete,
            name="prune_candidates",
            description="""
            Prune specific candidates from a source attribute.
            Args:
                source_attribute (str): The source biomedical attribute.
                target_attributes (List[str]): Target attributes to remove.
            Returns:
                bool: Success status of the operation.
            """.strip(),
        )

        self.append_candidates_tool = StructuredTool.from_function(
            func=self.source_candidates_append,
            name="append_candidates",
            description="""
            Add suggested mappings from other tools and agents for a biomedical attribute.
            Args:
                source_attribute (str): The biomedical attribute to analyze.
                candidates (List[Dict[str, Any]]): New candidates to set.
            Returns:
                bool: Success status of the operation.
            """.strip(),
        )

        self.accept_match_tool = StructuredTool.from_function(
            func=self.accept_match,
            name="accept_match",
            description="""
            Accept a biomedical attribute mapping as correct.
            Args:
                source_attribute (str): The source biomedical attribute.
                target_attribute (str): The target biomedical attribute.
            Returns:
                bool: Success status of the operation.
            """.strip(),
        )

        self.reject_match_tool = StructuredTool.from_function(
            func=self.reject_match,
            name="reject_match",
            description="""
            Reject a biomedical attribute mapping as incorrect.
            Args:
                source_attribute (str): The source biomedical attribute.
                target_attribute (str): The target biomedical attribute.
            Returns:
                bool: Success status of the operation.
            """.strip(),
        )

    def get_tools(self) -> List[StructuredTool]:
        logger.info("Initializing candidate tools")
        return [
            self.accept_match_tool,
            self.reject_match_tool,
            self.update_candidates_tool,
            self.prune_candidates_tool,
            self.append_candidates_tool,
        ]

    def accept_match(self, source_attribute: str, target_attribute: str) -> bool:
        """
        Accept a biomedical attribute mapping as correct.
        """
        logger.info(
            f"🧰Tool called: accept_match for {source_attribute} -> {target_attribute}"
        )
        try:
            self.matching_task.accept_cached_candidate(
                {"sourceColumn": source_attribute, "targetColumn": target_attribute}
            )
            return True
        except Exception as e:
            logger.error(f"Failed to accept match: {str(e)}")
            return False

    def reject_match(self, source_attribute: str, target_attribute: str) -> bool:
        """
        Reject an incorrect biomedical attribute mapping.
        """
        logger.info(
            f"🧰Tool called: reject_match for {source_attribute} -> {target_attribute}"
        )
        try:
            self.matching_task.reject_cached_candidate(
                {"sourceColumn": source_attribute, "targetColumn": target_attribute}
            )
            return True
        except Exception as e:
            logger.error(f"Failed to reject match: {str(e)}")
            return False

    def source_candidates_update(
        self, source_attribute: str, candidates: List[Dict[str, Any]]
    ) -> bool:
        """
        Update all candidates for a specific source attribute.

        Args:
            source_attribute (str): The source biomedical attribute to update.
            candidates (List[Dict[str, Any]]): New candidates to set.
        Returns:
            bool: Success status of the operation.
        """
        logger.info(
            f"🧰Tool called: update_candidates for {source_attribute} with {len(candidates)} candidates"
        )
        try:
            new_candidates = []
            cached_candidates = self.matching_task.get_cached_candidates()

            # Keep all candidates not related to this source attribute
            for candidate in cached_candidates:
                if candidate["sourceColumn"] != source_attribute:
                    new_candidates.append(candidate)

            # Add the new candidates for this source attribute
            new_candidates.extend(
                [
                    {
                        "sourceColumn": candidate["sourceColumn"],
                        "targetColumn": candidate["targetColumn"],
                        "score": candidate["score"],
                        "matcher": "agent",
                        "status": "idle",
                    }
                    for candidate in candidates
                ]
            )

            self.matching_task.set_cached_candidates(new_candidates)
            logger.info(
                f"🧰Tool result: updated {len(candidates)} candidates for "
                f"source attribute: {source_attribute}"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to update candidates: {str(e)}")
            return False

    def source_candidates_delete(
        self, source_attribute: str, target_attributes: List[str]
    ) -> bool:
        """
        Delete specific candidates from a source attribute.

        Args:
            source_attribute (str): The source biomedical attribute.
            target_attributes (List[str]): Target attributes to remove.
        Returns:
            bool: Success status of the operation.
        """
        logger.info(
            f"🧰Tool called: prune_candidates for {source_attribute} removing {len(target_attributes)} targets"
        )
        try:
            new_candidates = []
            cached_candidates = self.matching_task.get_cached_candidates()

            for candidate in cached_candidates:
                # Skip if this is a candidate we want to delete
                if (
                    candidate["sourceColumn"] == source_attribute
                    and candidate["targetColumn"] in target_attributes
                ):
                    continue
                new_candidates.append(candidate)

            self.matching_task.set_cached_candidates(new_candidates)
            logger.info(
                f"🧰Tool result: deleted {len(target_attributes)} candidates "
                f"from source attribute: {source_attribute}"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to delete candidates: {str(e)}")
            return False

    def source_candidates_append(
        self, source_attribute: str, candidates: List[Dict[str, Any]]
    ):
        """
        Add domain-knowledge suggested mappings for a biomedical attribute.

        Args:
            source_attribute (str): The source biomedical attribute.
            candidates (List[Dict[str, Any]]): New candidates to set.
        Returns:
            bool: Success status of the operation.
        """
        logger.info(
            f"🧰Tool called: append_candidates for {source_attribute} with {len(candidates)} new candidates"
        )
        try:
            self.matching_task.append_candidates_from_agent(
                source_attribute, candidates
            )
            logger.info(
                f"🧰Tool result: appended {len(candidates)} candidates for "
                f"source attribute: {source_attribute}"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to append candidates: {str(e)}")
            return False
