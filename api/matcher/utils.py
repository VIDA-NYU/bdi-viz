from typing import Any, Dict, List

import pandas as pd


class BaseMatcher:
    def __init__(self, name: str, weight: int = 1) -> None:
        self.name = name
        self.weight = weight

    def top_matches(
        self, source: pd.DataFrame, target: pd.DataFrame, top_k: int = 20, **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Get the top n matches for the given source column.

        Args:
            source_column (str): The source column name
            top_n (int): The number of top matches to return

        Returns:
            Dict[str, List[Tuple[str, float]]]: A dictionary where the key is the source column name and the value, e.g.
            [{"sourceColumn": "source_column_1", "targetColumn": "target_column_1", "score": 0.9, "matcher": "magneto_zs_bp", "status": "idle"},
            {"sourceColumn": "source_column_1", "targetColumn": "target_column_15", "score": 0.7, "matcher": "magneto_zs_bp", "status": "idle"}, ...]
        """
        pass

    def top_value_matches(
        self,
        source_values: List[str],
        target_values: List[str],
        top_k: int = 20,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Finds the top matching values between two lists of strings based on a similarity metric.

        Args:
            source_values (List[str]): A list of source strings to compare.
            target_values (List[str]): A list of target strings to compare against.
            top_k (int, optional): The maximum number of top matches to return. Defaults to 20.
            **kwargs: Additional keyword arguments for customization or to pass to the similarity function.

        Returns:
            List[Dict[str, Any]]: A list of dictionaries containing the top matches, e.g.
            [{"sourceValue": "source_value_1", "targetValue": "target_value_1", "score": 0.9},
             {"sourceValue": "source_value_2", "targetValue": "target_value_2", "score": 0.8}, ...]
        """
        pass
