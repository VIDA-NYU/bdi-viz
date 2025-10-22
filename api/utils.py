import hashlib
import importlib
import json
import logging
import os
import re
import subprocess
import sys
import time
from io import StringIO
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import requests
from tqdm.autonotebook import tqdm

logger = logging.getLogger("bdiviz_flask.sub")

CACHE_DIR = ".cache"
EXPLANATION_DIR = os.path.join(CACHE_DIR, "explanations")
# Global cache for inferred ontologies keyed by dataset checksum
ONTOLOGY_CACHE_DIR = os.path.join(CACHE_DIR, "ontologies")
# Root directory for per-session assets under the api package
SESSIONS_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sessions")


def check_cache_dir(func):
    def wrapper(*args, **kwargs):
        if not os.path.exists(CACHE_DIR):
            os.makedirs(CACHE_DIR)
        return func(*args, **kwargs)

    return wrapper


def sanitize_session_name(name: Optional[str]) -> str:
    """Sanitize session name to URL/file-system safe string.

    Allows only [A-Za-z0-9_-], trims length to 64, defaults to 'default'.
    """
    if not name or not isinstance(name, str):
        return "default"
    # Replace invalid chars
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", name)
    # Collapse repeats and trim
    safe = re.sub(r"_+", "_", safe).strip("_")
    if not safe:
        safe = "default"
    return safe[:64]


def get_session_dir(session_name: str, create: bool = True) -> str:
    """Return absolute path to the per-session directory under api/sessions.

    Creates the directory if create=True.
    """
    safe = sanitize_session_name(session_name)
    path = os.path.join(SESSIONS_ROOT, safe)
    if create and not os.path.exists(path):
        os.makedirs(path, exist_ok=True)
    return path


def get_session_file(session_name: str, filename: str, create_dir: bool = True) -> str:
    """Join a file name under the session directory (optionally creating it)."""
    session_dir = get_session_dir(session_name, create=create_dir)
    return os.path.join(session_dir, filename)


def extract_session_name(request) -> str:
    """Extract session name from JSON or form; default to 'default'."""
    try:
        if getattr(request, "form", None) and request.form is not None:
            if "session_name" in request.form:
                return sanitize_session_name(request.form.get("session_name"))
        if getattr(request, "json", None) and request.json is not None:
            return sanitize_session_name(request.json.get("session_name", "default"))
    except Exception:
        pass
    return "default"


def extract_data_from_request(request):
    source_df = None
    target_df = None
    target_json = None
    groundtruth_pairs = None

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
            target_raw = json.load(target_json_string_io)
            valid, err = validate_flat_ontology_json(target_raw)
            if valid:
                target_json = target_raw
            else:
                logger.error(f"Invalid target JSON schema: {err}")
                target_json = None
            # If no target CSV was provided, synthesize a DataFrame from ontology JSON
            logger.critical("Synthesizing target DataFrame from ontology JSON")
            if target_df is None and isinstance(target_json, dict):
                target_df = build_dataframe_from_ontology_json(target_json)

        if "groundtruth_csv" in form:
            groundtruth_csv = form["groundtruth_csv"]
            groundtruth_csv_string_io = StringIO(groundtruth_csv)
            groundtruth_df = pd.read_csv(groundtruth_csv_string_io, sep=",")
            groundtruth_pairs = parse_ground_truth_pairs(groundtruth_df)

    return source_df, target_df, target_json, groundtruth_pairs


# ----------------------
# CSV with comment metadata helpers
# ----------------------


def write_csv_with_comments(
    df: pd.DataFrame, path: str, meta: Optional[Dict[str, Any]] = None
) -> None:
    """Write a CSV file with leading comment lines encoding metadata.

    Each metadata entry is emitted as: `# key: value` on its own line, followed by
    a blank line and the CSV content.
    """
    lines: List[str] = []
    if meta:
        for key, value in meta.items():
            try:
                lines.append(f"# {key}: {value}")
            except Exception:
                lines.append(f"# {key}: {str(value)}")
    lines.append("")
    header = "\n".join(lines)
    with open(path, "w", encoding="utf-8") as f:
        f.write(header + "\n")
        df.to_csv(f, index=False)


