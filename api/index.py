import json
import logging
import os
import threading
from uuid import uuid4

import pandas as pd
from celery import Celery, Task
from flask import Flask, request

# Lazy import the agent to save resources
from .langchain.pydantic import AgentResponse
from .session_manager import SESSION_MANAGER
from .utils import (
    extract_data_from_request,
    extract_session_name,
    load_gdc_property,
    load_property,
    parse_llm_generated_ontology,
    read_candidate_explanation_json,
    write_candidate_explanation_json,
)

GDC_DATA_PATH = os.path.join(os.path.dirname(__file__), "./resources/cptac-3.csv")
GDC_JSON_PATH = os.path.join(
    os.path.dirname(__file__), "./resources/gdc_ontology_flat.json"
)


# Configure Celery
def celery_init_app(app: Flask) -> Celery:
    class FlaskTask(Task):
        def __call__(self, *args: object, **kwargs: object) -> object:
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app = Celery(app.name, task_cls=FlaskTask)
    celery_app.config_from_object(app.config["CELERY"])
    celery_app.set_default()
    app.extensions["celery"] = celery_app
    # Set debug mode with low log level
    celery_app.conf.worker_log_level = "DEBUG"
    celery_app.conf.worker_log_format = (
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    return celery_app


def create_app() -> Flask:
    app = Flask("bdiviz_flask")
    app.config.from_mapping(
        CELERY=dict(
            broker_url="redis://localhost:6380/0",
            result_backend="redis://localhost:6380/0",
            task_ignore_result=False,
            task_track_started=True,
            task_time_limit=300,        # hard limit: 300s (5 min)
            task_soft_time_limit=240,   # soft limit: 240s (4 min)
        ),
    )
    app.config.from_prefixed_env()
    celery_init_app(app)
    app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 1024
    app.logger.setLevel(logging.INFO)
    return app


app = create_app()
celery = app.extensions["celery"]


_MEMORY_RETRIEVER = None


def get_memory_retriever():
    global _MEMORY_RETRIEVER
    if _MEMORY_RETRIEVER is None:
        from .langchain.memory import get_memory_retriever

        _MEMORY_RETRIEVER = get_memory_retriever()
    return _MEMORY_RETRIEVER


# Lazy load the agent only when needed
_AGENT = None


def get_agent():
    global _AGENT
    if _AGENT is None:
        from .langchain.agent import get_agent

        _AGENT = get_agent(get_memory_retriever())
    return _AGENT


_LANGGRAPH_AGENT = None


def get_langgraph_agent():
    global _LANGGRAPH_AGENT
    if _LANGGRAPH_AGENT is None:
        from .langgraph.langgraph import get_langgraph_agent

        _LANGGRAPH_AGENT = get_langgraph_agent(get_memory_retriever())
    return _LANGGRAPH_AGENT


@celery.task(bind=True)
def run_matching_task(self, session, nodes=None, infer_source_ontology=False, infer_target_ontology=False):
    try:
        app.logger.info(f"Running matching task for session: {session}")
        matching_task = SESSION_MANAGER.get_session(session).matching_task

        if os.path.exists(".source.csv") and os.path.exists(".target.csv"):
            source = pd.read_csv(".source.csv")
            target = pd.read_csv(".target.csv")

            matching_task.update_dataframe(source_df=source, target_df=target)
            matching_task._initialize_task_state()
            matching_task.set_nodes(nodes)

            if infer_source_ontology:
                agent = get_agent()
                partial_ontology = {}
                for i, chunk in enumerate(agent.stream_infer_ontology(source)):
                    # Parse chunk, update partial_ontology
                    # (You need to decide how to parse/merge each chunk)
                    # For example, if chunk contains a column's ontology:
                    # partial_ontology[chunk['column_name']] = chunk['ontology']
                    # Update progress
                    matching_task._update_task_state(progress=5, log_message=f"Source ontology: {i}...")
                    # Write partial results
                    with open(".source.json", "w") as f:
                        json.dump(partial_ontology, f)
                matching_task._update_task_state(progress=5, log_message="Source ontology inferred.")

            # Repeat for target ontology...

            candidates = matching_task.get_candidates()

            return {"status": "completed", "candidates_count": len(candidates)}

        return {"status": "failed", "message": "Source or target files not found"}
    except Exception as e:
        # Handle the NoneType Redis error and other potential exceptions
        app.logger.error(f"Error in matching task: {str(e)}")
        return {"status": "failed", "message": f"Error processing task: {str(e)}"}


@app.route("/api/matching/start", methods=["POST"])
def start_matching():
    session = "default"

    source, target, target_json = extract_data_from_request(request)

    # --- SOURCE ONTOLOGY INFERENCE ---
    source_json = None
    infer_source_ontology = False
    infer_target_ontology = False
    if os.path.exists(".source.csv"):
        # If .source.json exists, try to load it
        if os.path.exists(".source.json"):
            with open(".source.json", "r") as f:
                source_json = json.load(f)
        # If not, or if the source has changed, infer ontology
        if source_json is None or not source.equals(pd.read_csv(".source.csv")):
            infer_source_ontology = True
    else:
        # If no .source.csv, infer and cache
        infer_source_ontology = True

    # --- TARGET ONTOLOGY INFERENCE (existing logic) ---
    if target is None:
        app.logger.info("Using default GDC data")
        target = pd.read_csv(GDC_DATA_PATH)
        target_json = json.load(open(GDC_JSON_PATH, "r"))
    else:
        app.logger.info("Using uploaded target")
        if target_json is None:
            infer_target_ontology = True
        else:
            app.logger.info("Using cached ontology for uploaded target")

    # cache csvs
    source.to_csv(".source.csv", index=False)
    target.to_csv(".target.csv", index=False)
    # cache json
    with open(".target.json", "w") as f:
        json.dump(target_json, f)

    # Fix argument order: pass nodes=None explicitly
    task = run_matching_task.delay(
        session,
        nodes=None,
        infer_source_ontology=infer_source_ontology,
        infer_target_ontology=infer_target_ontology
    )
    return {"task_id": task.id}


@app.route("/api/matching/status", methods=["POST"])
def matching_status():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json
    task_id = data.get("taskId")

    if not task_id:
        return {"status": "error", "message": "No task_id provided"}, 400

    task = run_matching_task.AsyncResult(task_id)

    app.logger.info(
        f"Task state: {task.state}, {task.info}, {task.result}, {task.traceback}"
    )

    if task.state == "PENDING":
        response = {
            "status": "pending",
            "message": "Task is pending",
            "taskState": None,
        }
    elif task.state == "FAILURE":
        response = {
            "status": "failed",
            "message": str(task.info),
            "taskState": None,
        }
    elif task.state == "SUCCESS":
        source = pd.read_csv(".source.csv")
        target = pd.read_csv(".target.csv")
        matching_task.update_dataframe(source_df=source, target_df=target)
        matching_task.sync_cache()
        # matching_task.get_candidates()

        response = {
            "status": "completed",
            "result": task.result,
            "taskState": None,
        }
    else:
        task_state = matching_task._load_task_state()
        response = {
            "status": task.state,
            "message": "Task is in progress",
            "taskState": task_state,
        }

    return response


@app.route("/api/exact-matches", methods=["POST"])
def get_exact_matches():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(".source.csv"):
            source = pd.read_csv(".source.csv")
            if os.path.exists(".target.csv"):
                target = pd.read_csv(".target.csv")
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
        _ = matching_task.get_candidates()
    results = matching_task.update_exact_matches()

    return {"message": "success", "results": results}


@app.route("/api/results", methods=["POST"])
def get_results():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(".source.csv"):
            source = pd.read_csv(".source.csv")
            if os.path.exists(".target.csv"):
                target = pd.read_csv(".target.csv")
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
        _ = matching_task.get_candidates()
        # AGENT.remember_candidates(candidates)
        if os.path.exists(".target.json"):
            target_json = json.load(open(".target.json", "r"))
            # Start the ontology remembering process asynchronously
            agent = get_agent()
            threading.Thread(
                target=agent.remember_ontology, args=(target_json,)
            ).start()

    results = matching_task.to_frontend_json()

    return {"message": "success", "results": results}


@app.route("/api/value/bins", methods=["POST"])
def get_unique_values():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(".source.csv"):
            source = pd.read_csv(".source.csv")
            if os.path.exists(".target.csv"):
                target = pd.read_csv(".target.csv")
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
    results = matching_task.unique_values_to_frontend_json()

    return {"message": "success", "results": results}


@app.route("/api/value/matches", methods=["POST"])
def get_value_matches():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(".source.csv"):
            source = pd.read_csv(".source.csv")
            if os.path.exists(".target.csv"):
                target = pd.read_csv(".target.csv")
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
        _ = matching_task.get_candidates()
    results = matching_task.value_matches_to_frontend_json()

    return {"message": "success", "results": results}


@app.route("/api/gdc/ontology", methods=["POST"])
def get_gdc_ontology():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(".source.csv"):
            source = pd.read_csv(".source.csv")
            matching_task.update_dataframe(
                source_df=source, target_df=pd.read_csv(GDC_DATA_PATH)
            )
        _ = matching_task.get_candidates()
    results = matching_task._generate_gdc_ontology()

    return {"message": "success", "results": results}


@app.route("/api/ontology", methods=["POST"])
def get_ontology():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(".source.csv"):
            source = pd.read_csv(".source.csv")
            if os.path.exists(".target.csv"):
                target = pd.read_csv(".target.csv")
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
        _ = matching_task.get_candidates()

    results = matching_task._generate_ontology()

    return {"message": "success", "results": results}


@app.route("/api/gdc/property", methods=["POST"])
def get_gdc_property():
    session = extract_session_name(request)
    # Unused variable removed to save memory
    target_col = request.json["targetColumn"]

    property = load_gdc_property(target_col)

    return {"message": "success", "property": property}


@app.route("/api/property", methods=["POST"])
def get_property():
    session = extract_session_name(request)
    # Unused variable removed to save memory
    target_col = request.json["targetColumn"]

    property = load_property(target_col)

    return {"message": "success", "property": property}


@app.route("/api/candidates/results", methods=["POST"])
def get_candidates_results():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    format = request.json["format"]

    if format == "csv":
        results = matching_task.get_accepted_candidates()

        results_csv = results.to_csv(index=True)
        return {"message": "success", "results": results_csv}
    elif format == "json":
        results = matching_task.get_accepted_mappings()
        return {"message": "success", "results": results}

    else:
        return {"message": "failure", "results": None}


@app.route("/api/matchers", methods=["POST"])
def get_matchers():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(".source.csv"):
            source = pd.read_csv(".source.csv")
            if os.path.exists(".target.csv"):
                target = pd.read_csv(".target.csv")
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
        _ = matching_task.get_candidates()
    matchers = matching_task.get_matchers()
    return {"message": "success", "matchers": matchers}


@celery.task(bind=True)
def run_new_matcher_task(self, session, name, code, params):
    try:
        app.logger.info(f"Running new matcher task for session: {session}")
        matching_task = SESSION_MANAGER.get_session(session).matching_task

        if matching_task.source_df is None or matching_task.target_df is None:
            if os.path.exists(".source.csv"):
                source = pd.read_csv(".source.csv")
                if os.path.exists(".target.csv"):
                    target = pd.read_csv(".target.csv")
                else:
                    target = pd.read_csv(GDC_DATA_PATH)
                matching_task.update_dataframe(source_df=source, target_df=target)
            _ = matching_task.get_candidates()
        error, matchers = matching_task.new_matcher(name, code, params)

        if error:
            return {"status": "failed", "error": error, "matchers": None}

        return {"status": "completed", "error": None, "matchers": matchers}
    except Exception as e:
        app.logger.error(f"Error in new matcher task: {str(e)}")
        return {
            "status": "failed",
            "error": f"Error processing task: {str(e)}",
            "matchers": None,
        }


@app.route("/api/matcher/new", methods=["POST"])
def new_matcher():
    session = extract_session_name(request)

    data = request.json
    name = data["name"]
    params = data["params"]
    code = data["code"]

    task = run_new_matcher_task.delay(session, name, code, params)
    return {"task_id": task.id}


@app.route("/api/matcher/status", methods=["POST"])
def matcher_status():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json
    task_id = data.get("taskId")

    if not task_id:
        return {"status": "error", "message": "No task_id provided"}, 400

    task = run_new_matcher_task.AsyncResult(task_id)

    app.logger.info(
        f"Task state: {task.state}, {task.info}, {task.result}, {task.traceback}"
    )

    if task.state == "PENDING":
        response = {
            "status": "pending",
            "message": "Task is pending",
            "taskState": None,
        }
    elif task.state == "FAILURE":
        response = {"status": "failed", "message": str(task.info), "taskState": None}
    elif task.state == "SUCCESS":
        result = task.result
        app.logger.info(f"Result: {result}")
        if result["status"] == "completed":
            _ = matching_task.get_candidates()

        response = {
            "status": result["status"],
            "message": result["error"] if result["status"] == "failed" else "success",
            "taskState": matching_task._load_task_state(),
            "matchers": matching_task.get_matchers(),
        }
    else:
        response = {
            "status": task.state,
            "message": "Task is in progress",
            "taskState": matching_task._load_task_state(),
        }

    return response


@app.route("/api/agent", methods=["POST"])
def ask_agent():
    data = request.json
    prompt = data["prompt"]
    app.logger.info(f"Prompt: {prompt}")
    agent = get_agent()
    response = agent.invoke(prompt, [], AgentResponse)
    app.logger.info(f"{response}")

    response = response.model_dump()
    app.logger.info(f"Response: {response}")
    return response


@app.route("/api/agent/explain", methods=["POST"])
def agent_explanation():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json

    source_col = data["sourceColumn"]
    target_col = data["targetColumn"]
    source_values = matching_task.get_source_unique_values(source_col)
    target_values = matching_task.get_target_unique_values(target_col)

    cached_explanation = read_candidate_explanation_json(source_col, target_col)
    if cached_explanation:
        app.logger.info(
            f"Returning cached explanation for {source_col} and {target_col}"
        )
        return cached_explanation

    agent = get_agent()
    response = agent.explain(
        {
            "sourceColumn": source_col,
            "targetColumn": target_col,
            "sourceValues": source_values,
            "targetValues": target_values,
        }
    )
    response = response.model_dump()

    explanations = response["explanations"]
    for explanation in explanations:
        explanation["id"] = str(uuid4())
    response["explanations"] = explanations
    app.logger.info(f"Response: {response}")
    write_candidate_explanation_json(source_col, target_col, response)
    return response


@app.route("/api/agent/explore", methods=["POST"])
def agent_explore():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json
    query = data["query"]
    candidate = data.get("candidate", None)

    if candidate:
        source_col = candidate["sourceColumn"]
        target_col = candidate["targetColumn"]
        source_values = matching_task.get_source_unique_values(source_col)
        target_values = matching_task.get_target_unique_values(target_col)
    else:
        source_col = None
        target_col = None
        source_values = None
        target_values = None

    candidate = {
        "sourceColumn": source_col,
        "targetColumn": target_col,
        "sourceValues": source_values,
        "targetValues": target_values,
    }

    agent = get_langgraph_agent()
    response = agent.invoke(query, source_col, target_col)
    app.logger.critical(f"Response: {response}")

    return response


@app.route("/api/agent/suggest", methods=["POST"])
def agent_suggest():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json

    explanations = data["explanations"]

    user_operation = data["userOperation"]
    operation = user_operation["operation"]
    candidate = user_operation["candidate"]
    references = user_operation["references"]

    # Extract false positives and false negatives from user operation and agent explanations
    source_col = candidate["sourceColumn"]
    target_col = candidate["targetColumn"]
    cached_explanation = read_candidate_explanation_json(source_col, target_col)
    if cached_explanation:
        agent_thinks_is_match = cached_explanation["is_match"]
        source_values = matching_task.get_source_unique_values(source_col)
        target_values = matching_task.get_target_unique_values(target_col)
        agent = get_agent()
        if agent_thinks_is_match and operation == "reject":
            agent.remember_fp(
                {
                    "sourceColumn": source_col,
                    "targetColumn": target_col,
                    "sourceValues": source_values,
                    "targetValues": target_values,
                }
            )
        elif not agent_thinks_is_match and operation == "accept":
            agent.remember_fn(
                {
                    "sourceColumn": source_col,
                    "targetColumn": target_col,
                    "sourceValues": source_values,
                    "targetValues": target_values,
                }
            )

    matching_task.apply_operation(operation, candidate, references)

    # put into memory
    agent = get_agent()
    agent.remember_explanation(explanations, user_operation)
    response = agent.make_suggestion(explanations, user_operation)
    response = response.model_dump()

    return response


@app.route("/api/agent/outer-source", methods=["POST"])
def agent_related_source():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json
    source_col = data["sourceColumn"]
    target_col = data["targetColumn"]
    source_values = matching_task.get_source_unique_values(source_col)
    target_values = matching_task.get_target_unique_values(target_col)

    # Unused variable removed to save memory
    # agent = get_agent()
    # response = agent.search_for_sources(candidate)
    # response = response.model_dump()
    response = {"sources": []}

    return {"message": "success", "results": response}


@app.route("/api/agent/thumb", methods=["POST"])
def agent_thumb():
    data = request.json
    explanation = data["explanation"]
    user_operation = data["userOperation"]

    agent = get_agent()
    agent.remember_explanation([explanation], user_operation)

    return {"message": "success"}


@app.route("/api/user-operation/apply", methods=["POST"])
def user_operation():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    operation_objs = request.json["userOperations"]

    app.logger.info(f"User operations: {operation_objs}")
    for operation_obj in operation_objs:
        operation = operation_obj["operation"]
        candidate = operation_obj["candidate"]
        references = operation_obj["references"]

        matching_task.apply_operation(operation, candidate, references)

        # if operation == "accept":
        # agent.remember_fn(candidate)
        # elif operation == "reject":
        # agent.remember_fp(candidate)

    return {"message": "success"}


@app.route("/api/user-operation/undo", methods=["POST"])
def undo_operation():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    operation = matching_task.undo()
    if operation is None:
        return {"message": "failure", "userOperation": None}

    return {"message": "success", "userOperation": operation}


@app.route("/api/user-operation/redo", methods=["POST"])
def redo_operation():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    operation = matching_task.redo()
    if operation is None:
        return {"message": "failure", "userOperation": None}

    return {"message": "success", "userOperation": operation}


@app.route("/api/history", methods=["POST"])
def get_history():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    history = matching_task.history.export_history_for_frontend()

    return {"message": "success", "history": history}


@app.route("/api/value/update", methods=["POST"])
def update_value():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json
    column = data["column"]
    value = data["value"]
    new_value = data["newValue"]

    matching_task.set_source_value(column, value, new_value)

    return {"message": "success"}


@app.route("/api/matching/rematch", methods=["POST"])
def rematch():
    session = extract_session_name(request)
    data = request.json
    nodes = data.get("nodes", [])  # Get nodes from request body

    if not os.path.exists(".source.csv") or not os.path.exists(".target.csv"):
        return {"status": "failed", "message": "Source or target files not found"}, 400

    # Start a new matching task with the specified nodes

    app.logger.info(f"Rematch task start with nodes: {nodes}")
    task = run_matching_task.delay(session, nodes)
    return {"task_id": task.id}
