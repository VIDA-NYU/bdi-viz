import logging
import random
from typing import Any, Dict, List

import pandas as pd
from rapidfuzz import fuzz, process, utils

from ..utils import load_property
from .utils import BaseMatcher

logger = logging.getLogger("bdiviz_flask.sub")


class RapidFuzzValueMatcher(BaseMatcher):
    def __init__(self, name: str, weight: int = 1) -> None:
        super().__init__(name, weight)

    @staticmethod
    def top_value_matches(
        source_values: List[str], target_values: List[str], top_k: int = 20, **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Returns:
            List[Dict[str, Any]]: A list of dictionaries containing the top matches, e.g.
            [{"sourceValue": "source_value_1", "targetValue": "target_value_1", "score": 0.9},
             {"sourceValue": "source_value_2", "targetValue": "target_value_2", "score": 0.8}, ...]
        """

        ret = []
        for source_v in source_values:
            source_top_k = []
            best_matches = process.extract(
                str(source_v),
                [str(v) for v in target_values],
                scorer=fuzz.WRatio,
                processor=utils.default_process,
                limit=top_k,
            )
            if best_matches:
                for index, (target_v, similarity, _) in enumerate(best_matches):
                    source_top_k.append(
                        {
                            "sourceValue": source_v,
                            "targetValue": target_v,
                            "score": similarity,
                        }
                    )
            else:
                source_top_k.append(
                    {
                        "sourceValue": source_v,
                        "targetValue": "",
                        "score": 0,
                    }
                )
            ret.extend(source_top_k)
        return ret

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
        source_types = {
            col: self._determine_dtype(source, col) for col in source.columns
        }
        target_types = {
            col: self._determine_dtype_schema(col) for col in target.columns
        }

        source_uniques = {
            col: source[col].dropna().unique().astype(str).tolist()
            for col in source.columns
            if source_types[col] == "string"
        }

        target_uniques = {
            col: target[col].dropna().unique().astype(str).tolist()
            for col in target.columns
            if target_types[col] == "string"
        }

        for source_column in source.columns:
            ret[source_column] = {}
            source_scores = []
            for target_column in target.columns:
                s_type = source_types[source_column]
                t_type = target_types[target_column]

                if s_type != t_type:
                    score = 0
                elif s_type == "unknown":
                    score = 0
                elif s_type != "string":
                    score = 1.0
                else:
                    s_vals = source_uniques[source_column]
                    t_vals = target_uniques[target_column]
                    if not s_vals or not t_vals:
                        score = 0
                    else:
                        score = self._get_value_matching_score(s_vals, t_vals)
                if score > 0:
                    source_scores.append((target_column, score))
            source_scores = sorted(source_scores, key=lambda x: x[1], reverse=True)[
                :top_k
            ]
            for target_column, score in source_scores:
                ret[source_column][target_column] = score

        return ret

    def _get_value_matching_score(
        self, source_values: List, target_values: List
    ) -> float:
        """
        Calculate the value matching score between two columns
        """
        if len(target_values) >= 50:
            target_values = random.sample(target_values, 50)

        total_score = 0

        for source_v in source_values:
            scores = [
                fuzz.ratio(source_v, target_v, processor=utils.default_process) / 100
                for target_v in target_values
            ]
            max_score = max(scores)

            total_score += max_score
        return total_score / len(source_values)

    def _determine_dtype(self, df: pd.DataFrame, col: str) -> str:
        if pd.api.types.is_numeric_dtype(df[col]):
            return "numeric"
        elif pd.api.types.is_string_dtype(df[col]) or pd.api.types.is_object_dtype(
            df[col]
        ):
            return "string"
        elif pd.api.types.is_bool_dtype(df[col]):
            return "boolean"
        else:
            return "unknown"

    def _determine_dtype_schema(self, col: str) -> str:
        gdc_property = load_property(col)
        if gdc_property:
            type = gdc_property["type"]
            if type == "string" or type == "enum":
                return "string"
            elif type == "number" or type == "integer":
                return "numeric"
            elif type == "boolean":
                return "boolean"
            else:
                return "unknown"
        else:
            return "unknown"

    def _layer_candidates(
        self,
        matches: Dict[str, Dict[str, float]],
        matcher: str,
    ) -> List[Dict[str, Any]]:
        layered_candidates = []
        for source_col, target_scores in matches.items():
            for target_col, score in target_scores.items():
                candidate = {
                    "sourceColumn": source_col,
                    "targetColumn": target_col,
                    "score": score,
                    "matcher": matcher,
                    "status": "idle",
                }
                layered_candidates.append(candidate)

        return layered_candidates
