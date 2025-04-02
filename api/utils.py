import json
import logging
import os
import re
from io import StringIO
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import requests
from tqdm.autonotebook import tqdm

logger = logging.getLogger("bdiviz_flask.sub")

CACHE_DIR = ".cache"
EXPLANATION_DIR = os.path.join(CACHE_DIR, "explanations")


def check_cache_dir(func):
    def wrapper(*args, **kwargs):
        if not os.path.exists(CACHE_DIR):
            os.makedirs(CACHE_DIR)
        return func(*args, **kwargs)

    return wrapper


def extract_session_name(request) -> str:
    if request.json is None:
        return "default"

    data = request.json
    session_name = data.get("session_name", "default")

    return session_name


def extract_data_from_request(request):
    source_df = None
    target_df = None
    target_json = None

    if request.form is None:
        return None

    form = request.form

    type = form["type"]
    if type == "csv_input":
        source_csv = form["source_csv"]
        source_csv_string_io = StringIO(source_csv)
        source_df = pd.read_csv(source_csv_string_io, sep=",")

        if "target_csv" in form:
            target_csv = form["target_csv"]
            target_csv_string_io = StringIO(target_csv)
            target_df = pd.read_csv(target_csv_string_io, sep=",")

        if "target_json" in form:
            target_json = form["target_json"]
            target_json_string_io = StringIO(target_json)
            target_json = parse_llm_generated_ontology(json.load(target_json_string_io))

    return source_df, target_df, target_json


