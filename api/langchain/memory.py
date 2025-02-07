import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from langchain.embeddings import init_embeddings
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
        "targetValues": ["native hawaiian or other pacific islander", "white", "asian"],
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
        "mismatches",
        "matches",
        "explanations",
    ]

    def __init__(self):
        embeddings = init_embeddings("openai:text-embedding-3-small")
        self.store = InMemoryStore(
            index={
                "embed": embeddings,
                "dims": 1536,
            }
        )
        self.user_id = "bdi_viz_user"

        for fp in FP_CANDIDATES:
            self.put_mismatch(fp)
        for fn in FN_CANDIDATES:
            self.put_match(fn)

    # puts
    def put_match(self, value: Dict[str, Any]):
        """
        value is in the following format:
        {
            'sourceColumn': 'Path_Stage_Primary_Tumor-pT',
            'targetColumn': 'ajcc_pathologic_stage',
            'sourceValues': ['pT1b (FIGO IB)', 'pT3a (FIGO IIIA)', 'pT1 (FIGO I)'],
            'targetValues': ['Stage I', 'Stage IB', 'StageIIIA']
        }
        """
        key = f"{value['sourceColumn']}::{value['targetColumn']}"
        self.put((self.user_id, "matches"), key, value)

    def put_mismatch(self, value: Dict[str, Any]) -> None:
        """
        Args:
            value (Dict[str, Any]): The value to store in the memory.
            {
                'sourceColumn': 'Path_Stage_Primary_Tumor-pT',
                'targetColumn': 'ajcc_pathologic_stage',
                'sourceValues': ['pT1b (FIGO IB)', 'pT3a (FIGO IIIA)', 'pT1 (FIGO I)'],
                'targetValues': ['Stage I', 'Stage IB', 'StageIIIA']
            }
        
        Returns:
            None
        """
        key = f"{value['sourceColumn']}::{value['targetColumn']}"
        self.put((self.user_id, "mismatches"), key, value)

    def put_explanation(self, explanations: List[Dict[str, Any]], user_operation: Dict[str, Any]) -> None:
        """
        Args:
            explanations (List[Dict[str, Any]]): A list of explanations to store in the memory.
            {
                'id': string;
                'type': ExplanationType;
                'text': string;
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
        
        # Only keep at most 5 most recent explanations
        existing_explanations = self.store.get((self.user_id, "explanations"), key)
        if existing_explanations is not None:
            existing_explanations = existing_explanations.value
            explanations = [{
                "type": explanation["type"],
                "content": explanation["text"],
                "confidence": explanation["confidence"]
            } for explanation in explanations]
            explanations = (explanations + existing_explanations)[:5]
        self.put((self.user_id, "explanations"), key, explanations)


    # Search
    def search_mismatches(self, query: Dict[str, Any], limit: int = 10):
        return self.search((self.user_id, "mismatches"), query, limit)

    def search_matches(self, query: Dict[str, Any], limit: int = 10):
        return self.search((self.user_id, "matches"), query, limit)
    
    def search_explanations(self, query: Dict[str, Any], limit: int = 10):
        return self.search((self.user_id, "explanations"), query, limit)


    # Basic operations
    def check_value(func):
        def wrapper(self, namespace: Tuple, key: Optional[str], value: Any):
            if value is None:
                raise ValueError("Value cannot be None")
            if namespace[1] not in self.supported_namespaces:
                raise ValueError(f"Namespace {namespace[1]} not supported")
            return func(self, namespace, key, value)

        return wrapper

    @check_value
    def put(self, namespace: Tuple, key: Optional[str], value: Any):
        if key is None:
            key = str(uuid4())
        if self.store.get(namespace, key) is not None:
            logger.info(
                f"Key {key} already exists in namespace {namespace}, updating value"
            )
            self.store.delete(namespace, key)

        self.store.put(namespace, key, value)

    def search(self, namespace: Tuple, query: Any, limit: int = 10):
        logger.critical(f"namespace: {namespace}, query: {query}, limit: {limit}")
        items = self.store.search(namespace, query=query, limit=limit)
        return [item.value for item in items]
