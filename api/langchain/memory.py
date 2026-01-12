# flake8: noqa
import json
import logging
import os
import shutil
import threading
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.errors import InvalidDimensionException
from langchain.tools import StructuredTool
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from ..utils import get_session_dir

# Configure logging to mute verbose Chroma messages
logging.getLogger("chromadb").setLevel(logging.CRITICAL)
logging.getLogger("chromadb.db.clickhouse").setLevel(logging.CRITICAL)
logging.getLogger("chromadb.db.duckdb").setLevel(logging.CRITICAL)

logger = logging.getLogger("bdiviz_flask.sub")


def _clear_chroma_system_cache(chroma_dir: str) -> None:
    """Drop cached Chroma system for a persistent path so migrations can re-run."""
    try:
        from chromadb.api.shared_system_client import SharedSystemClient

        SharedSystemClient._identifier_to_system.pop(os.path.abspath(chroma_dir), None)
    except Exception:
        pass


FN_CANDIDATES = [
    {
        "sourceColumn": "Tumor_Site",
        "targetColumn": "site_of_resection_or_biopsy",
        "sourceValues": [
            "Posterior endometrium",
            "Anterior endometrium",
            "Other, specify",
        ],
        "targetValues": [
            "Other specified parts of female genital organs",
            "Endometrium",
        ],
    },
    {
        "sourceColumn": "Histologic_type",
        "targetColumn": "primary_diagnosis",
        "sourceValues": ["Endometrioid", "Serous", "Clear cell", "Carcinosarcoma"],
        "targetValues": [
            "Serous adenocarcinofibroma",
            "clear cell",
            "Carcinosarcoma",
        ],
    },
    {
        "sourceColumn": "Race",
        "targetColumn": "race",
        "sourceValues": ["White", "Black or African American", "Asian"],
        "targetValues": ["white", "black or african american", "asian"],
    },
]

FP_CANDIDATES = [
    {
        "sourceColumn": "Gender",
        "targetColumn": "relationship_gender",
        "sourceValues": ["Female", "Male"],
        "targetValues": ["female", "male"],
    },
    {
        "sourceColumn": "Ethnicity",
        "targetColumn": "race",
        "sourceValues": ["Not-Hispanic or Latino", "Hispanic or Latino"],
        "targetValues": [
            "native hawaiian or other pacific islander",
            "white",
            "asian",
        ],
    },
    {
        "sourceColumn": "FIGO_stage",
        "targetColumn": "iss_stage",
        "sourceValues": ["IIIC1", "IA", "IIIB"],
        "targetValues": ["I", "II", "III"],
    },
    {
        "sourceColumn": "tumor_Stage-Pathological",
        "targetColumn": "figo_stage",
        "sourceValues": ["Stage I", "Stage II", "Stage III"],
        "targetValues": ["Stage I", "Stage II", "Stage III"],
    },
    {
        "sourceColumn": "tumor_Stage-Pathological",
        "targetColumn": "ajcc_pathologic_t",
        "sourceValues": ["Stage I", "Stage II", "Stage III"],
        "targetValues": ["T0", "T1a", "T2b"],
    },
    {
        "sourceColumn": "Path_Stage_Reg_Lymph_Nodes-pN",
        "targetColumn": "uicc_clinical_n",
        "sourceValues": ["pN1 (FIGO IIIC1)", "pN0", "pNX"],
        "targetValues": ["N1", "N0", "NX"],
    },
    {
        "sourceColumn": "Path_Stage_Primary_Tumor-pT",
        "targetColumn": "ajcc_pathologic_stage",
        "sourceValues": ["pT1b (FIGO IB)", "pT3a (FIGO IIIA)", "pT1 (FIGO I)"],
        "targetValues": ["Stage I", "Stage IB", "StageIIIA"],
    },
    {
        "sourceColumn": "Clin_Stage_Dist_Mets-cM",
        "targetColumn": "uicc_pathologic_m",
        "sourceValues": ["cM0", "cM1"],
        "targetValues": ["cM0 (i+)", "M0", "M1"],
    },
]


_EMBEDDINGS_SINGLETON: Optional[HuggingFaceEmbeddings] = None


def get_shared_embeddings() -> HuggingFaceEmbeddings:
    global _EMBEDDINGS_SINGLETON
    if _EMBEDDINGS_SINGLETON is None:
        model_name = os.getenv(
            "EMBED_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2"
        )
        encode_kwargs = {"normalize_embeddings": True}
        try:
            bs = int(os.getenv("EMBED_BATCH_SIZE", "32"))
            if bs > 0:
                encode_kwargs["batch_size"] = bs
        except Exception:
            pass
        _EMBEDDINGS_SINGLETON = HuggingFaceEmbeddings(
            model_name=model_name,
            model_kwargs={"device": "cpu"},
            encode_kwargs=encode_kwargs,
        )
    return _EMBEDDINGS_SINGLETON


