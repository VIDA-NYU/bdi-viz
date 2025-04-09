import os
import json
import logging
from typing import Any, Dict, List

import pandas as pd

from .utils import BaseMatcher

logger = logging.getLogger("bdiviz_flask.sub")

class MagnetoBioMatcher(BaseMatcher):
    def __init__(self, name: str, weight: int = 1) -> None:
        super().__init__(name, weight)
        self.result_json_path = os.path.join(
            os.path.dirname(__file__), "../resources/pdc_gdc_matches_verbose-two-phase.json"
        )
        self._load_result_json()

    def _load_result_json(self):
        if os.path.exists(self.result_json_path):
            with open(self.result_json_path, "r") as f:
                self.result_json = json.load(f)
        else:
            logger.warning(f"Result JSON file not found at {self.result_json_path}")
            self.result_json = {}

    def top_matches(
        self, source: pd.DataFrame, target: pd.DataFrame, top_k: int = 20, **kwargs
    ) -> List[Dict[str, Any]]:
        layered_candidates = []
        for source_col in source.columns:
            if source_col in self.result_json:
                source_matches = self.result_json[source_col]
                for match in source_matches[1:]:
                    target_col = match[0]
                    score = match[1]
                    if score >= 1:
                        layered_candidates.append({
                            "sourceColumn": source_col,
                            "targetColumn": target_col,
                            "score": score,
                            "matcher": self.name,
                            "status": "accepted",
                        })
                    elif score > 0:
                        layered_candidates.append({
                            "sourceColumn": source_col,
                            "targetColumn": target_col,
                            "score": score,
                            "matcher": self.name,
                            "status": "idle",
                        })
        return layered_candidates
    