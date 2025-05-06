import logging
from typing import Any, Callable, Dict, List, Optional, Tuple
from uuid import uuid4

from langchain.tools import StructuredTool
from langchain_core.documents import Document
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from langgraph.store.memory import InMemoryStore

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
        "targetValues": ["Serous adenocarcinofibroma", "clear cell", "Carcinosarcoma"],
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


class MemoryRetriver:
    supported_namespaces = [
        "candidates",
        "mismatches",
        "matches",
        "explanations",
    ]

    def __init__(self):
        # embeddings = init_embeddings("openai:text-embedding-3-large")
        embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
        self.store = InMemoryStore()  # Keep for backward compatibility
        self.vector_store = InMemoryVectorStore(embeddings)
        self.user_id = "bdi_viz_user"

        self.query_candidates_tool = StructuredTool.from_function(
            func=self.query_candidates,
            name="query_candidates",
            description="""
        Query the candidates from agent memory retriver.
        Args:
            keywords (List[str]): The keywords to search.
            source_column (Optional[str], optional): The source column name. Defaults to None.
            target_column (Optional[str], optional): The target column name. Defaults to None.
            limit (int, optional): The number of candidates to return. Defaults to 20.
        Returns:
            List[Dict[str, Any]]: The list of candidates.
        """.strip(),
        )

        self.search_ontology_tool = StructuredTool.from_function(
            func=self.search_target_schema,
            name="search_ontology",
            description="""
            Search the ontology for the most relevant information.
            Args:
                query (str): The query to search the ontology.
                candidate (Dict[str, Any]): The candidate to search the ontology.
            Returns:
                AttributeProperties: The ontology for the candidate.
            """.strip(),
        )

    # [candidates]
    def query_candidates(
        self,
        keywords: List[str],
        source_column: Optional[str] = None,
        target_column: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        query = " ".join(keywords)

        # Build filter function based on source and target columns
        def filter_func(doc: Document) -> bool:
            if doc.metadata.get("namespace") != "candidates":
                return False

            if source_column and doc.metadata.get("sourceColumn") != source_column:
                return False

            if target_column and doc.metadata.get("targetColumn") != target_column:
                return False

            return True

        results = self._search_vector_store(query, limit, filter_func)
        return [doc.metadata for doc in results]

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
        id = f"{property['column_name']}"
        page_content = f"""
Column name: {property['column_name']}
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
            "column_name": property["column_name"],
            "category": property["category"],
            "node": property["node"],
            "type": property["type"],
            "namespace": "schema",
        }
        self._add_vector_store(id, page_content, metadata)

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
            "user_id": self.user_id,
        }

        if "matcher" in value:
            metadata["matcher"] = value["matcher"]
            page_content += f"\nMatcher: {value['matcher']}"

        self._add_vector_store(key, page_content, metadata)

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
            "user_id": self.user_id,
        }

        self._add_vector_store(key, page_content, metadata)

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
            "user_id": self.user_id,
        }

        self._add_vector_store(key, page_content, metadata)

    def put_explanation(
        self, explanations: List[Dict[str, Any]], user_operation: Dict[str, Any]
    ) -> None:
        """
        Args:
            explanations (List[Dict[str, Any]]): A list of explanations to store in the memory.
            {
                'type': ExplanationType;
                'content': string;
                'confidence': number;
            }

            user_operation (Dict[str, Any]): The user operation to store in the memory.
            {
                'operation': string;
                'candidate': {
                    'sourceColumn': string;
                    'targetColumn': string;
                };
            }
        """
        key = f"{user_operation['operation']}::{user_operation['candidate']['sourceColumn']}::{user_operation['candidate']['targetColumn']}"

        # Get existing explanations
        def filter_func(doc: Document) -> bool:
            return (
                doc.metadata.get("namespace") == "explanations"
                and doc.metadata.get("key") == key
                and doc.metadata.get("user_id") == self.user_id
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
            "user_id": self.user_id,
        }

        # Remove existing document if it exists
        if existing_docs:
            self.vector_store.delete([existing_docs[0].id])

        self._add_vector_store(key, page_content, metadata)

    # Search
    def search_target_schema(self, query: str, limit: int = 10):
        def filter_func(doc: Document) -> bool:
            return doc.metadata.get("namespace") == "schema"

        return self._search_vector_store(query, limit, filter_func)

    def search_candidates(self, query: str, limit: int = 10):
        def filter_func(doc: Document) -> bool:
            return (
                doc.metadata.get("namespace") == "candidates"
                and doc.metadata.get("user_id") == self.user_id
            )

        results = self._search_vector_store(query, limit, filter_func)
        return [doc.page_content for doc in results]

    def search_mismatches(self, query: str, limit: int = 10):
        def filter_func(doc: Document) -> bool:
            return (
                doc.metadata.get("namespace") == "mismatches"
                and doc.metadata.get("user_id") == self.user_id
            )

        results = self._search_vector_store(query, limit, filter_func)
        return [doc.page_content for doc in results]

    def search_matches(self, query: str, limit: int = 10):
        def filter_func(doc: Document) -> bool:
            return (
                doc.metadata.get("namespace") == "matches"
                and doc.metadata.get("user_id") == self.user_id
            )

        results = self._search_vector_store(query, limit, filter_func)
        return [doc.page_content for doc in results]

    def search_explanations(self, query: str, limit: int = 10):
        def filter_func(doc: Document) -> bool:
            return (
                doc.metadata.get("namespace") == "explanations"
                and doc.metadata.get("user_id") == self.user_id
            )

        results = self._search_vector_store(query, limit, filter_func)
        return [doc.page_content for doc in results]

    # Vector store operations
    def _add_vector_store(self, id: str, page_content: str, metadata: Dict[str, Any]):
        self.vector_store.add_documents(
            [Document(page_content=page_content, metadata=metadata, id=id)]
        )

    def _search_vector_store(
        self,
        query: str,
        k: int = 10,
        filter: Optional[Callable[[Document], bool]] = None,
    ):
        return self.vector_store.similarity_search(query, k=k, filter=filter)
