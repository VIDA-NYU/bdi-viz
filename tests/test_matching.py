import logging
import pytest
import pandas as pd
from unittest.mock import Mock, patch

logger = logging.getLogger("bdiviz_flask.sub")
logger.setLevel(logging.CRITICAL)


class TestMatchingTask:
    """Test the matching task functionality."""

    def test_get_candidates_success(
        self,
        session_manager,
        sample_source_csv,
        sample_target_csv,
    ):
        """Test successful matching task execution."""

        matching_task = session_manager.get_session("test_session").matching_task

        matching_task.update_dataframe(sample_source_csv, sample_target_csv)

        # assert task state
        task_state_initial = matching_task.get_task_state()
        assert task_state_initial["status"] == "idle"
        assert task_state_initial["progress"] == 0
        assert task_state_initial["current_step"] == "Task start..."
        assert task_state_initial["completed_steps"] == 0
        assert task_state_initial["logs"] == []

        candidates = matching_task.get_candidates()

        print(candidates)
        assert len(candidates) > 0

        # assert task state
        task_state_after_candidates = matching_task.get_task_state()
        assert task_state_after_candidates["status"] == "complete"
        assert task_state_after_candidates["progress"] == 100
        assert task_state_after_candidates["current_step"] == "Complete"
        assert task_state_after_candidates["completed_steps"] == 4

    def test_get_candidates_missing_files(self, session_manager):
        """Test matching task with missing files."""
        matching_task = session_manager.get_session("test_session").matching_task

        with pytest.raises(ValueError):
            matching_task.get_candidates()

    def test_get_candidates_filtered_by_nodes(
        self,
        session_manager,
        sample_source_csv,
        sample_target_csv,
    ):
        """Test matching task with filtered by nodes."""
        matching_task = session_manager.get_session("test_session").matching_task

        matching_task.update_dataframe(sample_source_csv, sample_target_csv)

        matching_task.set_nodes(["demographic"])
        candidates = matching_task.get_candidates()

        assert len(candidates) > 0

    def test_get_all_nodes(
        self,
        session_manager,
        sample_source_csv,
        sample_target_csv,
    ):
        """Test getting all nodes."""
        matching_task = session_manager.get_session("test_session").matching_task

        matching_task.update_dataframe(sample_source_csv, sample_target_csv)
        nodes = matching_task.get_all_nodes()

        assert len(nodes) == 2

    def test_candidate_manipulation(
        self,
        session_manager,
        sample_source_csv,
        sample_target_csv,
    ):
        """Test candidate manipulation."""
        matching_task = session_manager.get_session("test_session").matching_task

        matching_task.update_dataframe(sample_source_csv, sample_target_csv)
        candidates = matching_task.get_candidates()

        assert len(candidates) > 0

        # accept candidate
        candidate_to_accept = candidates[0]
        matching_task.apply_operation("accept", candidate_to_accept, [])

        candidates = matching_task.get_cached_candidates()
        accepted = False
        for candidate in candidates:
            if (
                candidate["sourceColumn"] == candidate_to_accept["sourceColumn"]
                and candidate["targetColumn"] == candidate_to_accept["targetColumn"]
            ):
                if candidate["status"] == "accepted":
                    accepted = True
        assert accepted

        # reject candidate
        candidate_to_reject = candidates[0]
        matching_task.apply_operation("reject", candidate_to_reject, [])

        candidates = matching_task.get_cached_candidates()
        rejected = False
        for candidate in candidates:
            if (
                candidate["sourceColumn"] == candidate_to_reject["sourceColumn"]
                and candidate["targetColumn"] == candidate_to_reject["targetColumn"]
            ):
                if candidate["status"] == "rejected":
                    rejected = True
        assert rejected

        # discard column
        column_to_discard = candidates[0]["sourceColumn"]
        matching_task.apply_operation("discard", candidates[0], [])

        candidates = matching_task.get_cached_candidates()
        discarded = True
        for candidate in candidates:
            if candidate["sourceColumn"] == column_to_discard:
                if candidate["status"] != "discarded":
                    discarded = False
        assert discarded

    def test_get_value_matches(
        self,
        session_manager,
        sample_source_csv,
        sample_target_csv,
    ):
        """Test getting value matches."""
        matching_task = session_manager.get_session("test_session").matching_task

        matching_task.update_dataframe(sample_source_csv, sample_target_csv)
        value_matches = matching_task.get_value_matches()
        print("value_matches", value_matches)
        assert len(value_matches) > 0

    def test_get_value_binning(
        self,
        session_manager,
        sample_source_csv,
        sample_target_csv,
    ):
        """Test value binning."""
        matching_task = session_manager.get_session("test_session").matching_task

        matching_task.update_dataframe(sample_source_csv, sample_target_csv)
        source_col = sample_source_csv.columns[0]
        value_binning = matching_task.get_source_value_bins(source_col)
        print("value_binning", value_binning)
        assert len(value_binning) == 2

        target_col = sample_target_csv.columns[0]
        value_binning = matching_task.get_target_value_bins(target_col)
        print("value_binning", value_binning)
        assert len(value_binning) == 2

    def test_get_unique_values(
        self,
        session_manager,
        sample_source_csv,
        sample_target_csv,
    ):
        """Test getting unique values."""
        matching_task = session_manager.get_session("test_session").matching_task

        matching_task.update_dataframe(sample_source_csv, sample_target_csv)
        source_col = sample_source_csv.columns[0]
        unique_values = matching_task.get_source_unique_values(source_col)
        print("unique_values", unique_values)
        assert len(unique_values) == 2

        target_col = sample_target_csv.columns[0]
        unique_values = matching_task.get_target_unique_values(target_col)
        print("unique_values", unique_values)
        assert len(unique_values) == 2

    def test_new_matcher(
        self,
        session_manager,
        sample_source_csv,
        sample_target_csv,
    ):
        """Test new matcher."""
        matching_task = session_manager.get_session("test_session").matching_task

        matching_task.update_dataframe(sample_source_csv, sample_target_csv)
        matchers = matching_task.get_candidates()

        matcher_name = "RapidFuzzMatcher"
        matcher_code = """
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
        ret = {}
        target_columns = target.columns
        for source_column in source.columns:
            ret[source_column] = {}
            matches = process.extract(
                source_column,
                target_columns,
                scorer=lambda x, y, score_cutoff: fuzz.ratio(x, y),
                processor=utils.default_process,
                limit=top_k,
            )
            exact_matches = process.extract(
                source_column,
                [match[0] for match in matches],
                scorer=lambda x, y, score_cutoff: fuzz.WRatio(x, y, score_cutoff=95),
                processor=utils.default_process,
                limit=top_k,
            )
            exact_matches = {match[0] for match in exact_matches if match[1] >= 95}

            for match in matches:
                if match[0] in exact_matches:
                    score = 1.0
                else:
                    score = match[1] / 100
                if score > 0:
                    ret[source_column][match[0]] = score
        return ret

    def _layer_candidates(
        self,
        matches: Dict[str, Dict[str, float]],
        matcher: str,
    ) -> List[Dict[str, Any]]:
        layered_candidates = []
        for source_column, target_columns in matches.items():
            for target_column, score in target_columns.items():
                candidate = {
                    "sourceColumn": source_column,
                    "targetColumn": target_column,
                    "score": score,
                    "matcher": matcher,
                    "status": "idle",
                }
            layered_candidates.append(candidate)
        return layered_candidates
"""
        matcher_params = {}
        error, matchers = matching_task.new_matcher(
            matcher_name, matcher_code, matcher_params
        )
        assert error is None
        assert len(matchers) == 3

        matchers = matching_task.get_matchers()
        for matcher in matchers:
            if matcher["name"] == matcher_name:
                assert matcher["code"] == matcher_code
                assert matcher["params"] == matcher_params
                break
        else:
            assert False
