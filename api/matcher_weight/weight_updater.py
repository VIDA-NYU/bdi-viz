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
            matchers: Dict[str, Any]
                Dictionary where the key is the matcher name and the value is the matcher object.
            alpha: float
                Learning rate when a user accepts a candidate.
            beta: float
                Learning rate when a user rejects a candidate.
        """
        self.matchers = matchers
        self.alpha = alpha
        self.beta = beta
        self.candidates = self._preprocess_candidates(candidates)
        self._normalize_weights(reset=True)

    def update_matchers(self, matchers: Dict[str, Any]) -> Dict[str, Any]:
        self.matchers = matchers
        self._normalize_weights(reset=True)
        return self.matchers

    def update_weights(self, operation: str, source_column: str, target_column: str):
        """
        Update matcher weights based on user operation.
        Args:
            operation: "accept" or "reject"
            source_column: Source column name
            target_column: Target column name
        """
        if operation not in {"accept", "reject"}:
            logger.warning(f"Unknown operation '{operation}' for weight update.")
            return
        self._handle_update(operation, source_column, target_column)
        self._normalize_weights()

    def _handle_update(self, operation: str, source_column: str, target_column: str):
        """Handle accept/reject update in a unified way."""
        factor = self.alpha if operation == "accept" else -self.beta
        for matcher, candidates in self.candidates.items():
            if matcher not in self.matchers:
                continue
            for rank, (src, tgt, score) in enumerate(candidates):
                if src == source_column and tgt == target_column:
                    old_weight = self.matchers[matcher]["weight"]
                    delta = factor * score / (rank + 1)
                    self.matchers[matcher]["weight"] += delta
                    logger.info(
                        f"[{operation.capitalize()}] Matcher '{matcher}': "
                        f"weight {old_weight:.4f} -> {self.matchers[matcher]['weight']:.4f} "
                        f"(delta {delta:+.4f}, rank {rank}, score {score:.4f})"
                    )
                    break

    def _normalize_weights(self, reset: bool = False):
        total_weight = sum(matcher["weight"] for matcher in self.matchers.values())
        if reset or total_weight == 0:
            logger.warning(
                "Total matcher weight is zero. Resetting to uniform weights."
            )
            n = len(self.matchers)
            for matcher in self.matchers.values():
                matcher["weight"] = 1.0 / n if n else 1.0
        else:
            for matcher in self.matchers.values():
                matcher["weight"] /= total_weight

    def _preprocess_candidates(
        self, candidates: List[Dict[str, Any]]
    ) -> Dict[str, List[Tuple[str, str, float]]]:
        """Group and sort candidates by matcher and score."""
        processed = {}
        for candidate in candidates:
            matcher = candidate["matcher"]
            processed.setdefault(matcher, []).append(
                (
                    candidate["sourceColumn"],
                    candidate["targetColumn"],
                    candidate["score"],
                )
            )
        for matcher, cand_list in processed.items():
            processed[matcher] = sorted(cand_list, key=lambda x: x[2], reverse=True)
        return processed