@check_cache_dir
def sanitize_filename(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", name)


def write_candidate_explanation_json(
    source_col: str, target_col: str, candidate_explanation: Dict[str, Any]
) -> None:
    if not os.path.exists(EXPLANATION_DIR):
        os.makedirs(EXPLANATION_DIR)

    sanitized_source_col = sanitize_filename(source_col)
    sanitized_target_col = sanitize_filename(target_col)
    output_path = os.path.join(
        EXPLANATION_DIR, f"{sanitized_source_col}_{sanitized_target_col}.json"
    )
    with open(output_path, "w") as f:
        json.dump(candidate_explanation, f, indent=4)


def read_candidate_explanation_json(
    source_col: str, target_col: str
) -> Optional[Dict[str, Any]]:
    sanitized_source_col = sanitize_filename(source_col)
    sanitized_target_col = sanitize_filename(target_col)
    output_path = os.path.join(
        EXPLANATION_DIR, f"{sanitized_source_col}_{sanitized_target_col}.json"
    )
    if os.path.exists(output_path):
        with open(output_path, "r") as f:
            return json.load(f)

    return


@check_cache_dir
def download_model_pt(url: str, model_name: str) -> str:
    model_path = os.path.join(CACHE_DIR, model_name)
    if os.path.exists(model_path):
        logger.info(f"Model already exists at {model_path}")
        return model_path

    try:
        response = requests.get(url, stream=True)
        total_size = int(response.headers.get("content-length", 0))
        block_size = 1024

        with open(model_path, "wb") as f:
            for data in tqdm(
                response.iter_content(block_size),
                total=total_size // block_size,
                unit="KB",
                unit_scale=True,
            ):
                f.write(data)
    except Exception as e:
        logger.error(f"Failed to download model from {url}: {e}")
        raise

    return model_path


GDC_ONTOLOGY_FLAT_PATH = os.path.join(
    os.path.dirname(__file__), "./resources/gdc_ontology_flat.json"
)


def load_gdc_ontology(candidates: List[Dict[str, Any]]) -> List[Dict]:
    with open(GDC_ONTOLOGY_FLAT_PATH, "r") as f:
        gdc_ontology_flat = json.load(f)

    hiarchies = {}
    target_columns = set()
    for candidate in candidates:
        target_columns.add(candidate["targetColumn"])

    for target_column in list(target_columns):
        if target_column not in gdc_ontology_flat:
            continue
        ontology = gdc_ontology_flat[target_column]
        category = ontology["category"]
        node = ontology["node"]
        if category not in hiarchies:
            hiarchies[category] = {"level": 0, "children": {}}
        if node not in hiarchies[category]["children"]:
            hiarchies[category]["children"][node] = {"level": 1, "children": {}}
        hiarchies[category]["children"][node]["children"][target_column] = {
            "level": 2,
            "children": [],
        }

    ret = []
    for category, category_info in hiarchies.items():
        for node, node_info in category_info["children"].items():
            for target_column in node_info["children"].keys():
                target_column_obj = {
                    "name": target_column,
                    "parent": node,
                    "grandparent": category,
                }
                ret.append(target_column_obj)
    return ret


def load_gdc_property(target_column: str) -> Optional[Dict[str, Any]]:
    with open(GDC_ONTOLOGY_FLAT_PATH, "r") as f:
        gdc_ontology_flat = json.load(f)

    property = None
    if target_column in gdc_ontology_flat:
        property = gdc_ontology_flat[target_column]

    return property


def is_candidate_for_category(
    series: pd.Series, unique_threshold=10, ratio_threshold=0.05
):
    """
    Determine if a numerical column should be regarded as categorical.

    Parameters:
        series (pd.Series): The numerical column to evaluate.
        unique_threshold (int): Maximum number of unique values to consider the column categorical.
        ratio_threshold (float): Maximum ratio of unique values to total entries.

    Returns:
        bool: True if the column is a candidate for categorical treatment.
    """
    unique_count = series.nunique()
    total_count = series.count()
    unique_ratio = unique_count / total_count if total_count > 0 else 0

    print(
        f"Unique count: {unique_count}, Total count: {total_count}, Unique ratio: {unique_ratio:.2f}"
    )

    if unique_count <= unique_threshold or unique_ratio < ratio_threshold:
        return True
    return False


def parse_llm_generated_ontology(ontology: Dict[str, Any]) -> Dict[str, Any]:
    """
    Cache the generated ontology to a JSON file.

    Parameters:
        ontology (Dict[str, Any]): The ontology to cache.
    """
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)

    # Parse the ontology to ensure it's in the correct format
    if "properties" not in ontology:
        return

    properties = ontology["properties"]
    json_dict = {}
    for property in properties:
        if "column_name" not in property:
            continue
        column_name = property["column_name"]
        json_dict[column_name] = property

    return json_dict


def load_ontology(candidates: List[Dict[str, Any]]) -> List[Dict]:
    """
    Load the ontology from a JSON file.

    Returns:
        List[Dict]: The loaded ontology.
    """
    with open(".target.json", "r") as f:
        ontology_flat = json.load(f)

    hiarchies = {}
    target_columns = set()
    for candidate in candidates:
        target_columns.add(candidate["targetColumn"])

    for target_column in list(target_columns):
        if target_column not in ontology_flat:
            continue
        ontology = ontology_flat[target_column]
        category = ontology["category"]
        node = ontology["node"]
        if category not in hiarchies:
            hiarchies[category] = {"level": 0, "children": {}}
        if node not in hiarchies[category]["children"]:
            hiarchies[category]["children"][node] = {"level": 1, "children": {}}
        hiarchies[category]["children"][node]["children"][target_column] = {
            "level": 2,
            "children": [],
        }

    ret = []
    for category, category_info in hiarchies.items():
        for node, node_info in category_info["children"].items():
            for target_column in node_info["children"].keys():
                target_column_obj = {
                    "name": target_column,
                    "parent": node,
                    "grandparent": category,
                }
                ret.append(target_column_obj)
    return ret


def load_property(target_column: str) -> Optional[Dict[str, Any]]:
    with open(".target.json", "r") as f:
        ontology_flat = json.load(f)

    property = None
    if target_column in ontology_flat:
        property = ontology_flat[target_column]

    return property
