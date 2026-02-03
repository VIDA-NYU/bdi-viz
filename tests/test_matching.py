import pytest

from api.utils import TaskState


class TestMatchingTask:
    """Test the matching task functionality."""

    @pytest.fixture(autouse=True)
    def _manage_test_session(self, client):
        """Create and clean up a dedicated 'test_session' for this class.

        This uses the API endpoints to mirror real behavior and ensures the
        class's tests run with a predictable session lifecycle.
        """
        create_resp = client.post(
            "/api/session/create", json={"session_name": "test_session"}
        )
        assert create_resp.status_code == 200
        assert "test_session" in create_resp.get_json().get("sessions", [])

        yield

        delete_resp = client.post(
            "/api/session/delete", json={"session_name": "test_session"}
        )
        assert delete_resp.status_code == 200
        assert delete_resp.get_json().get("message") == "success"

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
        task_state = TaskState(
            task_type="matching",
            task_id="test_session",
            new_task=True,
        )
        task_state_print = task_state.get_task_state()
        assert task_state_print["progress"] == 0
        assert task_state_print["completed_steps"] == 0
        assert task_state_print["logs"] == []

        candidates = matching_task.get_candidates(task_state=task_state)

        print(candidates)
        assert len(candidates) > 0

        # assert task state
        task_state_after_candidates = TaskState(
            task_type="matching",
            task_id="test_session",
            new_task=False,
        ).get_task_state()
        assert task_state_after_candidates["status"] == "complete"
        assert task_state_after_candidates["progress"] == 100

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

    def test_get_candidates_with_groundtruth_pairs(
        self,
        session_manager,
        sample_source_csv,
        sample_target_csv,
    ):
        """When groundtruth_pairs are provided, only those pairs become candidates,
        marked as accepted with matcher 'groundtruth', and value matches are generated.
        """

        matching_task = session_manager.get_session("test_session").matching_task

        matching_task.update_dataframe(sample_source_csv, sample_target_csv)

        groundtruth_pairs = [("Gender", "gender"), ("Age", "age")]

        task_state = TaskState(
            task_type="matching",
            task_id="test_session",
            new_task=True,
        )

        candidates = matching_task.get_candidates(
            task_state=task_state, groundtruth_pairs=groundtruth_pairs
        )

        # Assert only the provided pairs are present
        pair_set = {(c["sourceColumn"], c["targetColumn"]) for c in candidates}
        assert pair_set == set(groundtruth_pairs)

        # Assert status and matcher
        for c in candidates:
            assert c["status"] == "accepted"
            assert c["matcher"] == "groundtruth"

        # Assert value matches were generated for these pairs
        value_matches = matching_task.get_value_matches()
        for src, tgt in groundtruth_pairs:
            assert src in value_matches
            assert tgt in value_matches[src]["targets"]

    def test_get_candidates_with_groundtruth_mappings(
        self,
        session_manager,
        sample_source_csv,
        sample_target_csv,
    ):
        """When groundtruth_mappings are provided, only the mapped pairs become candidates
        and the specified value mappings are applied without auto-matching.
        """

        matching_task = session_manager.get_session("test_session").matching_task

        matching_task.update_dataframe(sample_source_csv, sample_target_csv)

        groundtruth_mappings = [
            ("Gender", "gender", "Male", "male"),
            ("Gender", "gender", "Female", "female"),
        ]

        task_state = TaskState(
            task_type="matching",
            task_id="test_session",
            new_task=True,
        )

        candidates = matching_task.get_candidates(
            task_state=task_state,
            groundtruth_pairs=[],
            groundtruth_mappings=groundtruth_mappings,
        )

        # Assert only the provided pair is present once
        pair_set = {(c["sourceColumn"], c["targetColumn"]) for c in candidates}
        assert pair_set == {("Gender", "gender")}

        # Assert status and matcher
        for c in candidates:
            assert c["status"] == "accepted"
            assert c["matcher"] == "groundtruth"

        # Assert the provided value mappings are applied
        vm_all = matching_task.get_value_matches()
        assert "Gender" in vm_all
        assert "gender" in vm_all["Gender"]["targets"]
        src_uniques = vm_all["Gender"]["source_unique_values"]
        target_list = vm_all["Gender"]["targets"]["gender"]

        for s_val, t_val in [("Male", "male"), ("Female", "female")]:
            idx = src_uniques.index(s_val if s_val in src_uniques else str(s_val))
            assert target_list[idx] == t_val

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
        assert "RapidFuzzMatcher" in matchers

        matchers = matching_task.get_matchers()
        for matcher in matchers:
            if matcher["name"] == matcher_name:
                assert matcher["code"] == matcher_code
                assert matcher["params"] == matcher_params
                break
        else:
            assert False
