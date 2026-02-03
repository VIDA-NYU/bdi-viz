import ast
import json
import logging
from typing import Any, Callable, Dict, List, Optional

import pandas as pd
from langchain.tools.base import StructuredTool
from pydantic import BaseModel, Field

from ..session_manager import SESSION_MANAGER

logger = logging.getLogger("bdiviz_flask.sub")


class ValueTools:
    """Minimal value transformation tools: categorical mapping and numeric lambda.

    Keep it simple: exact string-to-string mapping for categorical values, and a constrained
    numeric lambda for numerical conversions.
    """

    def __init__(self, session_id: str = "default"):
        self.session_id = session_id

    def get_tools(self) -> List[StructuredTool]:
        return [
            self.preview_value_map_tool,
            self.apply_value_map_tool,
            self.preview_numeric_lambda_tool,
            self.apply_numeric_lambda_tool,
        ]

    # ---------- Helpers ----------
    def _compile_numeric_lambda(self, lambda_src: str) -> Callable[[Any], Any]:
        """Compile a very restricted numeric lambda like 'lambda x: x*0.1 + 2'."""
        if not isinstance(lambda_src, str) or not lambda_src.strip().startswith(
            "lambda"
        ):
            raise ValueError("lambda must start with 'lambda'")

        tree = ast.parse(lambda_src, mode="eval")

        allowed_names = {"int": int, "float": float, "round": round}
        allowed_ops = (
            ast.Add,
            ast.Sub,
            ast.Mult,
            ast.Div,
        )

        def _validate(node: ast.AST) -> None:
            if isinstance(node, (ast.Expression, ast.Lambda, ast.arguments, ast.arg)):
                for child in ast.iter_child_nodes(node):
                    _validate(child)
                return
            if isinstance(node, ast.Name):
                if node.id != "x" and node.id not in allowed_names:
                    raise ValueError(f"Name '{node.id}' not allowed in numeric lambda")
                return
            if isinstance(node, ast.Constant):
                return
            if isinstance(node, ast.BinOp):
                if not isinstance(node.op, allowed_ops):
                    raise ValueError("Only +, -, *, / are allowed")
                _validate(node.left)
                _validate(node.right)
                return
            if isinstance(node, ast.UnaryOp) and isinstance(
                node.op, (ast.UAdd, ast.USub)
            ):
                _validate(node.operand)
                return
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id not in allowed_names:
                    raise ValueError(f"Call to '{node.func.id}' not allowed")
                for arg in node.args:
                    _validate(arg)
                for kw in node.keywords:
                    _validate(kw.value)
                return
            raise ValueError(f"Disallowed node: {type(node).__name__}")

        _validate(tree)
        compiled = compile(tree, filename="<lambda>", mode="eval")
        # Names like int/float/round must be available at runtime in the function's globals.
        safe_globals: Dict[str, Any] = {"__builtins__": {}}
        safe_globals.update(allowed_names)
        func = eval(compiled, safe_globals, {})

        def _fn(x: Any) -> Any:
            # Call the evaluated lambda function with x
            return func(x)

        return _fn

    # ---------- Value map (categorical) ----------
    @property
    def preview_value_map_tool(self) -> StructuredTool:
        class PreviewMapInput(BaseModel):
            source_column: str = Field(description="Source column to map")
            target_column: str = Field(
                description="Target column where the mappings come from"
            )
            mapping: Dict[str, Any] = Field(description="Exact string-to-value mapping")
            sample_n: Optional[int] = Field(
                default=50, description="Number of unique examples to preview"
            )

        def _preview_value_map(
            source_column: str,
            target_column: str,
            mapping: Dict[str, Any],
            sample_n: int = 50,
        ) -> str:
            mt = SESSION_MANAGER.get_session(self.session_id).matching_task
            df = mt.get_source_df()
            if df is None or source_column not in df.columns:
                return json.dumps({"error": f"Column '{source_column}' not found"})
            uniques = list(df[source_column].dropna().astype(str).unique())
            examples = uniques[: max(1, sample_n)]
            before_after = []
            changed = 0
            covered = 0
            for v in examples:
                new_v = mapping.get(v, v)
                before_after.append({"before": v, "after": new_v})
                if new_v != v:
                    changed += 1
                if v in mapping:
                    covered += 1
            res = {
                "source_column": source_column,
                "target_column": target_column,
                "total_previewed": len(examples),
                "changed_count": changed,
                "covered_in_mapping": covered,
                "examples": before_after,
            }
            logger.info(
                (
                    "🧰Tool called: preview_value_map "
                    f"source_column={source_column} target_column={target_column} "
                    f"size={len(mapping)}"
                )
            )
            return json.dumps(res, indent=2)

        return StructuredTool.from_function(
            func=_preview_value_map,
            name="preview_value_map",
            description=(
                """
                Preview exact value-to-value mapping on a source column.

                Inputs:
                - source_column (str): Source column name.
                - target_column (str): Target column name where the mappings come from.
                - mapping (Dict[str, Any]): Exact string->value mapping. Keys are compared on str(value).
                - sample_n (int, optional): Number of unique examples to preview (default: 50).

                Returns (JSON string):
                {
                  "source_column": str,
                  "target_column": str,
                  "total_previewed": int,
                  "changed_count": int,               # how many of the previewed examples would change
                  "covered_in_mapping": int,           # how many previewed examples are keys in mapping
                  "examples": [ {"before": Any, "after": Any}, ... ]
                }

                One-shot example:
                {
                  "source_column": "country",
                  "target_column": "country_full_name",
                  "mapping": {"USA": "United States", "U.S.": "United States"},
                  "sample_n": 20
                }
                """
            ),
            args_schema=PreviewMapInput,
        )

    @property
    def apply_value_map_tool(self) -> StructuredTool:
        class ApplyMapInput(BaseModel):
            source_column: str = Field(description="Source column to map")
            target_column: str = Field(
                description="Target column where the mappings come from"
            )
            mapping: Dict[str, Any] = Field(description="Exact string-to-value mapping")

        def _apply_value_map(
            source_column: str, target_column: str, mapping: Dict[str, Any]
        ) -> str:
            """
            Apply an exact categorical mapping:
            - Update value_matches for the given (source, target) pair.
            - Record the change in the user operation history (Timeline).
            """
            try:
                mt = SESSION_MANAGER.get_session(self.session_id).matching_task
                df = mt.get_source_df()
                if df is None or source_column not in df.columns:
                    return json.dumps({"error": f"Column '{source_column}' not found"})

                # Normalize mapping to strings once
                normalized_items = [
                    (str(source_val), str(target_val))
                    for source_val, target_val in mapping.items()
                ]

                # Update target value mappings via the operation system so Timeline is updated.
                mt.apply_operation(
                    operation="map_target_value",
                    candidate={
                        "sourceColumn": source_column,
                        "targetColumn": target_column,
                    },
                    references=[],
                    value_mappings=[
                        {"from": from_val, "to": to_val}
                        for from_val, to_val in normalized_items
                    ],
                )

                logger.info(
                    (
                        "🧰Tool called: apply_value_map "
                        f"source_column={source_column} target_column={target_column} "
                        f"size={len(mapping)}"
                    )
                )
                return json.dumps(
                    {
                        "status": "ok",
                        "source_column": source_column,
                        "target_column": target_column,
                    },
                    indent=2,
                )
            except Exception as e:
                logger.error(
                    (
                        "🧰Tool error: apply_value_map "
                        f"source_column={source_column} target_column={target_column}: {str(e)}"
                    )
                )
                return json.dumps({"error": str(e)})

        return StructuredTool.from_function(
            func=_apply_value_map,
            name="apply_value_map",
            description=(
                """
                Apply exact value-to-value mapping on a source column and update caches.

                Inputs:
                - source_column (str): Source column name.
                - target_column (str): Target column name where the mappings come from.
                - mapping (Dict[str, Any]): Exact string->value mapping. Keys match str(cell).

                Effects:
                - Updates MatchingTask.value_matches for the given (source, target) pair.
                - Records a map_target_value operation in history so Timeline can display it.

                Returns (JSON string):
                {"status": "ok", "source_column": str, "target_column": str}

                One-shot example:
                {
                  "source_column": "country",
                  "target_column": "country_full_name",
                  "mapping": {"USA": "United States", "U.S.": "United States"}
                }
                """
            ),
            args_schema=ApplyMapInput,
        )

    # ---------- Numeric lambda ----------
    @property
    def preview_numeric_lambda_tool(self) -> StructuredTool:
        class PreviewLambdaInput(BaseModel):
            source_column: str = Field(description="Source numeric column to transform")
            target_column: str = Field(
                description="Target column where the mappings come from"
            )
            lambda_code: str = Field(
                description="A simple lambda like 'lambda x: x*0.1' "
            )
            sample_n: Optional[int] = Field(
                default=50, description="Number of unique examples to preview"
            )

        def _preview_numeric_lambda(
            source_column: str, target_column: str, lambda_code: str, sample_n: int = 50
        ) -> str:
            mt = SESSION_MANAGER.get_session(self.session_id).matching_task
            df = mt.get_source_df()
            if df is None or source_column not in df.columns:
                return json.dumps({"error": f"Column '{source_column}' not found"})
            fn = self._compile_numeric_lambda(lambda_code)

            before_lambda_col = df[source_column].dropna().sample(n=sample_n)
            before_lambda_col = pd.to_numeric(before_lambda_col, errors="coerce")
            after_lambda_col = before_lambda_col.apply(fn)
            return json.dumps(
                {
                    "source_column": source_column,
                    "target_column": target_column,
                    "before_lambda": before_lambda_col.to_list(),
                    "after_lambda": after_lambda_col.to_list(),
                },
                indent=2,
            )

        return StructuredTool.from_function(
            func=_preview_numeric_lambda,
            name="preview_numeric_lambda",
            description=(
                """
                Preview a simple numeric lambda on a source column.

                Inputs:
                - source_column (str): Source numeric column name.
                - target_column (str): Target column name where the mappings come from.
                - lambda_code (str): A constrained lambda starting with 'lambda', e.g. 'lambda x: x/12'.
                  Allowed: +, -, *, /, unary +/- and builtins int/float/round.
                - sample_n (int, optional): Number of unique examples to preview (default: 50).

                Returns (JSON string):
                {"column": str, "before_lambda": [ int, float, ... ], "after_lambda": [ int, float, ... ]}

                One-shot example:
                {
                  "source_column": "age_months",
                  "target_column": "age_years",
                  "lambda_code": "lambda x: x/12",
                  "sample_n": 10
                }
                """
            ),
            args_schema=PreviewLambdaInput,
        )

    @property
    def apply_numeric_lambda_tool(self) -> StructuredTool:
        class ApplyLambdaInput(BaseModel):
            source_column: str = Field(description="Source numeric column to transform")
            target_column: str = Field(
                description="Target column where the mappings come from"
            )
            lambda_code: str = Field(
                description="A simple lambda like 'lambda x: x*0.1' "
            )

        def _apply_numeric_lambda(
            source_column: str, target_column: str, lambda_code: str
        ) -> str:
            try:
                mt = SESSION_MANAGER.get_session(self.session_id).matching_task
                df = mt.get_source_df()
                if df is None or source_column not in df.columns:
                    return json.dumps({"error": f"Column '{source_column}' not found"})
                fn = self._compile_numeric_lambda(lambda_code)

                # Apply lambda only to numeric-coercible entries; keep others unchanged
                def _apply_if_numeric(v: Any) -> Any:
                    try:
                        # Allow numeric-like strings
                        num = float(v)
                    except Exception:
                        return v
                    try:
                        return fn(num)
                    except Exception:
                        return v

                df[source_column] = df[source_column].apply(_apply_if_numeric)

                # Apply to matching task value_matches
                value_matches = mt.get_value_matches()
                if source_column not in value_matches:
                    return json.dumps(
                        {
                            "error": f"Column '{source_column}' not found in value_matches"
                        }
                    )
                source_unique_values = value_matches[source_column][
                    "source_unique_values"
                ]
                for source_value_before in source_unique_values:
                    try:
                        source_num = float(source_value_before)
                        source_value_after = fn(source_num)
                    except Exception:
                        source_value_after = source_value_before
                    mt.set_target_value_match(
                        source_column,
                        source_value_before,
                        target_column,
                        str(source_value_after),
                    )

                logger.info(
                    f"🧰Tool called: apply_numeric_lambda source_column={source_column} target_column={target_column}"
                )
                return json.dumps(
                    {
                        "status": "ok",
                        "source_column": source_column,
                        "target_column": target_column,
                    },
                    indent=2,
                )
            except Exception as e:
                logger.error(
                    (
                        "🧰Tool error: apply_numeric_lambda "
                        f"source_column={source_column} target_column={target_column}: {str(e)}"
                    )
                )
                return json.dumps({"error": str(e)})

        return StructuredTool.from_function(
            func=_apply_numeric_lambda,
            name="apply_numeric_lambda",
            description=(
                """
                Apply a simple numeric lambda on a source column.

                Inputs:
                - source_column (str): Source numeric column name.
                - target_column (str): Target column name where the mappings come from.
                - lambda_code (str): A constrained lambda starting with 'lambda', e.g. 'lambda x: x/12'.
                  Allowed: +, -, *, /, unary +/- and builtins int/float/round.

                Effects:
                - Mutates the source dataframe column with the lambda output.

                Returns (JSON string):
                {"status": "ok", "source_column": str, "target_column": str}

                One-shot example:
                {
                  "source_column": "age_months",
                  "target_column": "age_years",
                  "lambda_code": "lambda x: x/12"
                }
                """
            ),
            args_schema=ApplyLambdaInput,
        )