def write_session_csv_with_comments(
    df: pd.DataFrame,
    session_name: str,
    which: str,
    meta: Optional[Dict[str, Any]] = None,
) -> str:
    """Write a per-session CSV with metadata comments. Returns written path.

    which: 'source' | 'target'
    """
    if which not in {"source", "target"}:
        raise ValueError("which must be 'source' or 'target'")
    filename = f"{which}.csv"
    path = get_session_file(session_name, filename, create_dir=True)
    # Best-effort: include checksum in metadata
    try:
        checksum = compute_dataframe_checksum(df)
        enriched_meta = dict(meta or {})
        enriched_meta.setdefault("checksum", checksum)
    except Exception:
        enriched_meta = meta
    write_csv_with_comments(df, path, enriched_meta)
    return path


def read_csv_with_comments(path: str) -> Tuple[pd.DataFrame, Dict[str, str]]:
    """Read a CSV previously written by write_csv_with_comments.

    Returns a tuple of (DataFrame, metadata_dict).
    """
    meta: Dict[str, str] = {}
    with open(path, "r", encoding="utf-8") as f:
        all_lines = f.readlines()

    i = 0
    while i < len(all_lines) and all_lines[i].startswith("#"):
        line = all_lines[i][1:].strip()
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
        i += 1

    if i < len(all_lines) and all_lines[i].strip() == "":
        i += 1

    csv_text = "".join(all_lines[i:])
    df = pd.read_csv(StringIO(csv_text))
    return df, meta


def read_session_csv_with_comments(
    session_name: str, which: str
) -> Tuple[pd.DataFrame, Dict[str, str]]:
    """Read a per-session CSV written by write_session_csv_with_comments.

    which: 'source' | 'target'
    """
    if which not in {"source", "target"}:
        raise ValueError("which must be 'source' or 'target'")
    path = get_session_file(session_name, f"{which}.csv", create_dir=False)
    return read_csv_with_comments(path)


def _ensure_ontology_cache_dir() -> str:
    """Ensure and return the ontology cache directory path."""
    if not os.path.exists(ONTOLOGY_CACHE_DIR):
        os.makedirs(ONTOLOGY_CACHE_DIR, exist_ok=True)
    return ONTOLOGY_CACHE_DIR


def compute_dataframe_checksum(df: pd.DataFrame) -> str:
    """Compute a stable checksum for a DataFrame's contents and schema.

    Uses pandas' hashing plus column names to build a sha256 hex digest.
    """
    try:
        hashed = pd.util.hash_pandas_object(df, index=True).values.tobytes()
        m = hashlib.sha256()
        m.update(hashed)
        # Include column names to protect against collisions when shapes align
        m.update("||".join(list(df.columns)).encode("utf-8"))
        return m.hexdigest()
    except Exception:
        csv_bytes = df.to_csv(index=True).encode("utf-8")
        return hashlib.sha256(csv_bytes).hexdigest()


def _cached_ontology_path(checksum: str, which: str) -> str:
    """Return path to cached ontology json for checksum and dataset side."""
    which_safe = which if which in {"source", "target"} else "target"
    cache_dir = _ensure_ontology_cache_dir()
    return os.path.join(cache_dir, f"{which_safe}_{checksum}.json")


def read_cached_ontology(checksum: str, which: str) -> Optional[Dict[str, Any]]:
    """Read cached ontology by checksum if present."""
    try:
        path = _cached_ontology_path(checksum, which)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return None


def write_cached_ontology(
    ontology_flat: Dict[str, Any], checksum: str, which: str
) -> None:
    """Write ontology json to checksum-keyed cache."""
    try:
        path = _cached_ontology_path(checksum, which)
        _ensure_ontology_cache_dir()
        with open(path, "w", encoding="utf-8") as f:
            json.dump(ontology_flat, f)
    except Exception:
        pass


def load_source_df(session_name: Optional[str] = None) -> pd.DataFrame:
    """Load source dataframe.

    If session_name provided, load from sessions/{session}/source.csv; else
    load the legacy top-level .source.csv (backward compatibility).
    """
    if session_name:
        df, _ = read_session_csv_with_comments(session_name, "source")
        return df
    df, _ = read_csv_with_comments(".source.csv")
    return df


def load_target_df(session_name: Optional[str] = None) -> pd.DataFrame:
    """Load target dataframe with session awareness (see load_source_df)."""
    if session_name:
        df, _ = read_session_csv_with_comments(session_name, "target")
        return df
    df, _ = read_csv_with_comments(".target.csv")
    return df


