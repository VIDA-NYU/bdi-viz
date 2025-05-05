from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

from ..matcher.rapidfuzz import RapidFuzzMatcher
from ..matcher.rapidfuzz_value import RapidFuzzValueMatcher


class CandidateQuadrants:
    """
    We devide the candidates into 4 quadrants:
    1. High Column Similarity, High Value Similarity -> We think those are easy matches
    2. High Column Similarity, Low Value Similarity
    3. Low Column Similarity, High Value Similarity
    4. Low Column Similarity, Low Value Similarity -> We think those are unrelated columns
    """

    def __init__(
        self,
        source: pd.DataFrame,
        target: pd.DataFrame,
        top_k: int = 20,
        column_name_threshold: float = 0.7,
        value_threshold: float = 0.4,
    ) -> None:
        self.source = source
        self.target = target
        self.top_k = top_k
        self.column_name_threshold_high = column_name_threshold + 0.25
        self.column_name_threshold = column_name_threshold
        self.value_threshold_high = value_threshold + 0.2
        self.value_threshold = value_threshold

        # Lazy initialization of quadrants to reduce initial memory usage
        self._quadrants = None

    @property
    def quadrants(self) -> Dict[str, List[List[str]]]:
        # Lazy load quadrants only when needed
        if self._quadrants is None:
            self._quadrants = self._init_quadrants()
        return self._quadrants

    def _init_quadrants(self) -> Dict[str, List[List[str]]]:
        """
        # Below colname threshold
            [],  # Below value threshold
            [],  # Above value threshold
            # Above colname threshold
            [],  # Below value threshold
            [],  # Above value threshold
        """
        quadrants = {colname: [[] for _ in range(4)] for colname in self.source.columns}

        # Create matchers only when needed and release them after use
        col_matcher = RapidFuzzMatcher("quad_col_name")
        col_name_matches = col_matcher._get_matches(
            self.source, self.target, self.top_k
        )
        del col_matcher  # Release memory

        val_matcher = RapidFuzzValueMatcher("quad_value")
        value_matches = val_matcher._get_matches(self.source, self.target, self.top_k)
        del val_matcher  # Release memory

        for source_column in self.source.columns:
            col_name_matches_source = col_name_matches[source_column]
            value_matches_source = value_matches[source_column]

            # Use list comprehension instead of set operations for better memory usage
            all_targets = []
            for target_column in col_name_matches_source:
                all_targets.append(target_column)
            for target_column in value_matches_source:
                if target_column not in col_name_matches_source:
                    all_targets.append(target_column)

            for target_column in all_targets:
                col_score = col_name_matches_source.get(target_column, 0)
                val_score = value_matches_source.get(target_column, 0)
                is_col_high = col_score >= self.column_name_threshold
                is_val_high = val_score >= self.value_threshold
                quadrant_index = 2 * int(is_col_high) + int(is_val_high)
                quadrants[source_column][quadrant_index].append(
                    (target_column, col_score, val_score)
                )

        return quadrants

    def get_quadrant(
        self,
        source_column: str,
        is_col_name_high: bool,
        is_value_high: bool,
    ) -> List[Tuple[str, float, float]]:
        return self.quadrants[source_column][
            2 * int(is_col_name_high) + int(is_value_high)
        ]

    def get_easy_matches(
        self, source_column: str, is_very_high: bool = False
    ) -> List[str]:
        if is_very_high:
            # Use a more memory-efficient approach
            high_col_matches = set()
            for target_column, col_score, _ in self.get_quadrant(
                source_column, True, True
            ):
                if col_score >= self.column_name_threshold_high:
                    high_col_matches.add(target_column)

            for target_column, col_score, _ in self.get_quadrant(
                source_column, True, False
            ):
                if col_score >= self.column_name_threshold_high:
                    high_col_matches.add(target_column)

            # Only process value matches if needed
            if not self.source[source_column].isna().all():
                for target_column, _, val_score in self.get_quadrant(
                    source_column, True, True
                ):
                    if val_score >= self.value_threshold_high:
                        high_col_matches.add(target_column)

            return list(high_col_matches)

        # Simple case - just return the high-high quadrant
        return [
            target_column
            for target_column, _, _ in self.get_quadrant(source_column, True, True)
        ]

    def get_potential_matches(self, source_column: str) -> List[str]:
        easy_matches = set(self.get_easy_matches(source_column))

        # Only process non-empty columns
        if not self.source[source_column].isna().all():
            matches = self.get_quadrant(source_column, True, False) + self.get_quadrant(
                source_column, False, True
            )
        else:
            matches = self.get_quadrant(source_column, True, False)

        # More memory-efficient filtering
        result = []
        for target_column, _, _ in matches:
            if target_column not in easy_matches and target_column not in result:
                result.append(target_column)

        return result

    def get_unrelated_columns(self, source_column: str) -> List[str]:
        # More memory-efficient approach
        result = []
        seen = set()
        for target_column, _, _ in self.get_quadrant(source_column, False, False):
            if target_column not in seen:
                result.append(target_column)
                seen.add(target_column)
        return result

    def get_potential_target_df(self, source_column: str) -> pd.DataFrame:
        matches = self.get_potential_matches(source_column)
        if not matches:
            return None
        return self.target[matches]

    def get_potential_numeric_target_df(self) -> pd.DataFrame:
        # More efficient to select only numeric columns
        return self.target.select_dtypes(include=np.number)

    def get_easy_target_json(self, source_column: str) -> List[Dict[str, Any]]:
        easy_matches = self.get_easy_matches(source_column, True)
        return [
            {
                "sourceColumn": source_column,
                "targetColumn": target_column,
                "score": 1,
                "matcher": "candidate_quadrants",
                "status": "accepted",
            }
            for target_column in easy_matches
        ]
