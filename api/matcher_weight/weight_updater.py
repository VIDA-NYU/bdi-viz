import logging
from typing import Any, Dict, List, Tuple

logger = logging.getLogger("bdiviz_flask.sub")


class WeightUpdater:
    def __init__(
        self,
        matchers: Dict[str, Any],
        candidates: List[Dict[str, Any]],
        alpha: float = 0.5,
        beta: float = 0.5,
    ):
        """
        Args:
            matchers (Dict[str, Any]): A dictionary where the key is the matcher name and the value is the matcher object.
            alpha (float): Learning rate when a user accepts a candidate.
            beta (float): Learning rate when a user rejects a candidate.
        """
        self.matchers = matchers
        self.alpha = alpha
        self.beta = beta

        self.candidates = self._preprocess_candidates(candidates)
        self._normalize_weights()

    def update_weights(self, operation: str, source_column: str, target_column: str):
        """
        Args:
            operation (str): The operation to perform, either "accept" or "reject".
            source_column (str): The source column name.
            target_column (str): The target column name.
        """

        if operation == "accept":
            self._handle_accept(source_column, target_column)
        elif operation == "reject":
            self._handle_reject(source_column, target_column)

    def _handle_accept(self, source_column: str, target_column: str):
        for matcher, candidates in self.candidates.items():
            if matcher not in self.matchers:
                continue
            for rank, candidate in enumerate(candidates):
                if candidate[0] == source_column and candidate[1] == target_column:
                    logger.info(
                        f"[Accept] Updating weight for matcher {matcher} from {self.matchers[matcher]['weight']}....."
                    )
                    self.matchers[matcher]["weight"] += (
                        self.alpha * candidate[2] / (rank + 1)
                    )
                    logger.info(
                        f"[Accept] Updated weight for matcher {matcher} to {self.matchers[matcher]['weight']}"
                    )
                    break
        self._normalize_weights()

    def _handle_reject(self, source_column: str, target_column: str):
        for matcher, candidates in self.candidates.items():
            if matcher not in self.matchers:
                continue
            for rank, candidate in enumerate(candidates):
                if candidate[0] == source_column and candidate[1] == target_column:
                    logger.info(
                        f"[Reject] Updating weight for matcher {matcher} from {self.matchers[matcher]['weight']}....."
                    )
                    self.matchers[matcher]["weight"] -= (
                        self.beta * candidate[2] / (rank + 1)
                    )
                    logger.info(
                        f"[Reject] Updated weight for matcher {matcher} to {self.matchers[matcher]['weight']}"
                    )
                    break
        self._normalize_weights()

    def _normalize_weights(self):
        total_weight = sum([matcher["weight"] for matcher in self.matchers.values()])
        for matcher in self.matchers.values():
            matcher["weight"] /= total_weight

    def _preprocess_candidates(
        self, candidates: List[Dict[str, Any]]
    ) -> Dict[str, List[Tuple[str, str, float]]]:
        processed_candidates = {}
        for candidate in candidates:
            matcher = candidate["matcher"]
            if matcher not in processed_candidates:
                processed_candidates[matcher] = []
            processed_candidates[matcher].append(
                [
                    candidate["sourceColumn"],
                    candidate["targetColumn"],
                    candidate["score"],
                ]
            )

        for matcher, candidates in processed_candidates.items():
            processed_candidates[matcher] = sorted(
                candidates, key=lambda x: x[2], reverse=True
            )

        return processed_candidates