def parse_ground_truth_pairs(df: pd.DataFrame) -> List[Tuple[str, str]]:
    if df.shape[1] != 2:
        raise ValueError("Ground truth CSV must have exactly 2 columns")
    return [(df.iloc[i, 0], df.iloc[i, 1]) for i in range(df.shape[0])]


@check_cache_dir
def sanitize_filename(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", name)


def _get_explanation_dir() -> str:
    """Return explanation directory path, session-scoped if provided."""
    path = EXPLANATION_DIR
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)
    return path


def write_candidate_explanation_json(
    source_col: str,
    target_col: str,
    candidate_explanation: Dict[str, Any],
) -> None:
    dir_path = _get_explanation_dir()

    sanitized_source_col = sanitize_filename(source_col)
    sanitized_target_col = sanitize_filename(target_col)
    output_path = os.path.join(
        dir_path, f"{sanitized_source_col}_{sanitized_target_col}.json"
    )
    with open(output_path, "w") as f:
        json.dump(candidate_explanation, f, indent=4)


def read_candidate_explanation_json(
    source_col: str, target_col: str
) -> Optional[Dict[str, Any]]:
    sanitized_source_col = sanitize_filename(source_col)
    sanitized_target_col = sanitize_filename(target_col)

    legacy_path = os.path.join(
        EXPLANATION_DIR, f"{sanitized_source_col}_{sanitized_target_col}.json"
    )
    if os.path.exists(legacy_path):
        with open(legacy_path, "r") as f:
            return json.load(f)

    return None


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
    os.path.dirname(__file__), "./resources/gdc_ontology.json"
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
        logger.critical("properties not in ontology")
        return

    properties = ontology["properties"]
    json_dict = {}
    for property in properties:
        if "column_name" not in property:
            continue
        column_name = property["column_name"]
        json_dict[column_name] = property

    return json_dict


def build_dataframe_from_ontology_json(ontology_flat: Dict[str, Any]) -> pd.DataFrame:
    """Construct a DataFrame from an ontology JSON schema.

    - Columns: keys of the ontology_flat dict.
    - If a column has an `enum` list: produce one row per enum value.
      Other columns in those rows are NaN.
    - If a column has no enum: fill NaN for that column in all rows.
    - The final number of rows equals the maximum enum length across columns,
      with shorter enum columns padded by NaN.
    """
    columns = list(ontology_flat.keys())
    enum_lists: Dict[str, List[Any]] = {}
    max_len = 0
    for col in columns:
        spec = ontology_flat.get(col, {}) or {}
        values = spec.get("enum", [])
        if isinstance(values, list) and len(values) > 0:
            enum_lists[col] = values
            if len(values) > max_len:
                max_len = len(values)
        else:
            enum_lists[col] = []
    if max_len == 0:
        # No enums at all → single row of NaNs
        return pd.DataFrame({col: [pd.NA] for col in columns})

    data: Dict[str, List[Any]] = {}
    for col in columns:
        values = enum_lists.get(col, [])
        padded = list(values) + [pd.NA] * (max_len - len(values))
        data[col] = padded
    return pd.DataFrame(data)


def validate_flat_ontology_json(obj: Any) -> Tuple[bool, str]:
    """Validate flat ontology JSON shape: { column_name: {column_name, category, node, type, ...} }

    Returns (True, "") when valid; otherwise (False, reason).
    """
    if not isinstance(obj, dict) or not obj:
        return False, "Root must be a non-empty object mapping column names to specs"
    for col, spec in obj.items():
        if not isinstance(col, str) or not col:
            return False, "Column key must be a non-empty string"
        if not isinstance(spec, dict):
            return False, f"Spec for '{col}' must be an object"
        # Required fields
        for key in ("column_name", "category", "node", "type"):
            if key not in spec:
                return False, f"Spec for '{col}' missing required field '{key}'"
        # column_name must match key
        if spec.get("column_name") != col:
            return (
                False,
                f"Spec for '{col}' has mismatched column_name '{spec.get('column_name')}'",
            )
        # type-specific checks
        t = spec.get("type")
        if t == "enum":
            enums = spec.get("enum")

            def _valid_item(x: Any) -> bool:
                return isinstance(x, (str, int, float, bool)) or x is None

            if not isinstance(enums, list) or not all(_valid_item(x) for x in enums):
                return False, f"Spec for '{col}' has invalid 'enum' list"
        # Optional numeric constraints can exist for integer/number types; skip strict validation
    return True, ""


