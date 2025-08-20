import time
import concurrent.futures
import fcntl
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
    load_ontology_flat,
    load_property,
    verify_new_matcher,
    TaskState,
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
        session_name: str = "default",
        top_k: int = 20,
        # clustering_model="michiyasunaga/BioLinkBERT-base",
        clustering_model="sentence-transformers/all-mpnet-base-v2",
    ) -> None:
        self.lock = threading.Lock()
        self.session_name = session_name
        self.top_k = top_k
        # Remove self.nodes - only use self.cached_candidates["nodes"]

        self.candidate_quadrants = None
        # Store matcher objects separately from matcher metadata
        self.matcher_objs = {
            # "jaccard_distance_matcher": ValentineMatcher(
            #     "jaccard_distance_matcher"
            # ),
            # "ct_learning": BDIKitMatcher("ct_learning"),
            "magneto_ft": BDIKitMatcher("magneto_ft"),
            "magneto_zs": BDIKitMatcher("magneto_zs"),
        }

        self.clustering_model = clustering_model
        self.source_df = None
        self.target_df = None
        self._initialize_cache()
        self.history = UserOperationHistory()
        self.weight_updater = None

    def _initialize_cache(self) -> None:
        # Try to load existing cache first
        cached_json = self._import_cache_from_json()
        if cached_json and "matchers" in cached_json:
            self.cached_candidates = cached_json
            # Restore nodes from cache if they exist
            self.cached_candidates["nodes"] = cached_json.get("nodes", [])
        else:
            # Initialize with default matchers if no cache exists
            self.cached_candidates = {
                "source_hash": None,
                "target_hash": None,
                "candidates": [],
                "source_clusters": None,
                "value_matches": {},
                "matchers": {
                    "magneto_ft": {
                        "name": "magneto_ft",
                        "weight": 0.5,  # Initialize with normalized weights
                        "params": {},
                    },
                    "magneto_zs": {
                        "name": "magneto_zs",
                        "weight": 0.5,  # Initialize with normalized weights
                        "params": {},
                    },
                },
                "matcher_code": {},
                "nodes": [],  # Initialize empty nodes list
            }

    def _load_cached_matchers_async(self, cached_json: Dict[str, Any]) -> None:
        """Start an asynchronous process to load cached matchers"""
        # Always start with default matcher objects
        self.matcher_objs = {
            "magneto_ft": BDIKitMatcher("magneto_ft"),
            "magneto_zs": BDIKitMatcher("magneto_zs"),
        }
        if cached_json and "matchers" in cached_json:
            # Load matcher metadata first (this was done by _load_cached_matchers)
            cached_matchers = cached_json["matchers"]
            cached_matcher_code = cached_json.get("matcher_code", {})

            # First load the default matchers
            default_matchers = {
                "magneto_ft": {
                    "name": "magneto_ft",
                    "weight": 1.0,
                    "params": {},
                },
                "magneto_zs": {
                    "name": "magneto_zs",
                    "weight": 1.0,
                    "params": {},
                },
            }
            # Initialize matchers dictionaries with defaults
            matchers = default_matchers.copy()
            # Load custom matchers from cache
            for matcher_name, matcher_info in cached_matchers.items():
                # Skip default matchers as they're already loaded
                if matcher_name in default_matchers:
                    continue
                matchers[matcher_name] = {
                    "name": matcher_info.get("name", matcher_name),
                    "weight": matcher_info.get("weight", 1.0),
                    "params": matcher_info.get("params", {}),
                    "code": None,
                }
                # Get matcher code if available
                if matcher_name in cached_matcher_code:
                    matchers[matcher_name]["code"] = cached_matcher_code[matcher_name]
            # Update the cached candidates with matcher metadata
            self.cached_candidates["matchers"] = matchers
            self.cached_candidates["matcher_code"] = cached_matcher_code.copy()
            # Start async loading and get the result
            loaded_matchers = self._load_cached_matcher_objs_async(cached_json)
            # Only add successfully loaded custom matchers to matcher_objs
            if loaded_matchers:
                self.matcher_objs.update(loaded_matchers)
                logger.info(
                    f"Updated matcher_objs with {len(loaded_matchers)} loaded matchers"
                )

    def _load_cached_matcher_objs_async(
        self, cached_json: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Load matcher objects from cache asynchronously using multithreading"""
        default_matcher_objs = {
            # "ct_learning": BDIKitMatcher("ct_learning"),
            "magneto_ft": BDIKitMatcher("magneto_ft"),
            "magneto_zs": BDIKitMatcher("magneto_zs"),
        }

        # Get matcher names that need to be loaded
        matcher_names = [
            matcher_name
            for matcher_name in cached_json["matchers"]
            if matcher_name not in default_matcher_objs
        ]

        if not matcher_names:
            return {}

        logger.info(f"Asynchronously loading {len(matcher_names)} custom matchers")

        # Define a function to load a single matcher
        def load_single_matcher(matcher_name):
            try:
                matcher_info = cached_json["matchers"][matcher_name]
                matcher_code = cached_json["matcher_code"].get(matcher_name)

                if not matcher_code:
                    return (
                        matcher_name,
                        None,
                        f"No code found for matcher '{matcher_name}'",
                    )

                matcher_params = matcher_info.get("params", {})

                # Recreate the matcher
                error, matcher = verify_new_matcher(
                    matcher_name, matcher_code, matcher_params
                )
                return matcher_name, matcher, error
            except Exception as e:
                return matcher_name, None, str(e)

        # Use ThreadPoolExecutor to load matchers in parallel
        loaded_matchers = {}
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future_to_matcher = {
                executor.submit(load_single_matcher, matcher_name): matcher_name
                for matcher_name in matcher_names
            }

            for future in concurrent.futures.as_completed(future_to_matcher):
                matcher_name, matcher, error = future.result()
                if not error and matcher:
                    loaded_matchers[matcher_name] = matcher
                    logger.info(f"Loaded custom matcher '{matcher_name}' from cache")
                else:
                    logger.warning(f"Failed to load matcher '{matcher_name}': {error}")

        return loaded_matchers

    def update_dataframe(
        self, source_df: Optional[pd.DataFrame], target_df: Optional[pd.DataFrame]
    ):
        with self.lock:
            if source_df is not None:
                self.source_df = source_df
                logger.info("[MatchingTask] Source dataframe updated!")
            if target_df is not None:
                self.target_df = target_df
                # Only clear nodes if you really want to discard the old filter
                # self.cached_candidates["nodes"] = []
                logger.info("[MatchingTask] Target dataframe updated!")

        self._initialize_value_matches()

    def set_nodes(self, nodes: List[str]) -> None:
        """Set the nodes to filter target data by."""
        self.cached_candidates["nodes"] = nodes
        # Update nodes in cache but invalidate hashes to force regeneration
        self.cached_candidates["source_hash"] = None
        self.cached_candidates["target_hash"] = None
        logger.info(f"Set nodes for filtering: {nodes}, cache invalidated")

    def get_all_nodes(self) -> List[str]:
        """Get all nodes from the ontology."""
        ontology_flat = load_ontology_flat()
        nodes = set()
        for col in ontology_flat.keys():
            nodes.add(ontology_flat[col]["node"])
        return list(nodes)

    def _filter_target_by_nodes(self) -> None:
        """Filter target dataframe based on nodes if they are set."""
        if not self.cached_candidates["nodes"]:
            return

        # Load flat ontology to get node information
        ontology_flat = load_ontology_flat()

        # Get columns that belong to the specified nodes
        valid_columns = []
        for col in self.target_df.columns:
            col_info = ontology_flat.get(col)
            if col_info and col_info.get("node") in self.cached_candidates["nodes"]:
                valid_columns.append(col)

        # Only filter if we found valid columns
        if valid_columns:
            self.target_df = self.target_df[valid_columns]
            logger.info(
                f"Filtered target dataframe to {len(valid_columns)} columns "
                f"from nodes: {self.cached_candidates['nodes']}"
            )
        else:
            logger.info("No columns found for specified nodes, keeping all columns")

    def get_candidates(
        self, is_candidates_cached: bool = True, task_state: Optional[TaskState] = None
    ) -> Dict[str, list]:
        with self.lock:
            if self.source_df is None or self.target_df is None:
                raise ValueError("Source and Target dataframes must be provided.")

            if task_state is None:
                task_state = TaskState(
                    task_type="matching", task_id="api_call", new_task=True
                )

            task_state._update_task_state(
                status="running",
                progress=20,
                current_step="Computing hashes",
                completed_steps=0,
                log_message=("Starting new matching task. Logs cleared."),
            )

            source_hash, target_hash = self._compute_hashes()
            task_state._update_task_state(
                progress=30,
                current_step="Checking cache",
                completed_steps=1,
                log_message=("Hashing source and target dataframes."),
            )

            cached_json = self._import_cache_from_json()
            # Load cached matchers if they exist
            if cached_json and "matchers" in cached_json and cached_json["matchers"]:
                self._load_cached_matchers_async(cached_json)

            candidates = []

            # Filter target by categories before proceeding
            num_of_columns = len(self.target_df.columns)
            self._filter_target_by_nodes()
            num_of_columns_after_filtering = len(self.target_df.columns)
            task_state._update_task_state(
                progress=50,
                current_step="Filtering target by nodes",
                completed_steps=2,
                log_message=(
                    f"Filtering target by nodes, "
                    f"{num_of_columns - num_of_columns_after_filtering} "
                    f"columns removed"
                ),
            )

            # Check if we can use the cached JSON file
            if self._is_cache_valid(cached_json, source_hash, target_hash):
                self.cached_candidates = cached_json
                candidates = cached_json["candidates"]
                task_state._update_task_state(
                    progress=75,
                    current_step="Using cached results",
                    completed_steps=3,
                    log_message="Using cached results from JSON file.",
                )
            # Check if we can use the in-memory cache
            elif is_candidates_cached and self._is_cache_valid(
                self.cached_candidates, source_hash, target_hash
            ):
                candidates = self.get_cached_candidates()
                task_state._update_task_state(
                    progress=75,
                    current_step="Using in-memory cached results",
                    completed_steps=3,
                    log_message="Using in-memory cached results.",
                )
            # Generate new candidates
            else:
                task_state._update_task_state(
                    progress=40,
                    current_step="Generating candidates",
                    completed_steps=2,
                    log_message=("Generating new candidates."),
                )
                candidates = self._generate_candidates(
                    source_hash, target_hash, is_candidates_cached, task_state
                )

            # Always initialize weight updater with current matchers and candidates
            task_state._update_task_state(
                current_step="Updating matcher weights",
                log_message=("Updating matcher weights."),
            )
            self.weight_updater = WeightUpdater(
                matchers=self.cached_candidates["matchers"],
                candidates=candidates,
                alpha=0.1,
                beta=0.1,
            )
            # Update the cached matchers with normalized weights
            self.cached_candidates["matchers"] = self.weight_updater.matchers
            self._export_cache_to_json(self.cached_candidates)
            task_state._update_task_state(
                progress=100,
                current_step="Complete",
                status="complete",
                completed_steps=4,
                log_message="Matcher weights updated and normalized.",
            )

            return candidates

    def append_candidates_from_agent(
        self, source_col: str, candidates: List[Dict[str, Any]]
    ) -> None:
        for candidate in candidates:
            try:
                if candidate["sourceColumn"] != source_col:
                    continue

                target_col = candidate["targetColumn"]
                property_obj = load_property(target_col)
                if property_obj is None:
                    continue

                new_candidate = {
                    "sourceColumn": source_col,
                    "targetColumn": property_obj["column_name"],
                    "score": candidate["score"],
                    "matcher": "agent",
                    "status": "idle",
                }
                self.append_cached_candidate(new_candidate)

                # Generate value matches for the new candidate
                self._generate_value_matches(source_col, property_obj["column_name"])

                logger.info(
                    f"[MatchingTask] Appended candidate from agent: {target_col}"
                )
            except Exception as e:
                logger.error(f"Failed to append candidate from agent: {e}")
                continue

    def prune_candidates_from_agent(
        self, source_col: str, candidates: List[Dict[str, Any]]
    ) -> None:
        for candidate in candidates:
            if candidate["sourceColumn"] != source_col:
                continue
            self.prune_cached_candidate(candidate)

    def _load_cached_matchers(
        self,
        cached_matchers: Dict[str, Any],
        cached_matcher_code: Dict[str, Any],
        candidates: List[Dict[str, Any]],
    ) -> None:
        """Load matchers from cache, do not mutate input."""
        # First load the default matchers
        default_matchers = {
            "magneto_ft": {
                "name": "magneto_ft",
                "weight": 1.0,
                "params": {},
            },
            "magneto_zs": {
                "name": "magneto_zs",
                "weight": 1.0,
                "params": {},
            },
        }
        # Initialize matchers dictionaries with defaults
        matchers = default_matchers.copy()
        # Load custom matchers from cache
        for matcher_name, matcher_info in cached_matchers.items():
            # Skip default matchers as they're already loaded
            if matcher_name in default_matchers:
                continue
            matchers[matcher_name] = {
                "name": matcher_info.get("name", matcher_name),
                "weight": matcher_info.get("weight", 1.0),
                "params": matcher_info.get("params", {}),
                "code": None,
            }
            # Get matcher code if available
            if matcher_name in cached_matcher_code:
                matchers[matcher_name]["code"] = cached_matcher_code[matcher_name]

        self.cached_candidates["matchers"] = self.weight_updater.update_matchers(
            matchers
        )

        # Also load matcher objects for custom matchers
        loaded_matcher_objs = {}
        for matcher_name, matcher_info in matchers.items():
            if matcher_name in default_matchers:
                # Default matchers are already loaded in __init__
                continue

            matcher_code = matcher_info.get("code")
            if matcher_code:
                matcher_params = matcher_info.get("params", {})
                error, matcher_obj = verify_new_matcher(
                    matcher_name, matcher_code, matcher_params
                )
                if not error and matcher_obj:
                    loaded_matcher_objs[matcher_name] = matcher_obj
                    logger.info(f"Loaded matcher object for '{matcher_name}'")
                else:
                    logger.warning(
                        f"Failed to load matcher object for '{matcher_name}': {error}"
                    )

        # Update the class matcher_objs with loaded objects
        if loaded_matcher_objs:
            with self.lock:
                self.matcher_objs.update(loaded_matcher_objs)
            logger.info(
                f"Updated matcher_objs with {len(loaded_matcher_objs)} loaded objects"
            )

        # Preserve matcher code in the cache
        self.cached_candidates["matcher_code"] = cached_matcher_code.copy()

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
        # Check if cache exists and hashes match
        if not (
            cache
            and cache["source_hash"] == source_hash
            and cache["target_hash"] == target_hash
        ):
            return False

        # Check if nodes filter has changed
        cached_nodes = cache.get("nodes", [])

        if cached_nodes == self.cached_candidates["nodes"]:
            return True
        else:
            return False

    def _generate_candidates(
        self,
        source_hash: int,
        target_hash: int,
        is_candidates_cached: bool,
        task_state: TaskState,
    ) -> Dict[str, list]:
        # Define generation steps for better logging
        generation_steps = [
            "Generating embeddings",
            "Clustering source columns",
            "Identifying candidate quadrants",
            "Running matchers",
            "Generating value matches",
        ]

        task_state._update_task_state(
            current_step=generation_steps[0],
            log_message="Starting embedding generation.",
        )

        # Generate embeddings for clustering
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
        task_state._update_task_state(
            progress=60, log_message="Source embeddings generated."
        )

        # Step 2: Cluster source columns
        task_state._update_task_state(
            current_step=generation_steps[1], log_message="Clustering source columns."
        )

        # Generate clusters
        source_clusters = self._generate_source_clusters(source_embeddings)
        task_state._update_task_state(
            progress=70, log_message="Source columns clustered."
        )

        # Step 3: Apply candidate quadrants
        task_state._update_task_state(
            current_step=generation_steps[2],
            log_message="Identifying candidate quadrants.",
        )

        # Initialize candidate quadrants
        self.candidate_quadrants = CandidateQuadrants(
            source=self.source_df,
            target=self.target_df,
            top_k=self.top_k,
        )

        # Collect candidates from different sources
        layered_candidates = []

        # Add candidates from quadrants
        for source_column in self.source_df.columns:
            layered_candidates.extend(
                self.candidate_quadrants.get_easy_target_json(source_column)
            )
        task_state._update_task_state(
            progress=80, log_message="Candidate quadrants identified."
        )

        # Step 4: Run matchers
        task_state._update_task_state(
            current_step=generation_steps[3], log_message="Running matchers."
        )
        total_matchers = len(self.matcher_objs)

        # Add candidates from matchers
        for i, (matcher_name, matcher_instance) in enumerate(self.matcher_objs.items()):
            matcher_candidates = matcher_instance.top_matches(
                source=self.source_df,
                target=self.target_df,
                top_k=self.top_k,
            )
            layered_candidates.extend(matcher_candidates)
            # Calculate progress based on matcher position
            matcher_progress = 80 + ((i + 1) / total_matchers * 10)
            task_state._update_task_state(
                progress=matcher_progress,
                current_step=f"Completed matcher: {matcher_name}",
                log_message=f"Matcher {matcher_name} produced {len(matcher_candidates)} candidates.",
            )

        task_state._update_task_state(
            progress=90, log_message="All matchers completed."
        )

        # Step 5: Generate value matches
        task_state._update_task_state(
            current_step=generation_steps[4],
            log_message="Generating value matches for candidates.",
        )

        # Generate value matches for each candidate
        for idx, candidate in enumerate(layered_candidates):
            self._generate_value_matches(
                candidate["sourceColumn"], candidate["targetColumn"]
            )
            if idx % 10 == 0:
                task_state._update_task_state(
                    log_message=f"Generated value matches for {idx+1}/{len(layered_candidates)} candidates.",
                    replace_last_log=True,
                )

        task_state._update_task_state(
            progress=95, log_message="Value matches generated for all candidates."
        )

        # Update cache if needed
        if is_candidates_cached:
            # Cache matcher information
            matcher_cache = {}
            matcher_code_cache = self.cached_candidates["matcher_code"].copy()

            for name, matcher_info in self.cached_candidates["matchers"].items():
                matcher_cache[name] = matcher_info

                # Store matcher code if available
                if "code" in matcher_info:
                    matcher_code_cache[name] = matcher_info["code"]

            self.cached_candidates = {
                "source_hash": source_hash,
                "target_hash": target_hash,
                "candidates": layered_candidates,
                "source_clusters": source_clusters,
                "value_matches": self.cached_candidates["value_matches"],
                "matchers": matcher_cache,
                "matcher_code": matcher_code_cache,
                "nodes": self.cached_candidates["nodes"],  # Preserve nodes in cache
            }
            self._export_cache_to_json(self.cached_candidates)
            task_state._update_task_state(log_message="Cache exported to JSON.")

        task_state._update_task_state(
            progress=100, log_message="Candidate generation complete."
        )
        return layered_candidates

    def _generate_source_clusters(
        self, source_embeddings: np.ndarray
    ) -> Dict[str, List[str]]:
        n_neighbors = min(10, len(self.source_df.columns))
        knn = NearestNeighbors(n_neighbors=n_neighbors, metric="cosine")
        knn.fit(source_embeddings)

        clusters = {}
        for i, source_embedding in enumerate(source_embeddings):
            cluster_idx = knn.kneighbors([source_embedding], return_distance=False)[0]
            source_col = self.source_df.columns[i]
            clusters[source_col] = [self.source_df.columns[idx] for idx in cluster_idx]

        return clusters

    def _generate_gdc_ontology(self) -> List[Dict]:
        candidates = self.get_cached_candidates()
        return load_gdc_ontology(candidates)

    def _generate_target_ontology(self) -> Optional[List[Dict]]:
        candidates = self.get_cached_candidates()
        target_columns = set()
        for candidate in candidates:
            target_columns.add(candidate["targetColumn"])
        return load_ontology(dataset="target", columns=list(target_columns))

    def _generate_source_ontology(self) -> Optional[List[Dict]]:
        return load_ontology(dataset="source")

    def _initialize_value_matches(self) -> None:
        self.cached_candidates["value_matches"] = {}

        for source_col in self.source_df.columns:
            source_unique_values = []

            # Handle numeric columns that can be treated as categorical
            if pd.api.types.is_numeric_dtype(self.source_df[source_col].dtype):
                if is_candidate_for_category(self.source_df[source_col]):
                    source_unique_values = self.get_source_unique_values(
                        source_col, n=300
                    )
            else:
                source_unique_values = self.get_source_unique_values(source_col)

            # Initialize value matches structure
            self.cached_candidates["value_matches"][source_col] = {
                "source_unique_values": source_unique_values,
                "source_mapped_values": source_unique_values,
                "targets": {},
            }

    def _generate_value_matches(self, source_column: str, target_column: str) -> None:
        # Skip if already generated
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

        # Generate matches
        match_results = {
            "From": [],
            "To": [],
        }
        # matcher = DiffLibMatcher("diff_matcher")
        matcher_results = RapidFuzzValueMatcher.top_value_matches(
            source_values, target_values, top_k=1
        )

        # Sort results to match source values order
        matcher_results = sorted(
            matcher_results,
            key=lambda x: (
                source_values.index(x["sourceValue"])
                if x["sourceValue"] in source_values
                else len(source_values)
            ),
        )

        # Extract matched values
        for result in matcher_results:
            source_value = result["sourceValue"]
            target_value = result["targetValue"]
            match_results["From"].append(source_value)
            match_results["To"].append(target_value)

        # Store matches
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
            "candidates": self.get_cached_candidates(),
            "sourceClusters": self._format_source_clusters_for_frontend(),
            # "targetClusters": self.get_cached_target_clusters(),
            # "matchers": self.get_matchers(),
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
        """Export cache to JSON file with file locking to ensure atomic operations"""
        output_path = os.path.join(
            os.path.dirname(__file__), f"matching_results_{self.session_name}.json"
        )
        with open(output_path, "w") as f:
            # Acquire exclusive lock
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                json.dump(json_obj, f, indent=4)
                # Ensure data is written to disk
                f.flush()
                os.fsync(f.fileno())
            finally:
                # Release lock
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)

    def _import_cache_from_json(self) -> Optional[Dict]:
        """Import cache from JSON file with file locking to ensure atomic operations"""

        output_path = os.path.join(
            os.path.dirname(__file__), f"matching_results_{self.session_name}.json"
        )
        max_retries = 7  # Exponential backoff: total wait ~6.35s if all retries used
        initial_delay = 0.05  # 50ms
        max_delay = 1.0  # 1 second
        retries = 0
        delay = initial_delay

        while os.path.exists(output_path) and retries < max_retries:
            with open(output_path, "r") as f:
                try:
                    try:
                        fcntl.flock(f.fileno(), fcntl.LOCK_SH | fcntl.LOCK_NB)
                    except BlockingIOError:
                        logger.debug("Cache file is locked for writing, retrying...")
                        time.sleep(delay)
                        retries += 1
                        continue

                    f.seek(0, os.SEEK_END)
                    if f.tell() == 0:
                        logger.debug("Cache file is empty, retrying...")
                        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                        time.sleep(delay)
                        retries += 1
                        continue

                    f.seek(0)
                    try:
                        data = json.load(f)
                    except json.JSONDecodeError:
                        logger.debug("Cache file is partially written, retrying...")
                        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                        time.sleep(delay)
                        retries += 1
                        continue
                    finally:
                        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                    return data
                except Exception as e:
                    logger.error(f"Error reading cache file: {e}")
                    try:
                        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                    except Exception:
                        pass
                    return None
                finally:
                    delay = min(delay * 2, max_delay)  # Exponential backoff
                    retries += 1

        if retries >= max_retries:
            logger.error("Max retries reached while reading cache file.")
        return None

    def sync_cache(self) -> None:
        """Sync the cache with the current state of the task."""
        cached_json = self._import_cache_from_json()
        self.cached_candidates = cached_json
        logger.info("Cache synced with current state of the task.")

    def _bucket_column(self, df: pd.DataFrame, col: str) -> List[Dict[str, Any]]:
        col_obj = df[col].dropna()

        # Handle categorical data
        if col_obj.dtype in ["object", "category", "bool"]:
            counter = col_obj.value_counts()[:10].to_dict()
            return [
                {"value": str(key), "count": int(value)}
                for key, value in counter.items()
                if value >= 1
            ]
        # Handle numeric data
        elif col_obj.dtype in ["int64", "float64"]:
            if len(col_obj) == 0:
                return []

            unique_vals = col_obj.unique()

            # Integer columns with few unique values are treated as categorical
            if col_obj.dtype == "int64" and len(unique_vals) <= 10:
                counter = col_obj.value_counts().sort_index()
                return [
                    {"value": str(val), "count": int(count)}
                    for val, count in counter.items()
                ]
            # Otherwise create bins
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

    def undo(self) -> Optional[Dict[str, Any]]:
        logger.info("Undoing last operation...")
        operation = self.history.undo_last_operation()
        if operation:
            self.undo_operation(
                operation.operation, operation.candidate, operation.references
            )
            return operation._json_serialize()
        return None

    def redo(self) -> Optional[Dict[str, Any]]:
        logger.info("Redoing last operation...")
        operation = self.history.redo_last_operation()
        if operation:
            self.redo_operation(
                operation.operation, operation.candidate, operation.references
            )
            return operation._json_serialize()
        return None

    def apply_operation(
        self,
        operation: str,
        candidate: Dict[str, Any],
        references: List[Dict[str, Any]],
        is_match_to_agent: Optional[bool] = None,
    ) -> None:
        logger.info(f"Applying operation: {operation}, on candidate: {candidate}...")

        # Update matcher weights if enabled
        if self.weight_updater:
            self.weight_updater.update_weights(
                operation, candidate["sourceColumn"], candidate["targetColumn"]
            )

        # Add operation to history
        self.history.add_operation(
            UserOperation(operation, candidate, references, is_match_to_agent)
        )

        # Apply the operation
        if operation == "accept":
            self.accept_cached_candidate(candidate)
        elif operation == "reject":
            self.reject_cached_candidate(candidate)
        elif operation == "discard":
            self.discard_cached_column(candidate["sourceColumn"])
        elif operation == "append":
            self.append_candidates_from_agent(candidate["sourceColumn"], references)
        elif operation == "prune":
            self.prune_candidates_from_agent(candidate["sourceColumn"], references)
        else:
            raise ValueError(f"Operation {operation} not supported.")

    def undo_operation(
        self,
        operation: str,
        candidate: Dict[str, Any],
        references: List[Dict[str, Any]],
    ) -> None:
        logger.info(f"Undoing operation: {operation}, on candidate: {candidate}...")

        last_status = candidate["status"]

        if operation in ["accept", "reject"]:
            candidate["status"] = last_status
            self.update_cached_candidate(candidate)
        elif operation == "discard":
            self.append_cached_column(candidate["sourceColumn"])
        elif operation == "append":
            for candidate in references:
                self.prune_cached_candidate(candidate)
        elif operation == "prune":
            for candidate in references:
                self.append_cached_candidate(candidate)
        else:
            raise ValueError(f"Operation {operation} not supported.")

    def redo_operation(
        self,
        operation: str,
        candidate: Dict[str, Any],
        references: List[Dict[str, Any]],
    ) -> None:
        logger.info(f"Redoing operation: {operation}, on candidate: {candidate}...")

        if operation == "accept":
            self.accept_cached_candidate(candidate)
        elif operation == "reject":
            self.reject_cached_candidate(candidate)
        elif operation == "discard":
            self.discard_cached_column(candidate["sourceColumn"])
        elif operation == "append":
            for candidate in references:
                self.append_cached_candidate(candidate)
        elif operation == "prune":
            for candidate in references:
                self.prune_cached_candidate(candidate)
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

    def get_source_unique_values(self, source_col: str, n: int = 50) -> List[str]:
        if self.source_df is None or source_col not in self.source_df.columns:
            raise ValueError(
                f"Source column {source_col} not found in the source dataframe."
            )
        return sorted(
            list(self.source_df[source_col].dropna().unique().astype(str)[:n])
        )

    def get_target_value_bins(self, target_col: str) -> List[Dict[str, Any]]:
        if self.target_df is None or target_col not in self.target_df.columns:
            raise ValueError(
                f"Target column {target_col} not found in the target dataframe."
            )
        return self._bucket_column(self.target_df, target_col)

    def get_target_unique_values(self, target_col: str, n: int = 50) -> List[str]:
        """
        Retrieve unique values for a target column. If the column is found in the target ontology
        and has enums, return those. Otherwise, return unique values from the dataframe.
        """
        target_description = load_property(target_col)
        if target_description and "enum" in target_description:
            target_values = target_description["enum"] or []
        elif self.target_df is not None and target_col in self.target_df.columns:
            target_values = self.target_df[target_col].dropna().unique().tolist()
        else:
            logger.warning(
                f"Target column {target_col} not found in target ontology or target dataframe."
            )
            return []

        return [str(value) for value in target_values[:n]]

    def get_cached_candidates(self) -> List[Dict[str, Any]]:
        return self.cached_candidates["candidates"]

    def set_cached_candidates(self, candidates: List[Dict[str, Any]]) -> None:
        self.cached_candidates["candidates"] = candidates

    def get_value_matches(self) -> Dict[str, Dict[str, Any]]:
        return self.cached_candidates["value_matches"]

    def update_cached_candidate(self, candidate: Dict[str, Any]) -> None:
        candidates = self.get_cached_candidates()
        for index, c in enumerate(candidates):
            if (
                c["sourceColumn"] == candidate["sourceColumn"]
                and c["targetColumn"] == candidate["targetColumn"]
            ):
                candidates[index]["status"] = candidate["status"]
        self.set_cached_candidates(candidates)

    def append_cached_candidate(self, candidate: Dict[str, Any]) -> None:
        cached_candidates = self.get_cached_candidates()
        source_col = candidate["sourceColumn"]
        target_col = candidate["targetColumn"]

        # Check if candidate already exists
        for index, c in enumerate(cached_candidates):
            if c["sourceColumn"] == source_col and c["targetColumn"] == target_col:
                # Don't replace accepted candidates
                if c["status"] == "accepted":
                    return
                # Remove existing candidate that's not accepted
                del cached_candidates[index]
                break

        # Add the new candidate
        cached_candidates.append(candidate)
        self.set_cached_candidates(cached_candidates)

    def prune_cached_candidate(self, candidate: Dict[str, Any]) -> None:
        cached_candidates = self.get_cached_candidates()
        source_col = candidate["sourceColumn"]
        target_col = candidate["targetColumn"]

        for index, c in enumerate(cached_candidates):
            if c["sourceColumn"] == source_col and c["targetColumn"] == target_col:
                del cached_candidates[index]
                break

        self.set_cached_candidates(cached_candidates)

    def get_cached_source_clusters(self) -> Dict[str, List[str]]:
        return self.cached_candidates["source_clusters"] or {}

    def get_matchers(self) -> List[Dict[str, any]]:
        matcher_list = []
        cached_matchers = self.cached_candidates["matchers"]
        for key, item in cached_matchers.items():
            matcher_info = {
                "name": item["name"],
                "weight": item["weight"],
                "params": item["params"],
            }
            # Add code if it exists in the matcher or in the cached matcher code
            if "code" in item:
                matcher_info["code"] = item["code"]
            elif (
                "matcher_code" in self.cached_candidates
                and key in self.cached_candidates["matcher_code"]
            ):
                logger.info(f"Adding code for matcher {key}...")
                matcher_info["code"] = self.cached_candidates["matcher_code"][key]
            matcher_list.append(matcher_info)
        return matcher_list

    def set_matchers(self, matchers: Dict[str, object]) -> None:
        self.cached_candidates["matchers"] = matchers

    def new_matcher(
        self,
        name: str,
        code: str,
        params: Dict[str, Any],
        task_state: Optional[TaskState] = None,
    ) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        try:
            if task_state is None:
                task_state = TaskState(
                    task_type="new_matcher", task_id="api_call", new_task=True
                )

            if "name" not in params or params["name"] == "":
                params["name"] = name

            matcher = {
                "name": name,
                "weight": 1.0,
                "code": code,
                "params": params,
            }
            # Verify and create the new matcher
            error, matcher_obj = verify_new_matcher(name, code, params)
            if error:
                task_state._update_task_state(
                    status="error",
                    progress=100,
                    current_step=f"Error creating new matcher: {error}",
                    log_message=f"Error verifying new matcher: {error}",
                )
                return error, None

            # Add the new matcher to the matchers dictionary
            self.cached_candidates["matchers"][name] = matcher
            self.matcher_objs[name] = matcher_obj

            # Update the matcher code cache
            if "matcher_code" not in self.cached_candidates:
                self.cached_candidates["matcher_code"] = {}
            self.cached_candidates["matcher_code"][name] = code

            # Run the new matcher and add its results to existing candidates
            with self.lock:
                if self.source_df is None or self.target_df is None:
                    return "Source and Target dataframes must be provided.", None

                task_state._update_task_state(
                    status="running",
                    progress=0,
                    current_step="Task start",
                    log_message=f"Starting new matcher task '{name}'. Logs cleared.",
                )

                # Get existing candidates
                existing_candidates = self.get_cached_candidates()

                # Run only the new matcher
                task_state._update_task_state(
                    progress=10,
                    current_step=f"Running new matcher: {name}",
                    log_message=f"Running matcher_obj.top_matches for '{name}'.",
                )
                new_matcher_candidates = matcher_obj.top_matches(
                    source=self.source_df,
                    target=self.target_df,
                    top_k=self.top_k,
                )

                # Update progress
                task_state._update_task_state(
                    progress=50,
                    current_step=f"Generating value matches for {name}",
                    log_message=f"Generating value matches for matcher '{name}'.",
                )

                # Generate value matches for each new candidate
                for idx, candidate in enumerate(new_matcher_candidates):
                    self._generate_value_matches(
                        candidate["sourceColumn"], candidate["targetColumn"]
                    )
                    if idx % 10 == 0:
                        task_state._update_task_state(
                            log_message=(
                                f"Generated value matches for {idx+1}/{len(new_matcher_candidates)} "
                                f"candidates in matcher '{name}'."
                            ),
                            replace_last_log=True,
                        )

                # Add new candidates to existing ones
                updated_candidates = existing_candidates + new_matcher_candidates

                # Update the cache
                self.cached_candidates["candidates"] = updated_candidates

                # Update matcher info in cache
                if "matchers" not in self.cached_candidates:
                    self.cached_candidates["matchers"] = {}

                self.cached_candidates["matchers"][name] = {
                    "name": matcher_obj.name,
                    "weight": getattr(matcher_obj, "weight", 1.0),
                    "params": params,
                }

                # Export updated cache to JSON
                self._export_cache_to_json(self.cached_candidates)
                task_state._update_task_state(
                    progress=90,
                    log_message=f"Cache exported to JSON after running matcher '{name}'.",
                )

                # Update weight updater if needed
                self.cached_candidates["matchers"] = (
                    self.weight_updater.update_matchers(
                        self.cached_candidates["matchers"]
                    )
                )
                task_state._update_task_state(
                    progress=95,
                    log_message=f"Matcher weights updated after running matcher '{name}'.",
                )

                # Update task state to indicate completion
                task_state._update_task_state(
                    progress=100,
                    current_step=f"Completed new matcher: {name}",
                    status="complete",
                    log_message=f"Completed new matcher task '{name}'.",
                )

                return None, self.cached_candidates["matchers"]
        except Exception as e:
            error_message = f"Error creating or running new matcher '{name}': {str(e)}"
            # Record detailed error message to task state
            task_state._update_task_state(
                status="failed",
                progress=100,
                current_step=error_message,
                log_message=error_message,
            )
            return error_message, None

    def get_accepted_candidates(self) -> pd.DataFrame:
        # Collect all accepted source-target column pairs
        candidates_set = set()
        for candidate in self.get_cached_candidates():
            if candidate["status"] == "accepted":
                candidates_set.add(
                    (candidate["sourceColumn"], candidate["targetColumn"])
                )

        # Create a new dataframe with accepted mappings
        target_columns = []
        ret_df = self.source_df.copy()
        for source_col, target_col in candidates_set:
            target_columns.append(target_col)
            ret_df[target_col] = self.source_df[source_col]

        return ret_df[target_columns]

    def get_accepted_mappings(self) -> List[Dict[str, Any]]:
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
        # Collect all accepted source-target column pairs
        candidates_set = set()
        for candidate in self.get_cached_candidates():
            if candidate["status"] == "accepted":
                candidates_set.add(
                    (candidate["sourceColumn"], candidate["targetColumn"])
                )

        # Build the mappings with value matches
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

            # Get value matches or empty list if none exist
            if target_col not in self.get_value_matches()[source_col]["targets"]:
                value_matches = []
            else:
                value_matches = self.get_value_matches()[source_col]["targets"][
                    target_col
                ]

            # Create mapping entry
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
            self.history.append(operation)
            return operation
        return None

    def get_history(self) -> List["UserOperation"]:
        return self.history

    def export_history_for_frontend(self) -> List[Dict[str, Any]]:
        return [op._json_serialize() for op in self.history]


class UserOperation:
    def __init__(
        self,
        operation: str,
        candidate: Dict[str, Any],
        references: List[Dict[str, Any]],
        is_match_to_agent: Optional[bool] = None,
    ) -> None:
        """
        operation: str - the operation to be applied: accept, reject, discard, append, prune
        candidate: Dict[str, Any] - the candidate to be operated on
        references: List[Dict[str, Any]] - the references to the candidates to be operated on (append, prune)
        """
        self.operation = operation
        self.candidate = candidate
        self.references = references
        self.is_match_to_agent = is_match_to_agent

    def _json_serialize(self) -> Dict[str, Any]:
        return {
            "operation": self.operation,
            "candidate": self.candidate,
            "references": (
                self.references if self.operation in ["append", "prune"] else []
            ),
            "isMatchToAgent": self.is_match_to_agent,
        }
