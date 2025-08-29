# flake8: noqa
import logging
import os
import shutil
from typing import Any, Dict, List, Optional

from langchain.tools import StructuredTool
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
import chromadb

# Configure logging to mute verbose Chroma messages
logging.getLogger("chromadb").setLevel(logging.CRITICAL)
logging.getLogger("chromadb.db.clickhouse").setLevel(logging.CRITICAL)
logging.getLogger("chromadb.db.duckdb").setLevel(logging.CRITICAL)

logger = logging.getLogger("bdiviz_flask.sub")

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

    def __init__(self):
        # Initialize embeddings with a model that matches the expected dimensions
        embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-mpnet-base-v2",  # 768d
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )

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

        # Handle existing chroma_db directory more gracefully
        if os.path.exists("./chroma_db"):
            # Instead of removing, try to fix permissions
            import stat

            try:
                # Ensure directory has proper permissions
                dir_perms = (
                    stat.S_IRWXU
                    | stat.S_IRGRP
                    | stat.S_IXGRP
                    | stat.S_IROTH
                    | stat.S_IXOTH
                )
                os.chmod("./chroma_db", dir_perms)
                # Fix any sqlite files in the directory
                for root, dirs, files in os.walk("./chroma_db"):
                    for file in files:
                        if file.endswith(".sqlite3"):
                            file_path = os.path.join(root, file)
                            file_perms = (
                                stat.S_IRUSR
                                | stat.S_IWUSR
                                | stat.S_IRGRP
                                | stat.S_IROTH
                            )
                            os.chmod(file_path, file_perms)
            except Exception as e:
                logger.warning(f"Could not fix permissions, removing directory: {e}")
                shutil.rmtree("./chroma_db")

        # Initialize Chroma client and create a dedicated collection per
        # namespace. This avoids the previous "namespace not supported" errors
        # when filtering on a metadata field that had not yet been indexed.

        self.embeddings = embeddings
        self.client = chromadb.PersistentClient(path="./chroma_db")

        self.collections: Dict[str, chromadb.Collection] = {}
        for ns in self.supported_namespaces:
            self.collections[ns] = self.client.get_or_create_collection(
                name=f"agent_memory_{ns}",
                metadata={
                    "hnsw:space": "cosine",
                    "hnsw:construction_ef": 100,
                    "hnsw:search_ef": 100,
                    "hnsw:M": 16,  # lower value to save memory
                },
            )

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
                logger.warning(  # noqa: E501
                    f"Error clearing namespace '{namespace}': {e}"  # noqa: E501
                )

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
            f"🧰Tool called: search_explanations with query='{query}', " f"limit={limit}"
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
        collection = self.collections.get(namespace, self.collections["user_memory"])

        embedding = self.embeddings.embed_documents([page_content])[0]
        collection.add(
            ids=[id],
            documents=[page_content],
            metadatas=[metadata],
            embeddings=[embedding],
        )
        self._increase_namespace_count(namespace, 1)

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

        collection = self.collections.get(namespace, self.collections["user_memory"])

        query_embedding = self.embeddings.embed_query(query)
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=k,
            where=filter,
        )

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

        collection = self.collections.get(namespace, self.collections["user_memory"])
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


MEMORY_RETRIEVER = None


def get_memory_retriever():
    global MEMORY_RETRIEVER
    if MEMORY_RETRIEVER is None:
        logger.info("🧠Memory: Initializing memory retriever...")
        MEMORY_RETRIEVER = MemoryRetriever()
    return MEMORY_RETRIEVER