def load_ontology_flat(session_name: Optional[str] = None) -> Dict[str, Any]:
    """Load flat target ontology, preferring session file when provided."""
    if session_name:
        path = get_session_file(session_name, "target.json", create_dir=False)
        with open(path, "r") as f:
            return json.load(f)
    with open(".target.json", "r") as f:
        return json.load(f)


def load_ontology(
    dataset: str = "target",
    columns: Optional[List[str]] = None,
    session: Optional[str] = None,
) -> Optional[List[Dict]]:
    """
    Load the ontology from a JSON file.

    Returns:
        List[Dict]: The loaded ontology.
    """
    try:
        if session:
            path = get_session_file(session, f"{dataset}.json", create_dir=False)
        else:
            path = f".{dataset}.json"
        with open(path, "r") as f:
            ontology_flat = json.load(f)
    except Exception as e:
        logger.error(f"Error loading ontology: {e}")
        return None

    hiarchies = {}

    if columns is None:
        columns_to_process = list(ontology_flat.keys())
    else:
        # If target_columns is empty, use all columns from the ontology
        columns_to_process = list(columns) if columns else list(ontology_flat.keys())

    for target_column in columns_to_process:
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


def load_property(
    target_column: str, is_target: bool = True, session: Optional[str] = "default"
) -> Optional[Dict[str, Any]]:
    try:
        if is_target:
            path = get_session_file(session, "target.json", create_dir=False)
        else:
            path = get_session_file(session, "source.json", create_dir=False)
        with open(path, "r") as f:
            ontology_flat = json.load(f)

        property = None
        if target_column in ontology_flat:
            property = ontology_flat[target_column]

        return property
    except Exception as e:
        logger.error(f"Error loading property: {e}")
        return None


# Verify and return the new matcher from its code, the code should be a class
def verify_new_matcher(
    name: str, code: str, params: Dict[str, Any]
) -> Tuple[Optional[str], Optional[object]]:
    matcher_name = name
    matcher_obj = None

    try:
        # Extract imports from the code
        import_lines = [
            line.strip()
            for line in code.split("\n")
            if line.strip().startswith("import ") or line.strip().startswith("from ")
        ]
        logger.info(f"import_lines: {import_lines}")

        # Try to import each module and install if missing
        for import_line in import_lines:
            try:
                if import_line.startswith("import "):
                    module_name = (
                        import_line.split("import ")[1]
                        .split(" as ")[0]
                        .split(",")[0]
                        .strip()
                    )
                elif import_line.startswith("from "):
                    module_name = (
                        import_line.split("from ")[1].split(" import ")[0].strip()
                    )

                # Try importing the module
                importlib.import_module(module_name)

                logger.info(f"Importing: {module_name}")
            except ImportError:
                logger.info(f"Installing missing module: {module_name}")
                subprocess.check_call(
                    [sys.executable, "-m", "pip", "install", module_name]
                )

        # Create a new matcher function
        matcher_globals = {}
        exec(code, matcher_globals)

        # Check if the matcher function is defined
        if matcher_name not in matcher_globals:
            error_message = f"Matcher {name} is not defined"
            logger.error(error_message)
            return error_message, None

        # Check if the matcher function is callable
        if not callable(matcher_globals[matcher_name]):
            error_message = f"Matcher {name} is not callable"
            logger.error(error_message)
            return error_message, None

        # Create an instance of the matcher
        logger.info(f"Params: {params}")
        matcher_obj = matcher_globals[matcher_name](**params)

        # Check if the matcher has the required methods
        if not hasattr(matcher_obj, "top_matches"):
            error_message = (
                f"Matcher {name} does not have the required method 'top_matches'"
            )
            logger.error(error_message)
            return error_message, None

        # if not hasattr(matcher_obj, 'top_value_matches'):
        #     error_message = f"Matcher {name} does not have the required method 'top_value_matches'"
        #     logger.error(error_message)
        #     return error_message, None

        return None, matcher_obj
    except Exception as e:
        error_message = f"Error verifying new matcher: {e}"
        logger.error(error_message)
        return error_message, None


