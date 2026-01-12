import json
import logging
from typing import Any, Dict, List, Optional

from langchain.tools.base import StructuredTool
from pydantic import BaseModel, Field

from ..session_manager import SESSION_MANAGER

logger = logging.getLogger("bdiviz_flask.sub")


class TaskTools:
    """Tools for managing matching tasks, matchers, and operations."""

    def __init__(self, session_id: str = "default"):
        self.session_id = session_id

    def get_tools(self) -> List[StructuredTool]:
        """Return all task management tools."""
        return [
            self.start_matching_task_tool,
            self.create_matcher_task_tool,
            self.delete_matcher_tool,
            self.read_matcher_analysis_tool,
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
            description="""Start a new matching task with current source and target data.
                Optionally filter target by specific nodes. Returns task ID for status checking.""",
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
                    f"""🧰Tool error: create_matcher_task with name: {name}, code: {code[:100]}...,
                    params: {params} with error: {str(e)}"""
                )
                return f"Error starting matcher creation task: {str(e)}"

        return StructuredTool.from_function(
            func=_create_matcher_task,
            name="create_matcher_task",
            description="""Start a celery task to create a new custom matcher with specified code and parameters.
                Returns task ID for status checking.""",
            args_schema=CreateMatcherTaskInput,
        )

    @property
    def delete_matcher_tool(self) -> StructuredTool:
        """Tool to delete a custom matcher from the session."""

        class DeleteMatcherInput(BaseModel):
            name: str = Field(description="Name of the matcher to delete")

        def _delete_matcher(name: str) -> str:
            try:
                matching_task = SESSION_MANAGER.get_session(
                    self.session_id
                ).matching_task
                error, matchers = matching_task.delete_matcher(name)
                if error:
                    logger.error(
                        f"🧰Tool error: delete_matcher with name: {name} error: {error}"
                    )
                    return json.dumps({"status": "failed", "error": error}, indent=2)

                logger.info(f"🧰Tool called: delete_matcher with name: {name}")
                return json.dumps({"status": "success", "matchers": matchers}, indent=2)
            except Exception as e:
                logger.error(
                    f"🧰Tool error: delete_matcher with name: {name} error: {str(e)}"
                )
                return json.dumps({"status": "failed", "error": str(e)}, indent=2)

        return StructuredTool.from_function(
            func=_delete_matcher,
            name="delete_matcher",
            description="""Delete a custom matcher from the current session. Returns updated matcher list.""",
            args_schema=DeleteMatcherInput,
        )

    @property
    def read_matcher_analysis_tool(self) -> StructuredTool:
        """Tool to compute matcher analysis metrics from cached candidates."""

        class ReadMatcherAnalysisInput(BaseModel):
            matcher_names: Optional[List[str]] = Field(
                default=None, description="Optional list of matcher names to analyze"
            )
            include_disabled: bool = Field(
                default=False, description="Include disabled matchers in analysis"
            )

        def _read_matcher_analysis(
            matcher_names: Optional[List[str]] = None, include_disabled: bool = False
        ) -> str:
            matching_task = SESSION_MANAGER.get_session(self.session_id).matching_task
            candidates = matching_task.get_cached_candidates()
            matchers = matching_task.get_matchers()

            if not include_disabled:
                matchers = [m for m in matchers if m.get("enabled", True)]

            if matcher_names:
                matcher_names_set = set(matcher_names)
                matchers = [m for m in matchers if m.get("name") in matcher_names_set]

            ground_truth = []
            seen = set()
            for candidate in candidates:
                if candidate.get("status") != "accepted":
                    continue
                key = (candidate.get("sourceColumn"), candidate.get("targetColumn"))
                if key in seen:
                    continue
                ground_truth.append(candidate)
                seen.add(key)

            results = []
            for matcher in matchers:
                metrics = self._calculate_matcher_metrics(
                    matcher.get("name"), candidates, ground_truth
                )
                precision = metrics["precision"]
                total = metrics["mrr"] + precision + metrics["f1"]
                results.append(
                    {
                        "name": matcher.get("name"),
                        "enabled": matcher.get("enabled", True),
                        "weight": matcher.get("weight", 0),
                        "mrr": metrics["mrr"],
                        "recall": metrics["recall"],
                        "precision": precision,
                        "f1": metrics["f1"],
                        "total": total,
                        "candidateCount": metrics["candidate_count"],
                        "falsePositivesCount": metrics["false_pos_count"],
                        "falseNegativesCount": metrics["false_neg_count"],
                        "falsePositivesSample": metrics["false_pos_sample"],
                        "falseNegativesSample": metrics["false_neg_sample"],
                        "params": matcher.get("params", {}),
                        "code": matcher.get("code"),
                    }
                )

            payload = {
                "groundTruthCount": len(ground_truth),
                "matchers": results,
            }
            logger.info(f"🧰Tool called: read_matcher_analysis matchers={len(results)}")
            return json.dumps(payload, indent=2)

        return StructuredTool.from_function(
            func=_read_matcher_analysis,
            name="read_matcher_analysis",
            description="""Read matcher analysis metrics (MRR/precision/recall/F1/total) based on accepted ground truth.""",
            args_schema=ReadMatcherAnalysisInput,
        )

    @staticmethod
    def _calculate_matcher_metrics(
        matcher_name: str,
        candidates: List[Dict[str, Any]],
        ground_truth: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        matcher_candidates = [
            candidate
            for candidate in candidates
            if candidate.get("matcher") == matcher_name
        ]
        matcher_candidates = sorted(
            matcher_candidates, key=lambda c: c.get("score", 0), reverse=True
        )

        gt_source_columns = list(
            {candidate.get("sourceColumn") for candidate in ground_truth}
        )

        mrr = 0.0
        total_correct = 0
        false_pos = []
        false_neg = []

        for gt_source_column in gt_source_columns:
            gt_candidates = [
                candidate
                for candidate in ground_truth
                if candidate.get("sourceColumn") == gt_source_column
            ]
            if not gt_candidates:
                continue

            predict_candidates = [
                candidate
                for candidate in matcher_candidates
                if candidate.get("sourceColumn") == gt_source_column
            ]

            gt_covered = False
            gt_rank = -1
            for idx, candidate in enumerate(predict_candidates):
                if any(
                    gt_candidate.get("targetColumn") == candidate.get("targetColumn")
                    for gt_candidate in gt_candidates
                ):
                    gt_covered = True
                    gt_rank = idx
                    break

            for candidate in predict_candidates:
                if not any(
                    gt_candidate.get("targetColumn") == candidate.get("targetColumn")
                    for gt_candidate in gt_candidates
                ):
                    false_neg.append(candidate)

            for gt_candidate in gt_candidates:
                if not any(
                    candidate.get("targetColumn") == gt_candidate.get("targetColumn")
                    for candidate in predict_candidates
                ):
                    false_pos.append(gt_candidate)

            if gt_covered:
                total_correct += 1
                mrr += 1 / (gt_rank + 1)

        denom = len(gt_source_columns) or 1
        recall = total_correct / denom
        precision_denominator = total_correct + len(false_pos)
        precision = (
            total_correct / precision_denominator if precision_denominator else 0
        )
        f1 = (
            (2 * precision * recall) / (precision + recall)
            if (precision + recall) > 0
            else 0
        )
        mrr = mrr / denom

        return {
            "mrr": mrr,
            "recall": recall,
            "precision": precision,
            "f1": f1,
            "candidate_count": len(matcher_candidates),
            "false_pos_count": len(false_pos),
            "false_neg_count": len(false_neg),
            "false_pos_sample": false_pos[:5],
            "false_neg_sample": false_neg[:5],
        }

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
