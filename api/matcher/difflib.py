import difflib
from typing import Any, Dict, List

from .utils import BaseMatcher


class DiffLibMatcher(BaseMatcher):
    def __init__(self, name: str, weight: int = 1) -> None:
        super().__init__(name, weight)

    def top_value_matches(
        self,
        source_values: List[str],
        target_values: List[str],
        top_k: int = 20,
        **kwargs
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
            best_matches = difflib.get_close_matches(
                source_v.lower(),
                [val.lower() for val in target_values],
                n=1,
                cutoff=0.1,
            )
            if best_matches:
                for index, target_v_lower in enumerate(best_matches):
                    if index >= top_k:
                        break
                    best_match_index = [val.lower() for val in target_values].index(
                        target_v_lower
                    )
                    target_v = target_values[best_match_index]
                    similarity = 0
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