class TaskState:
    """
    A class to represent the state of a task.
    task_type: str, task type
    task_id: str, celery task id
    state: str, task state
    progress: int, task progress
    log_message: str, task log message
    total_steps: int, total steps
    completed_steps: int, completed steps
    logs: list, task logs

    example json style:
        {
            "status": "idle",
            "progress": 0,
            "current_step": "Task start...",
            "total_steps": 4,
            "completed_steps": 0,
            "logs": [],
        }
    """

    def __init__(
        self,
        task_type: str,
        task_id: str,
        new_task: bool = False,
        session_name: Optional[str] = None,
    ) -> None:
        self.task_type = task_type
        self.task_id = task_id
        self.session_name = (
            sanitize_session_name(session_name) if session_name else "default"
        )
        if new_task:
            self._initialize_task_state()
        else:
            self._load_task_state()

    def _initialize_task_state(self) -> None:
        self.task_state = {
            "status": "idle",
            "progress": 0,
            "current_step": "Task start...",
            "total_steps": 4,
            "completed_steps": 0,
            "logs": [],
        }
        self._save_task_state()

    def _task_state_dir(self) -> str:
        # Place task state under session directory: api/sessions/{session}/task_state
        base = get_session_dir(self.session_name, create=True)
        path = os.path.join(base, "task_state")
        os.makedirs(path, exist_ok=True)
        return path

    def _task_state_path(self) -> str:
        # New canonical location inside the api directory
        safe_session = sanitize_session_name(self.session_name)
        return os.path.join(
            self._task_state_dir(),
            f"task_state_{self.task_type}_{safe_session}_{self.task_id}.json",
        )

    def _save_task_state(self) -> None:
        # add attempt to save task state
        for attempt in range(5):
            try:
                # Ensure directory exists
                os.makedirs(self._task_state_dir(), exist_ok=True)
                path = self._task_state_path()
                with open(path, "w") as f:
                    json.dump(self.task_state, f, indent=4)
                logger.info(f"Saved task state to {os.path.abspath(path)}")
                break
            except Exception as e:
                logger.error(
                    f"Failed to save task state: {str(e)}, attempt {attempt + 1}"
                )
                time.sleep(0.05 * (attempt + 1))

    def _load_task_state(self) -> None:
        # add attempt to load task state
        for attempt in range(5):
            try:
                # Try canonical path first
                canonical_path = self._task_state_path()
                if os.path.exists(canonical_path):
                    with open(canonical_path, "r") as f:
                        logger.info(
                            f"Loading task state from {os.path.abspath(canonical_path)}"
                        )
                        loaded_state = json.load(f)
                    self.task_state = loaded_state
                    return
            except Exception as e:
                logger.error(
                    f"Failed to load task state: {str(e)}, attempt {attempt + 1}"
                )
                time.sleep(0.05 * (attempt + 1))
        self._initialize_task_state()

    def _update_task_state(
        self,
        replace_last_log: bool = False,
        log_message: Optional[str] = None,
        **kwargs,
    ) -> None:
        """Update task state with provided values in a uniform way"""
        updated = False
        for key in kwargs:
            if key in self.task_state:
                self.task_state[key] = kwargs[key]
                updated = True

        # Add log entry for step changes, progress changes, or explicit log_message
        log_entry = None
        if "current_step" in kwargs or "progress" in kwargs or log_message:
            log_entry = {
                "timestamp": pd.Timestamp.now().isoformat(),
                "step": kwargs.get("current_step", self.task_state["current_step"]),
                "progress": kwargs.get("progress", self.task_state["progress"]),
            }
            if log_message:
                log_entry["message"] = log_message

            if replace_last_log and self.task_state["logs"]:
                self.task_state["logs"][-1] = log_entry
            else:
                self.task_state["logs"].append(log_entry)

            logger.info(
                f"Task step: {log_entry['step']} - Progress: {log_entry['progress']}%"
                + (f" - {log_message}" if log_message else "")
            )

        # Save task state after each update
        if updated or log_entry:
            self._save_task_state()

    def get_task_state(self) -> Dict[str, Any]:
        """Return the current state of the task for monitoring progress"""
        return self.task_state
