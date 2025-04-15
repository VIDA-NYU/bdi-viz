from typing import Any, Dict, List

import bdikit as bdi
import numpy as np
import pandas as pd
from bdikit.schema_matching.topk.magneto import MagnetoBase

from ..utils import download_model_pt
from .utils import BaseMatcher

ALLOWED_BDI_MATCHERS = [
    "ct_learning",
    "magneto_zs_bp",
    "magneto_ft_bp",
    "magneto_zs_llm",
    "magneto_ft_llm",
    "magneto_zs",
    "magneto_ft",
]

MAGNETO_FT_MODEL_URL = (
    "https://nyu.box.com/shared/static/g2d3r1isdxrrxdcvqfn2orqgjfneejz1.pth"
)

BDI_METHODS_ARGS = {
    "magneto_ft": {
        "embedding_model": download_model_pt(MAGNETO_FT_MODEL_URL, "magneto-gdc-v0.1"),
        "use_bp_reranker": False,
        "use_gpt_reranker": False,
    },
    "magneto_zs": {
        "use_bp_reranker": False,
        "use_gpt_reranker": False,
    },
    "magneto_ft_bp": {
        "embedding_model": download_model_pt(MAGNETO_FT_MODEL_URL, "magneto-gdc-v0.1"),
        "use_bp_reranker": True,
        "use_gpt_reranker": False,
    },
    "magneto_zs_bp": {"use_bp_reranker": True, "use_gpt_reranker": False},
    "magneto_ft_llm": {
        "embedding_model": download_model_pt(MAGNETO_FT_MODEL_URL, "magneto-gdc-v0.1"),
        "use_bp_reranker": False,
        "use_gpt_reranker": True,
    },
    "magneto_zs_llm": {"use_bp_reranker": False, "use_gpt_reranker": True},
}


class BDIKitMatcher(BaseMatcher):
    def __init__(self, name: str, weight: int = 1) -> None:
        if name not in ALLOWED_BDI_MATCHERS:
            raise ValueError(
                f"Matcher {name} not found in the list of allowed BDI matchers: {ALLOWED_BDI_MATCHERS}"
            )
        super().__init__(name, weight)

    def top_matches(
        self, source: pd.DataFrame, target: pd.DataFrame, top_k: int = 20, **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Get the top n matches for the given source column.

        Args:
            source_column (str): The source column name
            top_n (int): The number of top matches to return

        Returns:
            List[Dict[str, Any]]: A list of dictionaries with the following structure:
            [{"sourceColumn": "source_column_1", "targetColumn": "target_column_1", "score": 0.9, "matcher": "magneto_zs_bp"},
            {"sourceColumn": "source_column_1", "targetColumn": "target_column_15", "score": 0.7, "matcher": "magneto_zs_bp"}, ...]
        """
        method_args = BDI_METHODS_ARGS.get(self.name, {})
        method = MagnetoBase(kwargs=method_args)

        embedding_candidates = bdi.top_matches(
            source=source,
            target=target,
            top_k=top_k,
            method=method,
        )
        matcher_candidates = self._layer_candidates_bdi(embedding_candidates, self.name)
        return matcher_candidates

    @staticmethod
    def top_value_matches(
        source_values: List[str], target_values: List[str], top_k: int = 20, **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Finds the top matching values between two lists of strings based on a similarity metric."
        """

        ret = []
        best_matches = bdi.match_values(
            source=pd.DataFrame({"source": source_values}),
            target=pd.DataFrame({"target": target_values}),
            column_mapping=("source", "target"),
        )

        for source_v in source_values:
            source_top_k = []
            source_matches = best_matches[best_matches["source"] == source_v]
            for _, row in source_matches.iterrows():
                target_v = row["target"]
                similarity = row["similarity"]
                source_top_k.append(
                    {
                        "sourceValue": source_v,
                        "targetValue": "" if pd.isna(target_v) else target_v,
                        "score": similarity,
                    }
                )
            if not source_top_k:
                source_top_k.append(
                    {
                        "sourceValue": source_v,
                        "targetValue": "",
                        "score": 0,
                    }
                )
            ret.extend(source_top_k[:top_k])

        return ret

    def _layer_candidates_bdi(
        self, top_candidates: pd.DataFrame, matcher: str
    ) -> List[Dict[str, Any]]:
        layered_candidates = []
        for _, row in top_candidates.iterrows():
            candidate = {
                "sourceColumn": row["source"],
                "targetColumn": row["target"],
                "score": row["similarity"],
                "matcher": matcher,
                "status": "idle",
            }

            layered_candidates.append(candidate)
        return layered_candidates
