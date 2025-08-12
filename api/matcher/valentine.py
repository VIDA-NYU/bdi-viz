from typing import Any, Dict, List, Tuple

import pandas as pd
from valentine import valentine_match
from valentine.algorithms import BaseMatcher as ValentineBaseMatcher
from valentine.algorithms import (
    Coma,
    Cupid,
    DistributionBased,
    JaccardDistanceMatcher,
    SimilarityFlooding,
)
from valentine.algorithms.jaccard_distance import StringDistanceFunction

from .utils import BaseMatcher


class ValentineMatcher(BaseMatcher):
    def __init__(self, name: str, weight: int = 1) -> None:
        super().__init__(name, weight)

    def top_matches(
        self, source: pd.DataFrame, target: pd.DataFrame, top_k: int = 20, **kwargs
    ) -> List[Dict[str, Any]]:
        matcher = self._get_matcher_object(self.name)
        matches = valentine_match(source.astype(str), target.astype(str), matcher)

        matcher_candidates = self._layer_candidates_valentine(matches, self.name, top_k)
        return matcher_candidates

    def _layer_candidates_valentine(
        self,
        matches: Dict[Tuple[Tuple[str, str], Tuple[str, str]], float],
        matcher: str,
        top_k: int,
    ) -> List[Dict[str, Any]]:
        # group candidates by source column
        grouped_candidates = {}
        for key, score in matches.items():
            source_tuple, target_tuple = key
            source_col = source_tuple[1]
            candidate = {
                "sourceColumn": source_col,
                "targetColumn": target_tuple[1],
                "score": score,
                "matcher": matcher,
                "status": "idle",
            }
            grouped_candidates.setdefault(source_col, []).append(candidate)

        # filter top_k matches for each source column based on score
        layered_candidates = []
        for source_col, candidates in grouped_candidates.items():
            top_candidates = sorted(candidates, key=lambda x: x["score"], reverse=True)[
                :top_k
            ]
            layered_candidates.extend(top_candidates)

        return layered_candidates

    def _get_matcher_object(
        self, name: str, threshold_dist: float = 1.0
    ) -> ValentineBaseMatcher:
        name = name.lower()
        if name == "coma":
            return Coma()
        elif name == "cupid":
            return Cupid()
        elif name == "similarityflooding" or name == "similarity_flooding":
            return SimilarityFlooding()
        elif name == "jaccarddistancematcher" or name == "jaccard_distance_matcher":
            return JaccardDistanceMatcher(
                threshold_dist=threshold_dist,
                distance_fun=StringDistanceFunction.JaroWinkler,
            )
        elif name == "distributionbased" or name == "distribution_based":
            return DistributionBased()
        else:
            raise ValueError(f"Matcher {name} not found in allowed Valentine matchers")
