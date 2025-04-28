import hashlib
import json
import logging
import os
import threading
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors

from .candidate_quadrants import CandidateQuadrants
from .clusterer.embedding_clusterer import EmbeddingClusterer
from .matcher.bdikit import BDIKitMatcher

# from .matcher.difflib import DiffLibMatcher
from .matcher.rapidfuzz_value import RapidFuzzValueMatcher
from .matcher_weight.weight_updater import WeightUpdater
from .utils import (
    is_candidate_for_category,
    load_gdc_ontology,
    load_ontology,
    load_property,
)

logger = logging.getLogger("bdiviz_flask.sub")

DEFAULT_PARAMS = {
    "encoding_mode": "header_values_verbose",
    "sampling_mode": "mixed",
    "sampling_size": 10,
    "topk": 20,
    "include_strsim_matches": False,
    "include_embedding_matches": True,
    "embedding_threshold": 0.1,
    "include_equal_matches": True,
    "use_bp_reranker": True,
    "use_gpt_reranker": False,
}


class MatchingTask:
    def __init__(
        self,
        top_k: int = 20,
        clustering_model="michiyasunaga/BioLinkBERT-base",
        update_matcher_weights: bool = True,
    ) -> None:
        self.lock = threading.Lock()
        self.top_k = top_k

        self.candidate_quadrants = None
        self.matchers = {
            # "jaccard_distance_matcher": ValentineMatcher("jaccard_distance_matcher"),
            # "ct_learning": BDIKitMatcher("ct_learning"),
            "magneto_ft": BDIKitMatcher("magneto_ft"),
            "magneto_zs": BDIKitMatcher("magneto_zs"),
        }

        self.clustering_model = clustering_model
        self.source_df = None
        self.target_df = None
        self._initialize_cache()
        self.history = UserOperationHistory()

        self.update_matcher_weights = update_matcher_weights

        # Task state tracking
        self._initialize_task_state()

    def _initialize_cache(self) -> None:
        self.cached_candidates = {
            "source_hash": None,
            "target_hash": None,
            "candidates": [],
            "source_clusters": None,
            "value_matches": {},
        }

    def _initialize_task_state(self) -> None:
        self.task_state = {
            "status": "idle",
            "progress": 0,
            "current_step": "",
            "total_steps": 4,
            "completed_steps": 0,
            "logs": [],
        }

    def update_dataframe(
        self, source_df: Optional[pd.DataFrame], target_df: Optional[pd.DataFrame]
    ):
        with self.lock:
            if source_df is not None:
                self.source_df = source_df
                logger.info("[MatchingTask] Source dataframe updated!")
            if target_df is not None:
                self.target_df = target_df
                logger.info("[MatchingTask] Target dataframe updated!")

        self._initialize_value_matches()

    def get_candidates(self, is_candidates_cached: bool = True) -> Dict[str, list]:
        with self.lock:
            if self.source_df is None or self.target_df is None:
                raise ValueError("Source and Target dataframes must be provided.")

            # Initialize task state
            self._update_task_state(
                status="running",
                progress=0,
                current_step="Computing hashes",
                completed_steps=0,
            )

            source_hash, target_hash = self._compute_hashes()
            self._update_task_state(
                progress=25, current_step="Checking cache", completed_steps=1
            )

            cached_json = self._import_cache_from_json()
            candidates = []

            if self._is_cache_valid(cached_json, source_hash, target_hash):
                self.cached_candidates = cached_json
                candidates = cached_json["candidates"]
                self._update_task_state(
                    progress=75, current_step="Using cached results", completed_steps=3
                )
            elif is_candidates_cached and self._is_cache_valid(
                self.cached_candidates, source_hash, target_hash
            ):
                candidates = self.get_cached_candidates()
                self._update_task_state(
                    progress=75,
                    current_step="Using in-memory cached results",
                    completed_steps=3,
                )
            else:
                self._update_task_state(
                    progress=50, current_step="Generating candidates", completed_steps=2
                )
                candidates = self._generate_candidates(
                    source_hash, target_hash, is_candidates_cached
                )

            if self.update_matcher_weights:
                self._update_task_state(current_step="Updating matcher weights")
                self.weight_updater = WeightUpdater(
                    matchers=self.matchers,
                    candidates=candidates,
                    alpha=0.1,
                    beta=0.1,
                )
                self._update_task_state(
                    progress=100,
                    current_step="Complete",
                    status="complete",
                    completed_steps=4,
                )

            # Save task state after completion
            self._save_task_state()

            return candidates

    def _update_task_state(self, **kwargs) -> None:
        """Update task state with provided values"""
        for key, value in kwargs.items():
            if key in self.task_state:
                self.task_state[key] = value

        # Add log entry for step changes
        if "current_step" in kwargs:
            log_entry = {
                "timestamp": pd.Timestamp.now().isoformat(),
                "step": kwargs["current_step"],
                "progress": self.task_state["progress"],
            }
            self.task_state["logs"].append(log_entry)
            logger.info(
                f"Task step: {kwargs['current_step']} - Progress: {self.task_state['progress']}%"
            )

        # Save task state after each update
        self._save_task_state()

    def _save_task_state(self) -> None:
        """Save task state to a JSON file"""
        task_state_path = os.path.join(os.path.dirname(__file__), "task_state.json")
        try:
            with open(task_state_path, "w") as f:
                json.dump(self.task_state, f, indent=4)
        except Exception as e:
            logger.error(f"Failed to save task state: {str(e)}")

    def _load_task_state(self) -> Optional[Dict[str, Any]]:
        """Load task state from a JSON file if it exists"""
        task_state_path = os.path.join(os.path.dirname(__file__), "task_state.json")
        if os.path.exists(task_state_path):
            try:
                with open(task_state_path, "r") as f:
                    loaded_state = json.load(f)
                return loaded_state
            except Exception as e:
                logger.error(f"Failed to load task state: {str(e)}")
        return None

    def get_task_state(self) -> Dict[str, Any]:
        """Return the current state of the task for monitoring progress"""
        return self.task_state

    def update_exact_matches(self) -> List[Dict[str, Any]]:
        return self.get_candidates()

    def _compute_hashes(self) -> Tuple[int, int]:
        source_hash = int(
            hashlib.sha256(
                pd.util.hash_pandas_object(self.source_df, index=True).values
            ).hexdigest(),
            16,
        )
        target_hash = int(
            hashlib.sha256(
                pd.util.hash_pandas_object(self.target_df, index=True).values
            ).hexdigest(),
            16,
        )
        return source_hash, target_hash

    def _is_cache_valid(
        self, cache: Dict[str, Any], source_hash: int, target_hash: int
    ) -> bool:
        return (
            cache
            and cache["source_hash"] == source_hash
            and cache["target_hash"] == target_hash
        )

    def _generate_candidates(
        self, source_hash: int, target_hash: int, is_candidates_cached: bool
    ) -> Dict[str, list]:
        # Define generation steps for better logging
        generation_steps = [
            "Generating embeddings",
            "Clustering source columns",
            "Identifying candidate quadrants",
            "Running matchers",
            "Generating value matches",
        ]

        self._update_task_state(current_step=generation_steps[0])

        embedding_clusterer = EmbeddingClusterer(
            params={
                "embedding_model": self.clustering_model,
                "topk": self.top_k,
                **DEFAULT_PARAMS,
            }
        )

        source_embeddings = embedding_clusterer.get_source_embeddings(
            source_df=self.source_df
        )
        self._update_task_state(progress=60)

        # Step 2: Cluster source columns
        self._update_task_state(current_step=generation_steps[1])
        source_clusters = self._generate_source_clusters(source_embeddings)
        self._update_task_state(progress=70)

        # Step 3: Apply candidate quadrants
        self._update_task_state(current_step=generation_steps[2])
        self.candidate_quadrants = CandidateQuadrants(
            source=self.source_df,
            target=self.target_df,
            top_k=self.top_k,
        )

        layered_candidates = []
        for source_column in self.source_df.columns:
            layered_candidates.extend(
                self.candidate_quadrants.get_easy_target_json(source_column)
            )

        self._update_task_state(progress=80)

        # Step 4: Run matchers
        self._update_task_state(current_step=generation_steps[3])
        total_matchers = len(self.matchers)
        for i, (matcher_name, matcher_instance) in enumerate(self.matchers.items()):
            logger.info(f"Running matcher: {matcher_name}")
            self._update_task_state(current_step=f"Running matcher: {matcher_name}")
            matcher_candidates = matcher_instance.top_matches(
                source=self.source_df,
                target=self.target_df,
                top_k=self.top_k,
            )
            layered_candidates.extend(matcher_candidates)
            # Calculate progress based on matcher position
            matcher_progress = 80 + ((i + 1) / total_matchers * 10)
            self._update_task_state(
                progress=matcher_progress,
                current_step=f"Completed matcher: {matcher_name} with {len(matcher_candidates)} candidates",
            )

        # easy_match_keys = {
        #     (candidate["sourceColumn"], candidate["targetColumn"])
        #     for candidate in layered_candidates
        #     if candidate["matcher"] == "candidate_quadrants"
        # }
        # layered_candidates = [
        #     candidate
        #     for candidate in layered_candidates
        #     if candidate["matcher"] == "candidate_quadrants"
        #     or (candidate["sourceColumn"], candidate["targetColumn"])
        #     not in easy_match_keys
        # ]
        self._update_task_state(progress=90)

        # Step 5: Generate value matches
        self._update_task_state(current_step=generation_steps[4])
        for candidate in layered_candidates:
            self._generate_value_matches(
                candidate["sourceColumn"], candidate["targetColumn"]
            )

        if is_candidates_cached:
            self.cached_candidates = {
                "source_hash": source_hash,
                "target_hash": target_hash,
                "candidates": layered_candidates,
                "source_clusters": source_clusters,
                "value_matches": self.cached_candidates["value_matches"],
            }
            self._export_cache_to_json(self.cached_candidates)

        return layered_candidates

    def _generate_source_clusters(
        self, source_embeddings: np.ndarray
    ) -> Dict[str, List[str]]:
        knn = NearestNeighbors(
            n_neighbors=min(10, len(self.source_df.columns)), metric="cosine"
        )
        knn.fit(source_embeddings)
        clusters_idx = [
            knn.kneighbors([source_embedding], return_distance=False)[0]
            for source_embedding in source_embeddings
        ]

        clusters = {
            self.source_df.columns[i]: [
                self.source_df.columns[idx] for idx in cluster_idx
            ]
            for i, cluster_idx in enumerate(clusters_idx)
        }
        return clusters

    def _generate_gdc_ontology(self) -> List[Dict]:
        candidates = self.get_cached_candidates()
        return load_gdc_ontology(candidates)

    def _generate_ontology(self) -> List[Dict]:
        candidates = self.get_cached_candidates()
        return load_ontology(candidates)

    def _initialize_value_matches(self) -> None:
        self.cached_candidates["value_matches"] = {}
        for source_col in self.source_df.columns:
            source_unique_values = []
            # if the numeric type can be treated as categorical, still generate value matches
            if pd.api.types.is_numeric_dtype(self.source_df[source_col].dtype):
                if is_candidate_for_category(self.source_df[source_col]):
                    source_unique_values = self.get_source_unique_values(
                        source_col, n=300
                    )
            else:
                source_unique_values = self.get_source_unique_values(source_col)

            self.cached_candidates["value_matches"][source_col] = {
                "source_unique_values": source_unique_values,
                "source_mapped_values": source_unique_values,
                "targets": {},
            }

    def _generate_value_matches(self, source_column: str, target_column: str) -> None:
        if (
            target_column
            in self.cached_candidates["value_matches"][source_column]["targets"]
        ):
            return

        source_values = self.cached_candidates["value_matches"][source_column][
            "source_unique_values"
        ]
        if not source_values:  # Source unique values are empty
            return

        target_values = self.get_target_unique_values(target_column)

        match_results = {
            "From": [],
            "To": [],
        }
        # matcher = DiffLibMatcher("diff_matcher")
        matcher_results = RapidFuzzValueMatcher.top_value_matches(
            source_values, target_values, top_k=1
        )

        # re-order as per source_values
        matcher_results = sorted(
            matcher_results,
            key=lambda x: source_values.index(x["sourceValue"])
            if x["sourceValue"] in source_values
            else len(source_values),
        )

        for result in matcher_results:
            source_value = result["sourceValue"]
            target_value = result["targetValue"]
            match_results["From"].append(source_value)
            match_results["To"].append(target_value)

        self.cached_candidates["value_matches"][source_column]["targets"][
            target_column
        ] = list(match_results["To"])

    def accept_cached_candidate(self, candidate: Dict[str, Any]) -> None:
        cached_candidates = self.get_cached_candidates()
        for cached_candidate in cached_candidates:
            if (
                cached_candidate["sourceColumn"] == candidate["sourceColumn"]
                and cached_candidate["targetColumn"] == candidate["targetColumn"]
            ):
                cached_candidate["status"] = "accepted"
        self.set_cached_candidates(cached_candidates)

    def reject_cached_candidate(self, candidate: Dict[str, Any]) -> None:
        cached_candidates = self.get_cached_candidates()
        for cached_candidate in cached_candidates:
            if (
                cached_candidate["sourceColumn"] == candidate["sourceColumn"]
                and cached_candidate["targetColumn"] == candidate["targetColumn"]
            ):
                cached_candidate["status"] = "rejected"
        self.set_cached_candidates(cached_candidates)

    def discard_cached_column(self, source_col: str) -> None:
        cached_candidates = self.get_cached_candidates()
        for candidate in cached_candidates:
            if candidate["sourceColumn"] == source_col:
                candidate["status"] = "discarded"
        self.set_cached_candidates(cached_candidates)

    def append_cached_column(self, column_name: str) -> None:
        cached_candidates = self.get_cached_candidates()
        for candidate in cached_candidates:
            if (
                column_name == candidate["sourceColumn"]
                and candidate["status"] == "discarded"
            ):
                if candidate["matcher"] in ["candidate_quadrants"]:
                    candidate["status"] = "accepted"
                else:
                    candidate["status"] = "idle"

        self.set_cached_candidates(cached_candidates)

    def to_frontend_json(self) -> dict:
        return {
            "candidates": self.get_cached_candidates(),  # sourceColumn, targetColumn, score, matcher
            "sourceClusters": self._format_source_clusters_for_frontend(),
            "matchers": self.get_matchers(),
        }

    def unique_values_to_frontend_json(self) -> dict:
        return {
            "sourceUniqueValues": [
                {
                    "sourceColumn": source_col,
                    "uniqueValues": self.get_source_value_bins(source_col),
                }
                for source_col in self.source_df.columns
            ],
            "targetUniqueValues": [
                {
                    "targetColumn": target_col,
                    "uniqueValues": self.get_target_value_bins(target_col),
                }
                for target_col in self.target_df.columns
            ],
        }

    def value_matches_to_frontend_json(self) -> List[Dict[str, any]]:
        value_matches = self.cached_candidates["value_matches"]
        ret_json = []
        for source_col, source_items in value_matches.items():
            source_json = {
                "sourceColumn": source_col,
                "sourceValues": source_items["source_unique_values"],
                "sourceMappedValues": source_items["source_mapped_values"],
                "targets": [],
            }
            for target_col, target_unique_values in source_items["targets"].items():
                source_json["targets"].append(
                    {
                        "targetColumn": target_col,
                        "targetValues": target_unique_values,
                    }
                )
            ret_json.append(source_json)
        return ret_json

    def _format_source_clusters_for_frontend(self) -> List[Dict[str, Any]]:
        source_clusters = self.get_cached_source_clusters()
        return [
            {"sourceColumn": source_col, "cluster": cluster}
            for source_col, cluster in source_clusters.items()
        ]

    def _export_cache_to_json(self, json_obj: Dict) -> None:
        output_path = os.path.join(os.path.dirname(__file__), "matching_results.json")
        with open(output_path, "w") as f:
            json.dump(json_obj, f, indent=4)

    def _import_cache_from_json(self) -> Optional[Dict]:
        output_path = os.path.join(os.path.dirname(__file__), "matching_results.json")
        if os.path.exists(output_path):
            with open(output_path, "r") as f:
                return json.load(f)

    def _bucket_column(self, df: pd.DataFrame, col: str) -> List[Dict[str, Any]]:
        col_obj = df[col].dropna()
        if col_obj.dtype in ["object", "category", "bool"]:
            counter = col_obj.value_counts()[:10].to_dict()
            return [
                {"value": str(key), "count": int(value)}
                for key, value in counter.items()
                if value >= 1
            ]
        elif col_obj.dtype in ["int64", "float64"]:
            col_obj = col_obj.dropna()  # Drop NaN values
            if len(col_obj) == 0:
                return []
            unique_vals = col_obj.unique()
            # If the integer column has few unique values, treat it as categorical
            if col_obj.dtype == "int64" and len(unique_vals) <= 10:
                counter = col_obj.value_counts().sort_index()
                return [
                    {"value": str(val), "count": int(count)}
                    for val, count in counter.items()
                ]
            else:
                min_val = col_obj.min()
                max_val = col_obj.max()
                bins = np.linspace(min_val, max_val, num=10)
                counter = np.histogram(col_obj, bins=bins)[0]
                if col_obj.dtype == "float64":
                    return [
                        {
                            "value": f"{bins[i]:.2f}-{bins[i+1]:.2f}",
                            "count": int(counter[i]),
                        }
                        for i in range(len(counter))
                    ]
                else:
                    return [
                        {
                            "value": f"{int(bins[i])}-{int(bins[i+1])}",
                            "count": int(counter[i]),
                        }
                        for i in range(len(counter))
                    ]
        else:
            logger.warning(f"Column {col} is of type {col_obj.dtype}.")
            return []

    def undo(self) -> Optional["UserOperation"]:
        logger.info("Undoing last operation...")
        operation = self.history.undo_last_operation()
        if operation:
            self.undo_operation(
                operation.operation, operation.candidate, operation.references
            )
            return operation._json_serialize()
        return None

    def redo(self) -> Optional["UserOperation"]:
        logger.info("Redoing last operation...")
        operation = self.history.redo_last_operation()
        if operation:
            self.apply_operation(
                operation.operation, operation.candidate, operation.references
            )
            return operation._json_serialize()
        return None

    def apply_operation(
        self,
        operation: str,
        candidate: Dict[str, Any],
        references: List[Dict[str, Any]],
    ) -> None:
        logger.info(f"Applying operation: {operation}, on candidate: {candidate}...")

        candidates = self.get_cached_candidates()
        if self.update_matcher_weights:
            self.weight_updater.update_weights(
                operation, candidate["sourceColumn"], candidate["targetColumn"]
            )

        # Add operation to history
        self.history.add_operation(UserOperation(operation, candidate, references))

        if operation == "accept":
            self.accept_cached_candidate(candidate)
            # self.set_cached_candidates(
            #     [
            #         cached_candidate
            #         for cached_candidate in candidates
            #         if (cached_candidate["sourceColumn"] != candidate["sourceColumn"])
            #         or (cached_candidate["targetColumn"] == candidate["targetColumn"])
            #     ] + [candidate]
            # )
        elif operation == "reject":
            self.reject_cached_candidate(candidate)
            # self.set_cached_candidates(
            #     [
            #         cached_candidate
            #         for cached_candidate in candidates
            #         if not (
            #             cached_candidate["sourceColumn"] == candidate["sourceColumn"]
            #             and cached_candidate["targetColumn"]
            #             == candidate["targetColumn"]
            #         )
            #     ]
            # )
        elif operation == "discard":
            self.discard_cached_column(candidate["sourceColumn"])
        else:
            raise ValueError(f"Operation {operation} not supported.")

    def undo_operation(
        self,
        operation: str,
        candidate: Dict[str, Any],
        references: List[Dict[str, Any]],
    ) -> None:
        logger.info(f"Undoing operation: {operation}, on candidate: {candidate}... \n")

        # candidates = self.get_cached_candidates()

        # if operation in ["accept", "reject", "discard"]:
        #     self.set_cached_candidates(
        #         [
        #             c
        #             for c in candidates
        #             if c["sourceColumn"] != candidate["sourceColumn"]
        #         ]
        #         + references
        #     )
        last_status = candidate["status"]
        if operation in ["accept", "reject"]:
            candidate["status"] = last_status
            self.update_cached_candidate(candidate)
        elif operation == "discard":
            self.append_cached_column(candidate["sourceColumn"])
        else:
            raise ValueError(f"Operation {operation} not supported.")

    def get_source_df(self) -> pd.DataFrame:
        return self.source_df

    def get_target_df(self) -> pd.DataFrame:
        return self.target_df

    def get_source_value_bins(self, source_col: str) -> List[Dict[str, Any]]:
        if self.source_df is None or source_col not in self.source_df.columns:
            raise ValueError(
                f"Source column {source_col} not found in the source dataframe."
            )
        return self._bucket_column(self.source_df, source_col)

    def get_source_unique_values(self, source_col: str, n: int = 20) -> List[str]:
        if self.source_df is None or source_col not in self.source_df.columns:
            raise ValueError(
                f"Source column {source_col} not found in the source dataframe."
            )
        # if pd.api.types.is_numeric_dtype(self.source_df[source_col].dtype):
        #     return []
        return sorted(
            list(self.source_df[source_col].dropna().unique().astype(str)[:n])
        )

    def get_target_value_bins(self, target_col: str) -> List[Dict[str, Any]]:
        if self.target_df is None or target_col not in self.target_df.columns:
            raise ValueError(
                f"Target column {target_col} not found in the target dataframe."
            )
        return self._bucket_column(self.target_df, target_col)

    def get_target_unique_values(self, target_col: str, n: int = 300) -> List[str]:
        if self.target_df is None or target_col not in self.target_df.columns:
            raise ValueError(
                f"Target column {target_col} not found in the target dataframe."
            )
        # if pd.api.types.is_numeric_dtype(self.target_df[target_col].dtype):
        #     return []
        target_unique_values = self.target_df[target_col].dropna().unique()
        if len(target_unique_values) > 0:
            return list(target_unique_values.astype(str)[:n])

        target_values = []
        target_description = load_property(target_col)
        if target_description is None:
            logger.warning(f"Target column {target_col} not found in GDC properties.")
        else:
            if "enum" in target_description:
                target_enum = target_description["enum"]
                if target_enum is not None:
                    # if len(target_enum) > n:
                    #     target_values = random.sample(target_enum, n)
                    # else:
                    target_values = target_enum
        return [str(target_value) for target_value in target_values] or list(
            target_unique_values.astype(str)[:n]
        )

    def get_cached_candidates(self) -> List[Dict[str, Any]]:
        return self.cached_candidates["candidates"]

    def set_cached_candidates(self, candidates: List[Dict[str, Any]]) -> None:
        self.cached_candidates["candidates"] = candidates

    def get_value_matches(self) -> Dict[str, Dict[str, Any]]:
        return self.cached_candidates["value_matches"]

    def update_cached_candidate(self, candidate: List[Dict[str, Any]]) -> None:
        candidates = self.get_cached_candidates()
        for index, c in enumerate(candidates):
            if (
                c["sourceColumn"] == candidate["sourceColumn"]
                and c["targetColumn"] == candidate["targetColumn"]
            ):
                candidates[index]["status"] = candidate["status"]
        self.set_cached_candidates(candidates)

    def get_cached_source_clusters(self) -> Dict[str, List[str]]:
        return self.cached_candidates["source_clusters"] or {}

    def get_matchers(self) -> List[Dict[str, any]]:
        return [
            {"name": item.name, "weight": item.weight}
            for key, item in self.matchers.items()
        ]

    def get_accepted_candidates(self) -> pd.DataFrame:
        candidates_set = set()
        for candidate in self.get_cached_candidates():
            if candidate["status"] == "accepted":
                candidates_set.add(
                    (candidate["sourceColumn"], candidate["targetColumn"])
                )

        target_columns = []
        ret_df = self.source_df.copy()
        for source_col, target_col in candidates_set:
            target_columns.append(target_col)
            ret_df[target_col] = self.source_df[source_col]

        return ret_df[target_columns]

    def get_accepted_mappings(self) -> List[Dict[str, str]]:
        """
        Export a json like structure for all accepted mappings:
        {
            "sourceColumn": "source_column_1",
            "targetColumn": "target_column_1",
            "valueMatches": [
                {
                    "from": "value1",
                    "to": "value2"
                },
                ...
            ]
        }
        """
        candidates_set = set()
        for candidate in self.get_cached_candidates():
            if candidate["status"] == "accepted":
                candidates_set.add(
                    (candidate["sourceColumn"], candidate["targetColumn"])
                )

        ret = []
        for source_col, target_col in candidates_set:
            if source_col not in self.get_value_matches():
                continue

            source_unique_values = self.get_value_matches()[source_col][
                "source_unique_values"
            ]
            source_mapped_values = self.get_value_matches()[source_col][
                "source_mapped_values"
            ]

            if target_col not in self.get_value_matches()[source_col]["targets"]:
                value_matches = []
            else:
                value_matches = self.get_value_matches()[source_col]["targets"][
                    target_col
                ]
            ret.append(
                {
                    "sourceColumn": source_col,
                    "targetColumn": target_col,
                    "valueMatches": [
                        {
                            "from": from_val,
                            "to": (
                                to_val
                                if source_mapped_values[index] == from_val
                                else source_mapped_values[index]
                            ),
                        }
                        for index, (from_val, to_val) in enumerate(
                            zip(source_unique_values, value_matches)
                        )
                    ],
                }
            )
        return ret

    def set_source_mapped_values(
        self, source_col: str, from_val: str, to_val: str
    ) -> None:
        self.cached_candidates["value_matches"][source_col]["source_mapped_values"] = [
            to_val if val == from_val else val
            for val in self.cached_candidates["value_matches"][source_col][
                "source_mapped_values"
            ]
        ]

    def set_source_value(self, column: str, from_val: str, to_val: str) -> None:
        logger.info(f"Setting value {from_val} to {to_val} in column {column}...")
        self.source_df[column] = self.source_df[column].replace(from_val, to_val)
        self.set_source_mapped_values(column, from_val, to_val)


class UserOperationHistory:
    def __init__(self) -> None:
        self.history: List["UserOperation"] = []
        self.redo_stack: List["UserOperation"] = []

    def add_operation(self, operation: "UserOperation") -> None:
        self.history.append(operation)
        self.redo_stack.clear()  # Clear redo stack on new operation

    def undo_last_operation(self) -> Optional["UserOperation"]:
        if self.history:
            operation = self.history.pop()
            self.redo_stack.append(operation)
            return operation
        return None

    def redo_last_operation(self) -> Optional["UserOperation"]:
        if self.redo_stack:
            operation = self.redo_stack.pop()
            return operation
        return None

    def get_history(self) -> List[Dict[str, Any]]:
        return self.history

    def export_history_for_frontend(self) -> List[Dict[str, Any]]:
        return [op._json_serialize() for op in self.history]


class UserOperation:
    def __init__(
        self,
        operation: str,
        candidate: Dict[str, Any],
        references: List[Dict[str, Any]],
    ) -> None:
        self.operation = operation
        self.candidate = candidate
        self.references = references

    def _json_serialize(self) -> Dict[str, Any]:
        return {
            "operation": self.operation,
            "candidate": self.candidate,
        }