class MemoryRetriever:
    supported_namespaces = [
        "candidates",
        "schema",
        "mismatches",
        "matches",
        "false_positives",  # If the agent think it is a match, but user think it is not
        "false_negatives",  # If the agent think it is not a match, but user think it is
        "explanations",
        "user_memory",
    ]

    def __init__(self, session_id: str = "default"):
        self.session_id = session_id
        self._lock = threading.RLock()
        self._embeddings_lock = threading.Lock()
        # Load embeddings lazily to avoid slow startup when memory isn't used.
        self._embeddings: Optional[HuggingFaceEmbeddings] = None
        self.embedding_model_name = os.getenv(
            "EMBED_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2"
        )
        self.embedding_dim = 0

        self.namespace_counts = {
            "candidates": 0,
            "schema": 0,
            "mismatches": 0,
            "matches": 0,
            "false_positives": 0,
            "false_negatives": 0,
            "explanations": 0,
            "user_memory": 0,
        }

        # Initialize text splitter for user memory
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=100, chunk_overlap=20, length_function=len
        )

        # Initialize per-session Chroma client and collections under api/sessions/<session>/chroma_db
        self.client = None
        self.collections: Dict[str, chromadb.Collection] = {}
        self._switch_session_unlocked(self.session_id)

        self.search_ontology_tool = StructuredTool.from_function(
            func=self.search_target_schema,
            name="search_ontology",
            description="""
            Search the ontology for the most relevant information.
            Args:
                query (str): The query to search the ontology.
                limit (int): The number of ontologies to return.
            Returns:
                Optional[List[str]]: The ontologies for the candidates, None if not found.
            """.strip(),
        )

        self.remember_this_tool = StructuredTool.from_function(
            func=self.put_user_memory,
            name="remember_this",
            description="""
            Stores a piece of information, text, or data provided by the user
            for later reference.
            Args:
                content (str): The information to be remembered. The user will
                provide this.
            Returns:
                str: The number of chunks that have been added to the memory.
            """.strip(),
        )

        self.recall_memory_tool = StructuredTool.from_function(
            func=self.search_user_memory,
            name="recall_memory",
            description="""
            Recalls previously stored information based on a user's query.
            Args:
                query (str): The query to search for in the stored memories.
            Returns:
                Optional[List[str]]: The list of memories if found, None otherwise.
            """.strip(),
        )

        self.search_false_negatives_tool = StructuredTool.from_function(
            func=self.search_false_negatives,
            name="search_false_negatives",
            description="""
            Search for false negatives matches in the memory.
            This means the agent thinks it is not a match, but the user thinks it is a match.
            Args:
                query (str): The query to search for in the stored memories.
                limit (int): The number of memories to return.
            Returns:
                Optional[List[str]]: The list of source-target pairs if found, None otherwise.
            """.strip(),
        )

        self.search_false_positives_tool = StructuredTool.from_function(
            func=self.search_false_positives,
            name="search_false_positives",
            description="""
            Search for false positives matches in the memory.
            This means the agent thinks it is a match, but the user thinks it is not a match.
            Args:
                query (str): The query to search for in the stored memories.
                limit (int): The number of memories to return.
            Returns:
                Optional[List[str]]: The list of source-target pairs if found, None otherwise.
            """.strip(),
        )

        self.search_mismatches_tool = StructuredTool.from_function(
            func=self.search_mismatches,
            name="search_mismatches",
            description="""
            Search for mismatches in the memory.
            Args:
                query (str): The query to search for in the stored memories.
                limit (int): The number of memories to return.
            Returns:
                Optional[List[str]]: The list of source-target pairs if found, None otherwise.
            """.strip(),
        )

        self.search_matches_tool = StructuredTool.from_function(
            func=self.search_matches,
            name="search_matches",
            description="""
            Search for matches in the memory.
            Args:
                query (str): The query to search for in the stored memories.
                limit (int): The number of memories to return.
            Returns:
                Optional[List[str]]: The list of source-target pairs if found, None otherwise.
            """.strip(),
        )

    def _get_embeddings(self) -> HuggingFaceEmbeddings:
        if self._embeddings is None:
            with self._embeddings_lock:
                if self._embeddings is None:
                    self._embeddings = get_shared_embeddings()
                    if not self.embedding_dim:
                        self.embedding_dim = self._infer_embedding_dim(self._embeddings)
                        self._refresh_embedding_config()
        return self._embeddings

    def _refresh_embedding_config(self) -> None:
        if not self.embedding_dim and not self.embedding_model_name:
            return
        try:
            session_dir = get_session_dir(self.session_id, create=True)
            chroma_dir = os.path.join(session_dir, "chroma_db")
            self._write_embedding_config(chroma_dir)
        except Exception:
            pass

    def _infer_embedding_dim(
        self, embeddings: Optional[HuggingFaceEmbeddings] = None
    ) -> int:
        try:
            embedder = embeddings or self._embeddings or get_shared_embeddings()
            vec = embedder.embed_query("embedding-dim-probe")
            return len(vec)
        except Exception:
            return 0

    def _embedding_config_path(self, chroma_dir: str) -> str:
        return os.path.join(chroma_dir, "embedding_config.json")

    def _read_embedding_config(self, chroma_dir: str) -> Optional[Dict[str, Any]]:
        path = self._embedding_config_path(chroma_dir)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception:
            return None

    def _write_embedding_config(self, chroma_dir: str) -> None:
        if not self.embedding_dim and not self.embedding_model_name:
            return
        payload: Dict[str, Any] = {}
        if self.embedding_model_name:
            payload["embedding_model"] = self.embedding_model_name
        if self.embedding_dim:
            payload["embedding_dim"] = int(self.embedding_dim)
        path = self._embedding_config_path(chroma_dir)
        try:
            with open(path, "w") as f:
                json.dump(payload, f)
        except Exception:
            pass

    def _embedding_config_matches(self, config: Dict[str, Any]) -> bool:
        if not isinstance(config, dict):
            return True
        try:
            if (
                self.embedding_dim
                and "embedding_dim" in config
                and int(config["embedding_dim"]) != int(self.embedding_dim)
            ):
                return False
        except Exception:
            return False
        if (
            self.embedding_model_name
            and config.get("embedding_model")
            and config.get("embedding_model") != self.embedding_model_name
        ):
            return False
        return True

    def _build_collection_metadata(self, recovery: bool = False) -> Dict[str, Any]:
        if recovery:
            metadata = {
                "hnsw:space": "cosine",
                "hnsw:construction_ef": 100,
                "hnsw:search_ef": 100,
                "hnsw:M": 16,
            }
        else:
            metadata = {
                "hnsw:space": "cosine",
                "hnsw:construction_ef": 64,
                "hnsw:search_ef": 100,
                "hnsw:M": 12,
            }
        if self.embedding_model_name:
            metadata["embedding_model"] = self.embedding_model_name
        if self.embedding_dim:
            metadata["embedding_dim"] = int(self.embedding_dim)
        return metadata

    def _get_collection(self, namespace: str) -> Optional[chromadb.Collection]:
        if namespace is None:
            return None
        with self._lock:
            if not self.collections or "user_memory" not in self.collections:
                try:
                    self._switch_session_unlocked(self.session_id)
                except Exception as e:
                    logger.warning(
                        f"Failed to reinitialize collections for session {self.session_id}: {e}"
                    )
                    return None
            coll = self.collections.get(namespace)
            if coll is not None:
                return coll
            return self.collections.get("user_memory")

    def _chroma_error_reason(self, error: Exception) -> Optional[str]:
        if isinstance(error, InvalidDimensionException):
            return "embedding dimension mismatch"
        msg = str(error).lower()
        if "dimension" in msg and "collection dimensionality" in msg:
            return "embedding dimension mismatch"
        if "unable to open database file" in msg:
            return "unable to open database file"
        if "tenant" in msg or "no such table: tenants" in msg:
            return "tenant/schema error"
        return None

    def _recreate_chroma_db(self, reason: str) -> None:
        session_dir = get_session_dir(self.session_id, create=True)
        chroma_dir = os.path.join(session_dir, "chroma_db")
        logger.warning(
            f"ChromaDB issue detected ({reason}). Recreating database at {chroma_dir}..."
        )
        _clear_chroma_system_cache(chroma_dir)
        if os.path.exists(chroma_dir):
            shutil.rmtree(chroma_dir, ignore_errors=True)
        os.makedirs(chroma_dir, exist_ok=True)
        self._switch_session_unlocked(self.session_id)

    def _switch_session_unlocked(self, session_id: str) -> None:
        """Rebind client/collections to a different session (caller must hold lock)."""
        self.session_id = session_id
        session_dir = get_session_dir(session_id, create=True)
        chroma_dir = os.path.join(session_dir, "chroma_db")
        os.makedirs(chroma_dir, exist_ok=True)

        config = self._read_embedding_config(chroma_dir)
        if config and not self._embedding_config_matches(config):
            logger.warning(
                f"ChromaDB at {chroma_dir} uses a different embedding config. Recreating database..."
            )
            _clear_chroma_system_cache(chroma_dir)
            if os.path.exists(chroma_dir):
                shutil.rmtree(chroma_dir, ignore_errors=True)
            os.makedirs(chroma_dir, exist_ok=True)
            config = None
        if config and not self.embedding_dim:
            try:
                self.embedding_dim = int(config.get("embedding_dim", 0) or 0)
            except Exception:
                pass

        # Try to initialize ChromaDB client, handling corrupted/incompatible databases
        try:
            self.client = chromadb.PersistentClient(path=chroma_dir)
        except (ValueError, Exception) as e:
            error_msg = str(e).lower()
            # Handle tenant/database schema errors (ChromaDB 0.6.x compatibility issue)
            if "tenant" in error_msg or "no such table: tenants" in error_msg:
                logger.warning(
                    f"ChromaDB database at {chroma_dir} is corrupted/incompatible. "
                    "Recreating database..."
                )
                try:
                    # Remove corrupted database directory
                    _clear_chroma_system_cache(chroma_dir)
                    if os.path.exists(chroma_dir):
                        shutil.rmtree(chroma_dir, ignore_errors=True)
                    os.makedirs(chroma_dir, exist_ok=True)
                    # Retry client initialization
                    self.client = chromadb.PersistentClient(path=chroma_dir)
                except Exception as e2:
                    logger.error(f"Failed to recreate ChromaDB database: {e2}")
                    raise
            else:
                raise

        self.collections = {}
        for ns in self.supported_namespaces:
            self.collections[ns] = self.client.get_or_create_collection(
                name=f"agent_memory_{ns}",
                metadata=self._build_collection_metadata(),
            )
        self._write_embedding_config(chroma_dir)
        # Sync namespace counters with existing persisted collections so searches
        # don't incorrectly report empty memory on fresh process/session loads.
        try:
            for ns, coll in self.collections.items():
                count = 0
                try:
                    # Prefer fast count() when available
                    count = int(coll.count())  # type: ignore[attr-defined]
                except Exception:
                    try:
                        ids = coll.get().get("ids", [])
                        count = len(ids) if ids is not None else 0
                    except Exception:
                        count = 0
                if ns in self.namespace_counts:
                    self.namespace_counts[ns] = count
        except Exception:
            # Best-effort; if it fails, default counters remain as initialized
            pass

    def switch_session(self, session_id: str) -> None:
        with self._lock:
            if self.session_id != session_id:
                self._switch_session_unlocked(session_id)

    def put_target_schema_batch(
        self, properties: List[Dict[str, Any]], batch_size: int = 16
    ) -> None:
        """Batch insert schema properties with dedup and trimmed content."""
        if not properties:
            return
        coll = self._get_collection("schema")
        if coll is None:
            return
        ids: List[str] = []
        docs: List[str] = []
        metas: List[Dict[str, Any]] = []
        for prop in properties:
            if not isinstance(prop, dict) or "column_name" not in prop:
                continue
            col = prop["column_name"]
            description = prop.get("description")
            if isinstance(description, str) and len(description) > 500:
                description = description[:500]
            enum_vals = prop.get("enum")
            if isinstance(enum_vals, list) and len(enum_vals) > 50:
                enum_vals = enum_vals[:50]
            aliases = set()
            if "_" in col:
                aliases.add(col.replace("_", " "))
                aliases.add(col.replace("_", "").lower())
                aliases.add(col.replace("_", " ").title())
            aliases.add(col.lower())
            aliases.add(col.title())
            doc = (
                f"Column name: {col}\n"
                f"Aliases: {', '.join(aliases)}\n"
                f"Category: {prop['category']}\n"
                f"Node: {prop['node']}\n"
                f"Type: {prop['type']}\n"
                f"Description: {description}"
            )
            if enum_vals is not None:
                doc += f"\nEnum: {enum_vals}"
            docs.append(doc)
            metas.append(
                {
                    "column_name": col,
                    "category": prop["category"],
                    "node": prop["node"],
                    "type": prop["type"],
                    "namespace": "schema",
                }
            )
            ids.append(f"target-schema-{col}")
        if not ids:
            return
        # Dedup existing
        to_add_idx = list(range(len(ids)))
        try:
            existing = coll.get(ids=ids)
            existing_ids = set(existing.get("ids", [])) if existing else set()
            to_add_idx = [i for i, _id in enumerate(ids) if _id not in existing_ids]
        except Exception:
            pass
        if not to_add_idx:
            return
        for i in range(0, len(to_add_idx), batch_size):
            batch_indices = to_add_idx[i : i + batch_size]
            batch_ids = [ids[j] for j in batch_indices]
            batch_docs = [docs[j] for j in batch_indices]
            batch_metas = [metas[j] for j in batch_indices]
            try:
                # Perform embedding outside of lock to avoid blocking other writes
                vecs = self._get_embeddings().embed_documents(batch_docs)
                # Lock only around the collection add and counter update
                with self._lock:
                    coll.add(
                        ids=batch_ids,
                        documents=batch_docs,
                        metadatas=batch_metas,
                        embeddings=vecs,
                    )
                    self._increase_namespace_count("schema", len(batch_ids))
            except Exception as e:
                reason = self._chroma_error_reason(e)
                if reason:
                    try:
                        with self._lock:
                            self._recreate_chroma_db(reason)
                        coll = self._get_collection("schema")
                        if coll is None:
                            return
                        vecs = self._get_embeddings().embed_documents(batch_docs)
                        with self._lock:
                            coll.add(
                                ids=batch_ids,
                                documents=batch_docs,
                                metadatas=batch_metas,
                                embeddings=vecs,
                            )
                            self._increase_namespace_count("schema", len(batch_ids))
                        continue
                    except Exception as e2:
                        logger.warning(
                            f"Retry batch add failed for schema namespace due to DB error: {e2}"
                        )
                        return
                logger.warning(f"Failed to batch add schema items: {e}")

    def get_validation_tools(self, with_memory: bool):
        tools = [
            self.search_false_negatives_tool,
            self.search_false_positives_tool,
            self.search_mismatches_tool,
            self.search_matches_tool,
        ]
        if with_memory:
            tools.append(self.recall_memory_tool)
        return tools

    def clear_namespaces(self, namespaces: List[str]):
        """Clear specific namespaces from the vector store"""
        with self._lock:
            for namespace in namespaces:
                try:
                    coll = self.collections.get(namespace)
                    if coll is None:
                        continue
                    # Delete everything by fetching all ids first (avoids empty `where` error)
                    all_ids = coll.get()["ids"]
                    if all_ids:
                        coll.delete(ids=all_ids)
                    logger.info(
                        f"🧠Memory: clear_namespaces cleared {len(all_ids)} docs from namespace '{namespace}'"
                    )
                except Exception as e:
                    logger.warning(f"Error clearing namespace '{namespace}': {e}")

        # Reset namespace counts if namespaces were cleared
        for namespace in namespaces:
            self._reset_namespace_count(namespace)

    def reset_memory(self):
        logger.info("🧠Memory: Resetting memory...")
        self.clear_namespaces(self.supported_namespaces)
        self.namespace_counts = {
            "candidates": 0,
            "schema": 0,
            "mismatches": 0,
            "matches": 0,
            "false_positives": 0,
            "false_negatives": 0,
            "explanations": 0,
            "user_memory": 0,
        }

    def clear_all(self):
        """Drop all collections for this session and reset counters."""
        try:
            for ns in list(self.collections.keys()):
                name = f"agent_memory_{self.session_id}_{ns}"
                try:
                    self.client.delete_collection(name)
                except Exception:
                    pass
            self.collections = {}
            self.reset_memory()
        except Exception as e:
            logger.warning(
                f"Failed to clear all memory for session {self.session_id}: {e}"
            )

    # puts
    def put_target_schema(self, property: Dict[str, Any]):
        """
        property is in the following format:
        {
            "column_name": "ajcc_clinical_m",
            "category": "clinical",
            "node": "diagnosis",
            "type": "enum",
            "description": "Extent of the distant metastasis for the cancer based on evidence obtained from clinical assessment parameters determined prior to treatment.",
            "enum": [
                "cM0 (i+)",
                "M0",
                "M1",
                "M1a",
                "M1b",
                "M1c",
                "MX",
                "Unknown",
                "Not Reported",
                "Not Allowed To Collect"
            ]
        }
        """
        col = property["column_name"]
        aliases = set()
        if "_" in col:
            aliases.add(col.replace("_", " "))
            aliases.add(col.replace("_", "").lower())
            aliases.add(col.replace("_", " ").title())
        aliases.add(col.lower())
        aliases.add(col.title())

        id = f"target-schema-{col}"
        page_content = f"""
Column name: {col}
Aliases: {', '.join(aliases)}
Category: {property['category']}
Node: {property['node']}
Type: {property['type']}
Description: {property['description']}
"""
        if "enum" in property and property["enum"] is not None:
            page_content += f"\nEnum: {property['enum']}"
        if "maximum" in property and property["maximum"] is not None:
            page_content += f"\nMaximum: {property['maximum']}"
        if "minimum" in property and property["minimum"] is not None:
            page_content += f"\nMinimum: {property['minimum']}"

        metadata = {
            "column_name": col,
            "category": property["category"],
            "node": property["node"],
            "type": property["type"],
            "namespace": "schema",
        }
        self._add_vector_store(id, page_content, metadata, namespace="schema")

    def put_candidate(self, value: Dict[str, Any]):
        """
        value is in the following format:
        {
            'sourceColumn': 'Tumor_Site',
            'targetColumn': 'site_of_resection_or_biopsy',
            'score': 0.9,
            'matcher': 'magneto_zs_bp'
        }
        """
        key = f"{value['sourceColumn']}::{value['targetColumn']}"

        page_content = f"""
Source Column: {value['sourceColumn']}
Target Column: {value['targetColumn']}
Score: {value['score']}
"""

        metadata = {
            "sourceColumn": value["sourceColumn"],
            "targetColumn": value["targetColumn"],
            "score": value["score"],
            "namespace": "candidates",
        }

        if "matcher" in value:
            metadata["matcher"] = value["matcher"]
            page_content += f"\nMatcher: {value['matcher']}"

        self._add_vector_store(key, page_content, metadata, namespace="candidates")

    def put_match(self, value: Dict[str, Any]):
        """
        value is in the following format:
        {
            'sourceColumn': 'Path_Stage_Primary_Tumor-pT',
            'targetColumn': 'ajcc_pathologic_stage',
        }
        """
        key = f"{value['sourceColumn']}::{value['targetColumn']}"

        page_content = f"""
Source Column: {value['sourceColumn']}
Target Column: {value['targetColumn']}
"""

        metadata = {
            "sourceColumn": value["sourceColumn"],
            "targetColumn": value["targetColumn"],
            "namespace": "matches",
        }

        self._add_vector_store(key, page_content, metadata, namespace="matches")

    def put_mismatch(self, value: Dict[str, Any]) -> None:
        """
        Args:
            value (Dict[str, Any]): The value to store in the memory.
            {
                'sourceColumn': 'Path_Stage_Primary_Tumor-pT',
                'targetColumn': 'ajcc_pathologic_stage',
            }

        Returns:
            None
        """
        key = f"{value['sourceColumn']}::{value['targetColumn']}"

        page_content = f"""
Source Column: {value['sourceColumn']}
Target Column: {value['targetColumn']}
"""

        metadata = {
            "sourceColumn": value["sourceColumn"],
            "targetColumn": value["targetColumn"],
            "namespace": "mismatches",
        }

        self._add_vector_store(key, page_content, metadata, namespace="mismatches")

    def put_false_positive(self, value: Dict[str, Any]) -> None:
        """
        Args:
            value (Dict[str, Any]): The value to store in the memory.
        """
        key = f"{value['sourceColumn']}::{value['targetColumn']}"

        page_content = f"""
Source Column: {value['sourceColumn']}
Target Column: {value['targetColumn']}
"""

        metadata = {
            "sourceColumn": value["sourceColumn"],
            "targetColumn": value["targetColumn"],
            "namespace": "false_positives",
        }

        self._add_vector_store(key, page_content, metadata, namespace="false_positives")

    def put_false_negative(self, value: Dict[str, Any]) -> None:
        """
        Args:
            value (Dict[str, Any]): The value to store in the memory.
        """
        key = f"{value['sourceColumn']}::{value['targetColumn']}"

        page_content = f"""
Source Column: {value['sourceColumn']}
Target Column: {value['targetColumn']}
"""

        metadata = {
            "sourceColumn": value["sourceColumn"],
            "targetColumn": value["targetColumn"],
            "namespace": "false_negatives",
        }

        self._add_vector_store(key, page_content, metadata, namespace="false_negatives")

    def put_explanation(
        self, explanations: List[Dict[str, Any]], user_operation: Dict[str, Any]
    ) -> None:
        """
        Args:
            explanations (List[Dict[str, Any]]): A list of explanations to
            store in the memory.
            {
                'type': ExplanationType;
                'content': string;
                'confidence': number;
            }

            user_operation (Dict[str, Any]): The user operation to store in
            the memory.
            {
                'operation': string;
                'candidate': {
                    'sourceColumn': string;
                    'targetColumn': string;
                };
            }
        """
        key = (
            f"{user_operation['operation']}::"
            f"{user_operation['candidate']['sourceColumn']}::"
            f"{user_operation['candidate']['targetColumn']}"
        )

        # Get existing explanations
        def filter_func(doc: Document) -> bool:
            return (
                doc.metadata.get("namespace") == "explanations"
                and doc.metadata.get("key") == key
            )

        existing_docs = self._search_vector_store("", k=1, filter=filter_func)

        # Format new explanations
        formatted_explanations = [
            {
                "type": explanation["type"],
                "reason": explanation["reason"],
                "reference": explanation["reference"],
                "confidence": explanation["confidence"],
            }
            for explanation in explanations
        ]

        # Combine with existing explanations (keep only 5 most recent)
        if existing_docs:
            existing_explanations = existing_docs[0].metadata.get("explanations", [])
            formatted_explanations = (formatted_explanations + existing_explanations)[
                :5
            ]

        page_content = f"""
Operation: {user_operation['operation']}
Source Column: {user_operation['candidate']['sourceColumn']}
Target Column: {user_operation['candidate']['targetColumn']}
Explanations: {formatted_explanations}
"""

        metadata = {
            "sourceColumn": user_operation["candidate"]["sourceColumn"],
            "targetColumn": user_operation["candidate"]["targetColumn"],
            "namespace": "explanations",
        }

        # Remove existing document if it exists
        if existing_docs:
            self._delete_vector_store(existing_docs[0].id, namespace="explanations")

        self._add_vector_store(key, page_content, metadata, namespace="explanations")

    def put_user_memory(self, content: str) -> str:
        """
        Stores a piece of information from the user in the vector store.
        Uses RecursiveCharacterTextSplitter to split content into chunks.
        """
        import uuid

        # Split content into chunks using RecursiveCharacterTextSplitter
        chunks = self.text_splitter.split_text(content)
        content_uuid = str(uuid.uuid4())
        # Store each chunk with a unique key
        for i, chunk in enumerate(chunks):
            chunk_key = f"{content_uuid}_chunk_{i}"
            metadata = {
                "namespace": "user_memory",
                "uuid": content_uuid,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "chunk_content": chunk,
            }
            self._add_vector_store(chunk_key, chunk, metadata, namespace="user_memory")

        logger.critical(f"🧰Tool result: put_user_memory with {len(chunks)} chunks")
        return f"I have remembered that in {len(chunks)} chunks."

    # Search
    def search_user_memory(self, query: str, limit: int = 5) -> Optional[List[str]]:
        user_memory_count = self.get_namespace_count("user_memory")
        if user_memory_count == 0:
            logger.critical("🧰Tool result: search_user_memory, memory is empty...")
            return None
        elif user_memory_count < limit:
            limit = user_memory_count

        logger.critical(
            f"🧰Tool called: search_user_memory with query='{query}', " f"limit={limit}"
        )
        results = self._search_vector_store(query, limit, namespace="user_memory")
        logger.critical(
            f"🧰Tool result: search_user_memory found {len(results)} unique contents"
        )
        return [doc.page_content for doc in results]

    def search_target_schema(self, query: str, limit: int = 10) -> Optional[List[str]]:
        schema_count = self.get_namespace_count("schema")
        if schema_count == 0:
            logger.critical("🧰Tool result: search_target_schema, memory is empty...")
            return None
        elif schema_count < limit:
            limit = schema_count
        logger.info(
            f"🧰Tool called: search_target_schema with query='{query}', "
            f"limit={limit}"
        )
        results = self._search_vector_store(query, limit, namespace="schema")
        logger.info(
            f"🧰Tool result: search_target_schema returned {len(results)} " "results"
        )
        return [doc.page_content for doc in results] if results else None

    def search_candidates(self, query: str, limit: int = 10) -> Optional[List[str]]:
        candidates_count = self.get_namespace_count("candidates")
        if candidates_count == 0:
            logger.critical("🧰Tool result: search_candidates, memory is empty...")
            return None
        elif candidates_count < limit:
            limit = candidates_count
        logger.info(
            f"🧰Tool called: search_candidates with query='{query}', " f"limit={limit}"
        )
        results = self._search_vector_store(query, limit, namespace="candidates")
        logger.info(f"🧰Tool result: search_candidates returned {len(results)} results")
        return [doc.page_content for doc in results] if results else None

    def search_matches(self, query: str, limit: int = 5) -> Optional[List[str]]:
        matches_count = self.get_namespace_count("matches")
        if matches_count == 0:
            logger.critical("🧰Tool result: search_matches, memory is empty...")
            return None
        elif matches_count < limit:
            limit = matches_count
        logger.info(
            f"🧰Tool called: search_matches with query='{query}', " f"limit={limit}"
        )
        results = self._search_vector_store(query, limit, namespace="matches")
        logger.info(f"🧰Tool result: search_matches returned {len(results)} results")
        return [doc.page_content for doc in results] if results else None

    def search_mismatches(self, query: str, limit: int = 5) -> Optional[List[str]]:
        mismatches_count = self.get_namespace_count("mismatches")
        if mismatches_count == 0:
            logger.critical("🧰Tool result: search_mismatches, memory is empty...")
            return None
        elif mismatches_count < limit:
            limit = mismatches_count
        logger.info(
            f"🧰Tool called: search_mismatches with query='{query}', " f"limit={limit}"
        )
        results = self._search_vector_store(query, limit, namespace="mismatches")
        logger.info(f"🧰Tool result: search_mismatches returned {len(results)} results")
        return [doc.page_content for doc in results] if results else None

    def search_false_positives(self, query: str, limit: int = 5) -> Optional[List[str]]:
        false_positives_count = self.get_namespace_count("false_positives")
        if false_positives_count == 0:
            logger.critical("🧰Tool result: search_false_positives, memory is empty...")
            return None
        elif false_positives_count < limit:
            limit = false_positives_count
        logger.info(
            f"🧰Tool called: search_false_positives with query='{query}', "
            f"limit={limit}"
        )
        results = self._search_vector_store(query, limit, namespace="false_positives")
        logger.info(
            f"🧰Tool result: search_false_positives returned {len(results)} results"
        )
        return [doc.page_content for doc in results] if results else None

    def search_false_negatives(self, query: str, limit: int = 5) -> Optional[List[str]]:
        false_negatives_count = self.get_namespace_count("false_negatives")
        if false_negatives_count == 0:
            logger.critical("🧰Tool result: search_false_negatives, memory is empty...")
            return None
        elif false_negatives_count < limit:
            limit = false_negatives_count
        logger.info(
            f"🧰Tool called: search_false_negatives with query='{query}', "
            f"limit={limit}"
        )
        results = self._search_vector_store(query, limit, namespace="false_negatives")
        logger.info(
            f"🧰Tool result: search_false_negatives returned {len(results)} results"
        )
        return [doc.page_content for doc in results] if results else None

    def search_explanations(self, query: str, limit: int = 10) -> Optional[List[str]]:
        explanations_count = self.get_namespace_count("explanations")
        if explanations_count == 0:
            logger.critical("🧰Tool result: search_explanations, memory is empty...")
            return None
        elif explanations_count < limit:
            limit = explanations_count
        logger.info(
            f"🧰Tool called: search_explanations with query='{query}', "
            f"limit={limit}"
        )
        results = self._search_vector_store(query, limit, namespace="explanations")
        logger.info(
            f"🧰Tool result: search_explanations returned {len(results)} " "results"
        )
        return [doc.page_content for doc in results] if results else None

    # Delete
    def delete_match(self, candidate: Dict[str, Any]) -> None:
        key = f"{candidate['sourceColumn']}::{candidate['targetColumn']}"
        self._delete_vector_store(key, namespace="matches")

    def delete_mismatch(self, candidate: Dict[str, Any]) -> None:
        key = f"{candidate['sourceColumn']}::{candidate['targetColumn']}"
        self._delete_vector_store(key, namespace="mismatches")

    def delete_false_positive(self, candidate: Dict[str, Any]) -> None:
        key = f"{candidate['sourceColumn']}::{candidate['targetColumn']}"
        self._delete_vector_store(key, namespace="false_positives")

    def delete_false_negative(self, candidate: Dict[str, Any]) -> None:
        key = f"{candidate['sourceColumn']}::{candidate['targetColumn']}"
        self._delete_vector_store(key, namespace="false_negatives")

    # Vector store operations
    def _add_vector_store(
        self,
        id: str,
        page_content: str,
        metadata: Dict[str, Any],
        namespace: Optional[str] = None,
    ):
        if namespace is None:
            logger.warning(f"No namespace provided for {id}")
            return

        # Embed the text and add to collection
        collection = self._get_collection(namespace)
        if collection is None:
            logger.warning(f"ChromaDB collection missing for namespace '{namespace}'")
            return

        embedding = self._get_embeddings().embed_documents([page_content])[0]
        try:
            with self._lock:
                collection.add(
                    ids=[id],
                    documents=[page_content],
                    metadatas=[metadata],
                    embeddings=[embedding],
                )
                self._increase_namespace_count(namespace, 1)
        except Exception as e:
            reason = self._chroma_error_reason(e)
            if reason:
                try:
                    with self._lock:
                        self._recreate_chroma_db(reason)
                    collection = self._get_collection(namespace)
                    if collection is None:
                        return
                    with self._lock:
                        collection.add(
                            ids=[id],
                            documents=[page_content],
                            metadatas=[metadata],
                            embeddings=[embedding],
                        )
                        self._increase_namespace_count(namespace, 1)
                except Exception as e2:
                    logger.warning(
                        f"Retry add failed for namespace '{namespace}' due to DB error: {e2}"
                    )
                    return
            else:
                raise

    def _search_vector_store(
        self,
        query: str,
        k: int = 10,
        namespace: Optional[str] = None,
        filter: Optional[Dict[str, Any]] = None,
    ):
        # Determine which namespace collection should be searched. Extract the
        # `namespace` key from the filter (if present) and perform the query on
        # that dedicated collection. All remaining filter terms are still
        # applied to the query.

        if namespace is None:
            return []

        collection = self._get_collection(namespace)
        if collection is None:
            return []

        query_embedding = self._get_embeddings().embed_query(query)
        try:
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=k,
                where=filter,
            )
        except Exception as e:
            reason = self._chroma_error_reason(e)
            if reason:
                with self._lock:
                    self._recreate_chroma_db(reason)
                return []
            raise

        # Convert results to Document objects for compatibility
        documents = []
        for i, doc in enumerate(results["documents"][0]):
            metadata = results["metadatas"][0][i] if results["metadatas"][0] else {}
            documents.append(Document(page_content=doc, metadata=metadata))

        return documents

    def _delete_vector_store(self, id: str, namespace: Optional[str] = None):
        if namespace is None:
            logger.warning(f"No namespace provided for {id}")
            return

        collection = self._get_collection(namespace)
        if collection is None:
            return
        with self._lock:
            collection.delete(ids=[id])
            self._decrease_namespace_count(namespace, 1)

    def get_namespace_count(self, namespace: str):
        if namespace not in self.namespace_counts:
            logger.warning(f"Namespace {namespace} not found in namespace_counts")
            return 0
        return self.namespace_counts[namespace]

    def _increase_namespace_count(self, namespace: str, count: int):
        self.namespace_counts[namespace] += count

    def _decrease_namespace_count(self, namespace: str, count: int):
        self.namespace_counts[namespace] -= count

    def _reset_namespace_count(self, namespace: str):
        self.namespace_counts[namespace] = 0


_SESSION_STORES: Dict[str, MemoryRetriever] = {}
_SESSION_LOCK = threading.RLock()


def get_memory_retriever(session_id: str = "default") -> MemoryRetriever:
    global _SESSION_STORES
    with _SESSION_LOCK:
        store = _SESSION_STORES.get(session_id)
        if store is None:
            logger.info(
                f"🧠Memory: Initializing memory retriever for session '{session_id}'..."
            )
            store = MemoryRetriever(session_id=session_id)
            _SESSION_STORES[session_id] = store
        return store


def delete_memory_retriever(session_id: str = "default"):
    global _SESSION_STORES
    chroma_dir = None
    try:
        chroma_dir = os.path.join(
            get_session_dir(session_id, create=False), "chroma_db"
        )
    except Exception:
        chroma_dir = None
    with _SESSION_LOCK:
        store = _SESSION_STORES.pop(session_id, None)
        if store is not None:
            try:
                # Best-effort: clear data and drop client references
                store.clear_namespaces(store.supported_namespaces)
            except Exception:
                pass
            try:
                store.collections = {}
                store.client = None
            except Exception:
                pass
    if chroma_dir:
        _clear_chroma_system_cache(chroma_dir)
    return None
