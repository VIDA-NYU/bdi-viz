import json
import logging
import os
import shutil
import sys
import threading
from typing import List, Tuple
import queue
from uuid import uuid4

import pandas as pd
from celery import Celery, Task
from flask import Flask, request, Response, stream_with_context

# Lazy import the agent to save resources
from .langchain.pydantic import AgentResponse
from .session_manager import SESSION_MANAGER
from .utils import (
    TaskState,
    compute_dataframe_checksum,
    extract_data_from_request,
    extract_session_name,
    get_session_file,
    load_gdc_property,
    load_property,
    load_source_df,
    load_target_df,
    parse_llm_generated_ontology,
    read_cached_ontology,
    read_candidate_explanation_json,
    read_session_csv_with_comments,
    write_cached_ontology,
    write_candidate_explanation_json,
    write_session_csv_with_comments,
)

GDC_DATA_PATH = os.path.join(os.path.dirname(__file__), "./resources/cptac-3.csv")
GDC_JSON_PATH = os.path.join(os.path.dirname(__file__), "./resources/gdc_ontology.json")


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
            # Increase time limits to avoid soft-limit kill during model load/inference
            task_time_limit=1200,  # hard limit: 20 min
            task_soft_time_limit=900,  # soft limit: 15 min
            # Heartbeat/transport tuning for Redis broker
            broker_heartbeat=120,
            broker_connection_retry_on_startup=True,
            broker_transport_options={
                "visibility_timeout": 3600,
                "health_check_interval": 30,
            },
        ),
    )
    app.config.from_prefixed_env()
    celery_init_app(app)
    app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 1024
    app.logger.setLevel(logging.INFO)
    # Constrain thread pools for numerical/BLAS libs to reduce CPU/memory spikes
    try:
        os.environ.setdefault("OMP_NUM_THREADS", "1")
        os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
        os.environ.setdefault("MKL_NUM_THREADS", "1")
        os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
        os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
    except Exception:
        pass
    # On startup, scan sessions directory and register existing sessions
    try:
        from .utils import SESSIONS_ROOT

        if os.path.exists(SESSIONS_ROOT):
            for name in os.listdir(SESSIONS_ROOT):
                candidate = os.path.join(SESSIONS_ROOT, name)
                if os.path.isdir(candidate) and name != "default":
                    SESSION_MANAGER.create_session(name)
    except Exception:
        pass
    return app


app = create_app()
celery = app.extensions["celery"]


def get_memory_retriever(session: str = "default"):
    from .langchain.memory import get_memory_retriever as _get_mem

    return _get_mem(session)


def delete_memory_retriever(session: str = "default"):
    from .langchain.memory import delete_memory_retriever as _delete_mem

    return _delete_mem(session)


# Lazy load the agent only when needed
def get_agent(session: str = "default"):
    from .langchain.agent import get_agent as _get_agent

    return _get_agent(get_memory_retriever(session), session_id=session)


def get_langgraph_agent(session: str = "default"):
    from .langgraph.langgraph import get_langgraph_agent as _get_lg

    return _get_lg(get_memory_retriever(session), session_id=session)


@app.route("/api/session/create", methods=["POST"])
def session_create():
    data = request.json or {}
    session = data.get("session_name", "default")
    SESSION_MANAGER.create_session(session)
    # ensure session dir exists
    _ = get_session_file(session, "placeholder", create_dir=True)
    try:
        os.remove(get_session_file(session, "placeholder", create_dir=True))
    except Exception:
        pass
    # Seed baseline files into the new session directory if available
    try:

        def _copy_if_exists(src_path: str, dest_name: str) -> None:
            try:
                dest_path = get_session_file(session, dest_name, create_dir=True)
                if os.path.exists(dest_path):
                    return
                if src_path and os.path.exists(src_path):
                    shutil.copyfile(src_path, dest_path)
            except Exception:
                pass

        api_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(api_dir)
        default_session_dir = os.path.join(api_dir, "sessions", "default")

        # Priority order per file:
        # 1) api/sessions/default/<file>
        # 2) project root dotfiles where applicable
        # 3) built-in resources fallback

        # source.csv
        for candidate in [
            os.path.join(default_session_dir, "source.csv"),
            os.path.join(project_root, ".source.csv"),
            os.path.join(os.getcwd(), ".source.csv"),
        ]:
            if os.path.exists(candidate):
                _copy_if_exists(candidate, "source.csv")
                break

        # source.json
        for candidate in [
            os.path.join(default_session_dir, "source.json"),
            os.path.join(project_root, ".source.json"),
            os.path.join(os.getcwd(), ".source.json"),
        ]:
            if os.path.exists(candidate):
                _copy_if_exists(candidate, "source.json")
                break

        # target.csv
        for candidate in [
            os.path.join(default_session_dir, "target.csv"),
            GDC_DATA_PATH,
        ]:
            if os.path.exists(candidate):
                _copy_if_exists(candidate, "target.csv")
                break

        # target.json
        for candidate in [
            os.path.join(default_session_dir, "target.json"),
            GDC_JSON_PATH,
        ]:
            if os.path.exists(candidate):
                _copy_if_exists(candidate, "target.json")
                break

        # matching_results.json
        default_results_template = os.path.join(
            api_dir, "matching_results_default.json"
        )
        for candidate in [
            os.path.join(default_session_dir, "matching_results.json"),
            default_results_template,
        ]:
            if os.path.exists(candidate):
                _copy_if_exists(candidate, "matching_results.json")
                break
    except Exception:
        pass

    # Pre-warm: ensure embeddings are loaded and Chroma collections created.
    try:
        _ = get_memory_retriever(session)
    except Exception:
        pass

    # If a shared schema chroma_db exists, copy it into the new session to avoid first-time build
    try:
        from .utils import get_session_dir

        api_dir = os.path.dirname(os.path.abspath(__file__))
        shared_chroma = os.path.join(api_dir, "chroma_db")
        dest_dir = os.path.join(get_session_dir(session, create=True), "chroma_db")
        if os.path.isdir(shared_chroma):
            if not os.path.exists(dest_dir) or not os.listdir(dest_dir):
                import shutil as _sh

                # copytree requires dest to not exist; emulate copy if it does
                if not os.path.exists(dest_dir):
                    _sh.copytree(shared_chroma, dest_dir)
                else:
                    # copy files recursively
                    for root, dirs, files in os.walk(shared_chroma):
                        rel = os.path.relpath(root, shared_chroma)
                        tgt_root = (
                            os.path.join(dest_dir, rel) if rel != "." else dest_dir
                        )
                        os.makedirs(tgt_root, exist_ok=True)
                        for d in dirs:
                            os.makedirs(os.path.join(tgt_root, d), exist_ok=True)
                        for f in files:
                            src_f = os.path.join(root, f)
                            dst_f = os.path.join(tgt_root, f)
                            try:
                                if not os.path.exists(dst_f):
                                    _sh.copy2(src_f, dst_f)
                            except Exception:
                                pass
    except Exception:
        pass

    return {"message": "success", "sessions": SESSION_MANAGER.get_active_sessions()}


@app.route("/api/session/list", methods=["POST"])
def session_list():
    return {"message": "success", "sessions": SESSION_MANAGER.get_active_sessions()}


@app.route("/api/session/delete", methods=["POST"])
def session_delete():
    data = request.json or {}
    session = data.get("session_name", "default")
    if session == "default":
        return {"message": "error", "error": "Cannot delete default session"}, 400
    # clear memory
    try:
        delete_memory_retriever(session)
    except Exception:
        pass
    # delete filesystem directory
    try:
        session_dir = os.path.dirname(get_session_file(session, "_", create_dir=True))
        if os.path.exists(session_dir):
            shutil.rmtree(session_dir, ignore_errors=True)
    except Exception:
        pass
    # remove session from manager
    SESSION_MANAGER.delete_session(session)
    return {"message": "success", "sessions": SESSION_MANAGER.get_active_sessions()}


@celery.task(bind=True, name="api.index.infer_source_ontology_task", queue="ontology")
def infer_source_ontology_task(self, session):
    try:
        app.logger.critical(
            "[infer_source_ontology_task] PID=%s CWD=%s ARGV=%s",
            os.getpid(),
            os.getcwd(),
            sys.argv,
        )
        celery_task_id = getattr(self.request, "id", "unknown")
        task_state = TaskState(
            task_type="source",
            task_id=celery_task_id,
            new_task=True,
            session_name=session,
        )
        task_state._update_task_state(
            status="running",
            progress=0,
            current_step="Infer source ontology",
            completed_steps=0,
            log_message="Starting source ontology inference.",
        )

        # Session-aware source CSV
        source_csv_path = get_session_file(session, "source.csv", create_dir=False)
        if not os.path.exists(source_csv_path):
            task_state._update_task_state(
                status="failed",
                progress=100,
                log_message="Source file .source.csv not found.",
            )
            return {"status": "failed", "message": "Source file not found"}

        source, metadata = read_session_csv_with_comments(session, "source")
        checksum = metadata.get("checksum", None)
        if checksum is None:
            checksum = compute_dataframe_checksum(source)
        # Check checksum-based cache before inferring
        cached = read_cached_ontology(checksum, "source")
        if cached is not None:
            with open(
                get_session_file(session, "source.json", create_dir=True), "w"
            ) as f:
                json.dump(cached, f)
            task_state._update_task_state(
                status="completed",
                progress=100,
                completed_steps=1,
                current_step="Infer source ontology",
                log_message="Source ontology loaded from cache.",
            )
            return {"status": "completed", "taskId": celery_task_id, "cached": True}

        agent = get_agent(session)
        properties = []
        total_batches = len(source.columns) // 5 + 1
        for i, (_slice, ontology) in enumerate(agent.infer_ontology(source)):
            ontology = ontology.model_dump()
            properties += ontology.get("properties", [])
            progress = (i + 1) / total_batches * 100
            task_state._update_task_state(
                progress=progress,
                current_step="Infer source ontology",
                log_message=f"Source ontology batch {i+1}...",
            )

        parsed_ontology = parse_llm_generated_ontology({"properties": properties})
        with open(get_session_file(session, "source.json", create_dir=True), "w") as f:
            json.dump(parsed_ontology, f)
        # Save to global cache keyed by checksum
        try:
            task_state._update_task_state(
                progress=98,
                current_step="Infer source ontology",
                log_message=f"Trying to save source ontology to cache: {checksum}",
            )
            if checksum:
                write_cached_ontology(parsed_ontology, checksum, "source")
                task_state._update_task_state(
                    progress=99,
                    current_step="Infer source ontology",
                    log_message=f"Source ontology saved to cache: {checksum}",
                )
        except Exception:
            pass

        task_state._update_task_state(
            status="completed",
            progress=100,
            completed_steps=1,
            current_step="Infer source ontology",
            log_message="Source ontology inferred.",
        )
        return {"status": "completed", "taskId": celery_task_id}
    except Exception as e:
        app.logger.error(f"Error in infer_source_ontology_task: {str(e)}")
        return {"status": "failed", "message": str(e)}


@celery.task(bind=True, name="api.index.infer_target_ontology_task", queue="ontology")
def infer_target_ontology_task(self, session):
    try:
        app.logger.critical(
            "[infer_target_ontology_task] PID=%s CWD=%s ARGV=%s",
            os.getpid(),
            os.getcwd(),
            sys.argv,
        )
        celery_task_id = getattr(self.request, "id", "unknown")
        task_state = TaskState(
            task_type="target",
            task_id=celery_task_id,
            new_task=True,
            session_name=session,
        )
        task_state._update_task_state(
            status="running",
            progress=0,
            current_step="Infer target ontology",
            completed_steps=0,
            log_message="Starting target ontology inference.",
        )

        target_csv_path = get_session_file(session, "target.csv", create_dir=False)
        if not os.path.exists(target_csv_path):
            task_state._update_task_state(
                status="failed",
                progress=100,
                log_message="Target file .target.csv not found.",
            )
            return {"status": "failed", "message": "Target file not found"}

        target, metadata = read_session_csv_with_comments(session, "target")
        checksum = metadata.get("checksum", None)
        if checksum is None:
            checksum = compute_dataframe_checksum(target)

        # Check checksum-based cache before inferring
        cached = read_cached_ontology(checksum, "target")
        if cached is not None:
            with open(
                get_session_file(session, "target.json", create_dir=True), "w"
            ) as f:
                json.dump(cached, f)
            task_state._update_task_state(
                status="completed",
                progress=100,
                completed_steps=1,
                current_step="Infer target ontology",
                log_message="Target ontology loaded from cache.",
            )
            return {"status": "completed", "taskId": celery_task_id, "cached": True}

        agent = get_agent(session)
        properties = []
        total_batches = len(target.columns) // 5 + 1
        for i, (_slice, ontology) in enumerate(agent.infer_ontology(target)):
            ontology = ontology.model_dump()
            properties += ontology.get("properties", [])
            progress = (i + 1) / total_batches * 100
            task_state._update_task_state(
                progress=progress,
                current_step="Infer target ontology",
                log_message=f"Target ontology batch {i+1}...",
            )

        parsed_ontology = parse_llm_generated_ontology({"properties": properties})
        with open(get_session_file(session, "target.json", create_dir=True), "w") as f:
            json.dump(parsed_ontology, f)
        # Save to global cache keyed by checksum
        task_state._update_task_state(
            progress=98,
            current_step="Infer target ontology",
            log_message=f"Trying to save target ontology to cache: {checksum}",
        )
        try:
            if checksum:
                write_cached_ontology(parsed_ontology, checksum, "target")
                task_state._update_task_state(
                    progress=99,
                    current_step="Infer target ontology",
                    log_message=f"Target ontology saved to cache: {checksum}",
                )
        except Exception:
            pass

        task_state._update_task_state(
            status="completed",
            progress=100,
            completed_steps=1,
            current_step="Infer target ontology",
            log_message="Target ontology inferred.",
        )
        return {"status": "completed", "taskId": celery_task_id}
    except Exception as e:
        app.logger.error(f"Error in infer_target_ontology_task: {str(e)}")
        return {"status": "failed", "message": str(e)}


@celery.task(bind=True, name="api.index.run_matching_task", queue="matching")
def run_matching_task(
    self,
    session: str,
    nodes: List[str] = [],
    groundtruth_pairs: List[Tuple[str, str]] = [],
    groundtruth_mappings: List[Tuple[str, str, str, str]] = [],
):
    try:
        app.logger.critical(
            "[run_matching_task] PID=%s CWD=%s ARGV=%s",
            os.getpid(),
            os.getcwd(),
            sys.argv,
        )
        celery_task_id = getattr(self.request, "id", "unknown")
        task_state = TaskState(
            task_type="matching",
            task_id=celery_task_id,
            new_task=True,
            session_name=session,
        )

        # Clear specific namespaces for new task
        memory_retriever = get_memory_retriever(session)
        memory_retriever.clear_namespaces(["user_memory", "schema", "explanations"])

        matching_task = SESSION_MANAGER.get_session(session).matching_task

        if os.path.exists(
            get_session_file(session, "source.csv", create_dir=False)
        ) and os.path.exists(get_session_file(session, "target.csv", create_dir=False)):
            source = load_source_df(session)
            target = load_target_df(session)

            matching_task.update_dataframe(source_df=source, target_df=target)
            matching_task.set_nodes(nodes)

            # Target ontology is now handled by a dedicated task when needed

            candidates = matching_task.get_candidates(
                task_state=task_state,
                groundtruth_pairs=groundtruth_pairs,
                groundtruth_mappings=groundtruth_mappings,
            )

            return {"status": "completed", "candidates_count": len(candidates)}

        return {
            "status": "failed",
            "message": "Source or target files not found",
        }
    except Exception as e:
        # Handle the NoneType Redis error and other potential exceptions
        app.logger.error(f"Error in matching task: {str(e)}")
        return {
            "status": "failed",
            "message": f"Error processing task: {str(e)}",
        }


@app.route("/api/matching/start", methods=["POST"])
def start_matching():
    session = extract_session_name(request)

    source_df, target_df, target_json, groundtruth_pairs, groundtruth_mappings = (
        extract_data_from_request(request)
    )

    if source_df is None:
        return {
            "status": "failed",
            "message": "Source file not found",
        }, 400

    src_name = request.form.get("source_csv_name") if request.form is not None else None
    tgt_name = request.form.get("target_csv_name") if request.form is not None else None

    # --- SOURCE ONTOLOGY INFERENCE ---
    infer_source_ontology = True

    write_session_csv_with_comments(
        source_df,
        session,
        "source",
        {
            "original_filename": src_name or "source.csv",
            "timestamp": (
                request.form.get("source_csv_timestamp")
                if request.form is not None
                else None
            ),
            "size": (
                request.form.get("source_csv_size")
                if request.form is not None
                else None
            ),
        },
    )

    # --- TARGET ONTOLOGY INFERENCE (existing logic) ---
    infer_target_ontology = False
    if target_df is None:
        app.logger.info("Using default GDC data")
        target_df = pd.read_csv(GDC_DATA_PATH)
        target_json = json.load(open(GDC_JSON_PATH, "r"))
        with open(get_session_file(session, "target.json", create_dir=True), "w") as f:
            json.dump(target_json, f)
    else:
        app.logger.info("Using uploaded target")
        if target_json is None:
            # Defer target ontology inference to a dedicated task
            infer_target_ontology = True
        else:
            with open(
                get_session_file(session, "target.json", create_dir=True), "w"
            ) as f:
                json.dump(target_json, f)
            app.logger.info("Using cached ontology for uploaded target")

    write_session_csv_with_comments(
        target_df,
        session,
        "target",
        {
            "original_filename": tgt_name or os.path.basename(GDC_DATA_PATH),
            "timestamp": (
                request.form.get("target_csv_timestamp")
                if request.form is not None
                else None
            ),
            "size": (
                request.form.get("target_csv_size", "1805.25 KB")
                if request.form is not None
                else None
            ),
        },
    )

    # Clear specific namespaces for new task
    memory_retriever = get_memory_retriever(session)
    memory_retriever.clear_namespaces(["user_memory", "schema", "explanations"])

    # Kick off tasks in parallel: source ontology (if needed) and matching
    source_task = None
    target_task = None

    # Kick off target ontology inference if needed (parallel to matching)
    if infer_target_ontology:
        target_task = infer_target_ontology_task.apply_async(
            (session,),
            queue="ontology",
        )

    if infer_source_ontology:
        # Route to ontology queue for concurrency/isolation
        source_task = infer_source_ontology_task.apply_async(
            (session,), queue="ontology"
        )

    # Matching task should not wait for ontology tasks
    task = run_matching_task.apply_async(
        (session, [], groundtruth_pairs, groundtruth_mappings or []),
        queue="matching",
    )
    return {
        "status": "completed",
        "task_id": task.id,
        "source_ontology_task_id": (source_task.id if source_task else None),
        "target_ontology_task_id": (target_task.id if target_task else None),
    }


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
        (f"Task state: {task.state}, {task.info}, " f"{task.result}, {task.traceback}")
    )

    # Always try to read the task state's JSON for progress/logs
    task_state = TaskState(
        task_type="matching", task_id=task_id, new_task=False, session_name=session
    ).get_task_state()

    if task.state == "PENDING":
        response = {
            "status": "pending",
            "message": "Task is pending",
            "taskState": task_state,
        }
    elif task.state == "FAILURE":
        response = {
            "status": "failed",
            "message": str(task.info),
            "taskState": task_state,
        }
    elif task.state == "SUCCESS":
        source = load_source_df(session)
        target = load_target_df(session)
        matching_task.update_dataframe(source_df=source, target_df=target)

        target_json_path = get_session_file(session, "target.json", create_dir=False)
        if os.path.exists(target_json_path):
            target_json = json.load(open(target_json_path, "r"))
            agent = get_agent(session)
            threading.Thread(
                target=agent.remember_ontology, args=(target_json,)
            ).start()
        matching_task.sync_cache()
        # matching_task.get_candidates()

        response = {
            "status": "completed",
            "result": task.result,
            "taskState": task_state,
        }
    else:
        response = {
            "status": task.state,
            "message": "Task is in progress",
            "taskState": task_state,
        }

    return response


@app.route("/api/ontology/target/status", methods=["POST"])
def target_ontology_status():
    data = request.json or {}
    task_id = data.get("taskId")
    session = data.get("session_name", "default")

    if not task_id:
        return {"status": "error", "message": "No task_id provided"}, 400

    task = infer_target_ontology_task.AsyncResult(task_id)

    app.logger.info(
        (
            f"Target ontology task state: {task.state}, {task.info}, "
            f"{task.result}, {task.traceback}"
        )
    )

    task_state = TaskState(
        task_type="target", task_id=task_id, new_task=False, session_name=session
    ).get_task_state()

    if task.state == "PENDING":
        response = {
            "status": "pending",
            "message": "Task is pending",
            "taskState": task_state,
        }
    elif task.state == "FAILURE":
        response = {
            "status": "failed",
            "message": str(task.info),
            "taskState": task_state,
        }
    elif task.state == "SUCCESS":
        response = {
            "status": "completed",
            "result": task.result,
            "taskState": task_state,
        }
    else:
        response = {
            "status": task.state,
            "message": "Task is in progress",
            "taskState": task_state,
        }

    return response


@app.route("/api/ontology/source/status", methods=["POST"])
def source_ontology_status():
    data = request.json or {}
    task_id = data.get("taskId")
    session = data.get("session_name", "default")

    if not task_id:
        return {"status": "error", "message": "No task_id provided"}, 400

    task = infer_source_ontology_task.AsyncResult(task_id)

    app.logger.info(
        (
            f"Source ontology task state: {task.state}, {task.info}, "
            f"{task.result}, {task.traceback}"
        )
    )

    task_state = TaskState(
        task_type="source", task_id=task_id, new_task=False, session_name=session
    ).get_task_state()

    if task.state == "PENDING":
        response = {
            "status": "pending",
            "message": "Task is pending",
            "taskState": task_state,
        }
    elif task.state == "FAILURE":
        response = {
            "status": "failed",
            "message": str(task.info),
            "taskState": task_state,
        }
    elif task.state == "SUCCESS":
        response = {
            "status": "completed",
            "result": task.result,
            "taskState": task_state,
        }
    else:
        response = {
            "status": task.state,
            "message": "Task is in progress",
            "taskState": task_state,
        }

    return response


@app.route("/api/results", methods=["POST"])
def get_results():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(get_session_file(session, "source.csv", create_dir=False)):
            source = load_source_df(session)
            if os.path.exists(
                get_session_file(session, "target.csv", create_dir=False)
            ):
                target = load_target_df(session)
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
        app.logger.critical(
            "[get_results] PID=%s CWD=%s ARGV=%s", os.getpid(), os.getcwd(), sys.argv
        )
        _ = matching_task.get_candidates()
        # AGENT.remember_candidates(candidates)
        target_json_path = get_session_file(session, "target.json", create_dir=False)
        if os.path.exists(target_json_path):
            target_json = json.load(open(target_json_path, "r"))
            # Start the ontology remembering process asynchronously
            agent = get_agent(session)
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
        if os.path.exists(get_session_file(session, "source.csv", create_dir=False)):
            source = load_source_df(session)
            if os.path.exists(
                get_session_file(session, "target.csv", create_dir=False)
            ):
                target = load_target_df(session)
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
        if os.path.exists(get_session_file(session, "source.csv", create_dir=False)):
            source = load_source_df(session)
            if os.path.exists(
                get_session_file(session, "target.csv", create_dir=False)
            ):
                target = load_target_df(session)
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
        app.logger.critical(
            "[get_value_matches] PID=%s CWD=%s ARGV=%s",
            os.getpid(),
            os.getcwd(),
            sys.argv,
        )
        _ = matching_task.get_candidates()
    results = matching_task.value_matches_to_frontend_json()

    return {"message": "success", "results": results}


@app.route("/api/gdc/ontology", methods=["POST"])
def get_gdc_ontology():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(get_session_file(session, "source.csv", create_dir=False)):
            source = load_source_df(session)
            matching_task.update_dataframe(
                source_df=source, target_df=pd.read_csv(GDC_DATA_PATH)
            )
        app.logger.critical(
            "[get_gdc_ontology] PID=%s CWD=%s ARGV=%s",
            os.getpid(),
            os.getcwd(),
            sys.argv,
        )
        _ = matching_task.get_candidates()
    results = matching_task._generate_gdc_ontology()

    return {"message": "success", "results": results}


@app.route("/api/ontology/target", methods=["POST"])
def get_target_ontology():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(get_session_file(session, "source.csv", create_dir=False)):
            source = load_source_df(session)
            if os.path.exists(
                get_session_file(session, "target.csv", create_dir=False)
            ):
                target = load_target_df(session)
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
        app.logger.critical(
            "[get_target_ontology] PID=%s CWD=%s ARGV=%s",
            os.getpid(),
            os.getcwd(),
            sys.argv,
        )
        _ = matching_task.get_candidates()

    results = matching_task._generate_target_ontology()

    return {"message": "success", "results": results}


@app.route("/api/ontology/source", methods=["POST"])
def get_source_ontology():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    if matching_task.source_df is None or matching_task.target_df is None:
        if os.path.exists(get_session_file(session, "source.csv", create_dir=False)):
            source = load_source_df(session)
            if os.path.exists(
                get_session_file(session, "target.csv", create_dir=False)
            ):
                target = load_target_df(session)
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
        app.logger.critical(
            "[get_source_ontology] PID=%s CWD=%s ARGV=%s",
            os.getpid(),
            os.getcwd(),
            sys.argv,
        )
        _ = matching_task.get_candidates()

    results = matching_task._generate_source_ontology()

    return {"message": "success", "results": results}


@app.route("/api/gdc/property", methods=["POST"])
def get_gdc_property():
    # Unused local variable 'session' removed
    target_col = request.json["targetColumn"]

    property = load_gdc_property(target_col)

    return {"message": "success", "property": property}


@app.route("/api/property", methods=["POST"])
def get_property():
    session = extract_session_name(request)
    target_col = request.json["targetColumn"]

    property = load_property(target_col, is_target=True, session=session)

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
        if os.path.exists(get_session_file(session, "source.csv", create_dir=False)):
            source = load_source_df(session)
            if os.path.exists(
                get_session_file(session, "target.csv", create_dir=False)
            ):
                target = load_target_df(session)
            else:
                target = pd.read_csv(GDC_DATA_PATH)
            matching_task.update_dataframe(source_df=source, target_df=target)
        app.logger.critical(
            "[get_matchers] PID=%s CWD=%s ARGV=%s", os.getpid(), os.getcwd(), sys.argv
        )
        _ = matching_task.get_candidates()
    matchers = matching_task.get_matchers()
    return {"message": "success", "matchers": matchers}


@celery.task(bind=True, name="api.index.run_new_matcher_task", queue="new_matcher")
def run_new_matcher_task(self, session, name, code, params):
    try:
        celery_task_id = getattr(self.request, "id", "unknown")
        task_state = TaskState(
            task_type="new_matcher", task_id=celery_task_id, new_task=True
        )
        app.logger.info(f"Running new matcher task for session: {session}")
        matching_task = SESSION_MANAGER.get_session(session).matching_task

        if matching_task.source_df is None or matching_task.target_df is None:
            if os.path.exists(
                get_session_file(session, "source.csv", create_dir=False)
            ):
                source = load_source_df(session)
                if os.path.exists(
                    get_session_file(session, "target.csv", create_dir=False)
                ):
                    target = load_target_df(session)
                else:
                    target = pd.read_csv(GDC_DATA_PATH)
                matching_task.update_dataframe(
                    source_df=source,
                    target_df=target,
                )
            _ = matching_task.get_candidates(task_state=task_state)
        error, matchers = matching_task.new_matcher(name, code, params, task_state)

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


# ----------------------
# Session-scoped cell comments API
# ----------------------


def _comments_file(session: str) -> str:
    return get_session_file(session, "comments.json", create_dir=True)


def _read_comments_map(session: str) -> dict:
    path = _comments_file(session)
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
    except Exception:
        pass
    return {}


def _write_comments_map(session: str, data: dict) -> None:
    path = _comments_file(session)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data or {}, f, indent=2)
    except Exception:
        pass


def _cell_key(source: str, target: str) -> str:
    return f"{source}::{target}"


@app.route("/api/comments/list", methods=["POST"])
def comments_list():
    session = extract_session_name(request)
    payload = request.json or {}
    source = payload.get("sourceColumn")
    target = payload.get("targetColumn")

    data = _read_comments_map(session)

    if source and target:
        key = _cell_key(source, target)
        return {"message": "success", "comments": data.get(key, [])}

    return {"message": "success", "commentsMap": data}


@app.route("/api/comments/add", methods=["POST"])
def comments_add():
    session = extract_session_name(request)
    payload = request.json or {}
    source = payload.get("sourceColumn")
    target = payload.get("targetColumn")
    text = (payload.get("text") or "").strip()
    if not source or not target or not text:
        return {"message": "failure", "error": "Missing source/target/text"}, 400

    data = _read_comments_map(session)
    key = _cell_key(source, target)
    arr = data.get(key, [])
    arr.append({"text": text, "createdAt": pd.Timestamp.utcnow().isoformat()})
    data[key] = arr
    _write_comments_map(session, data)
    return {"message": "success", "comments": arr}


@app.route("/api/comments/set", methods=["POST"])
def comments_set():
    session = extract_session_name(request)
    payload = request.json or {}
    source = payload.get("sourceColumn")
    target = payload.get("targetColumn")
    comments = payload.get("comments", [])
    if not source or not target or not isinstance(comments, list):
        return {"message": "failure", "error": "Invalid payload"}, 400

    # Normalize to array of objects { text, createdAt }
    normalized = []
    for c in comments:
        if isinstance(c, dict) and "text" in c:
            obj = {
                "text": str(c.get("text", "")),
                "createdAt": str(
                    c.get("createdAt") or pd.Timestamp.utcnow().isoformat()
                ),
            }
            if obj["text"].strip():
                normalized.append(obj)
        else:
            s = str(c).strip()
            if s:
                normalized.append(
                    {"text": s, "createdAt": pd.Timestamp.utcnow().isoformat()}
                )

    data = _read_comments_map(session)
    key = _cell_key(source, target)
    data[key] = normalized
    _write_comments_map(session, data)
    return {"message": "success", "comments": normalized}


@app.route("/api/comments/clear", methods=["POST"])
def comments_clear():
    session = extract_session_name(request)
    payload = request.json or {}
    source = payload.get("sourceColumn")
    target = payload.get("targetColumn")
    if not source or not target:
        return {"message": "failure", "error": "Missing source/target"}, 400
    data = _read_comments_map(session)
    key = _cell_key(source, target)
    data[key] = []
    _write_comments_map(session, data)
    return {"message": "success"}


@app.route("/api/matcher/status", methods=["POST"])
def matcher_status():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json
    task_id = data.get("taskId")

    if not task_id:
        return {"status": "error", "message": "No task_id provided"}, 400

    task = run_new_matcher_task.AsyncResult(task_id)
    task_state = TaskState(task_type="new_matcher", task_id=task_id, new_task=False)

    app.logger.info(
        (f"Task state: {task.state}, {task.info}, " f"{task.result}, {task.traceback}")
    )

    if task.state == "PENDING":
        response = {
            "status": "pending",
            "message": "Task is pending",
            "taskState": task_state.get_task_state(),
        }
    elif task.state == "FAILURE":
        response = {
            "status": "failed",
            "message": str(task.info),
            "taskState": task_state.get_task_state(),
        }
    elif task.state == "SUCCESS":
        result = task.result
        app.logger.info(f"Result: {result}")
        if result["status"] == "completed":
            _ = matching_task.get_candidates(task_state=task_state)

        response = {
            "status": result["status"],
            "message": (result["error"] if result["status"] == "failed" else "success"),
            "taskState": task_state.get_task_state(),
            "matchers": matching_task.get_matchers(),
        }
    else:
        response = {
            "status": task.state,
            "message": "Task is in progress",
            "taskState": task_state.get_task_state(),
        }

    return response


@app.route("/api/agent", methods=["POST"])
def ask_agent():
    session = extract_session_name(request)
    data = request.json
    prompt = data["prompt"]
    app.logger.info(f"Prompt: {prompt}")
    agent = get_agent(session)
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

    agent = get_agent(session)
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


# @app.route("/api/agent/explore", methods=["POST"])
# def agent_explore():
#     session = extract_session_name(request)

#     data = request.json
#     query = data["query"]
#     candidate = data.get("candidate", None)

#     if candidate:
#         source_col = candidate["sourceColumn"]
#         target_col = candidate["targetColumn"]
#     else:
#         source_col = None
#         target_col = None

#     agent = get_langgraph_agent(session)
#     response = agent.invoke(query, source_col, target_col)
#     app.logger.critical(f"Response: {response}")

#     return response


@app.route("/api/agent/explore", methods=["GET"])
def agent_stream():
    """Server-Sent Events endpoint to stream LangGraph agent updates (thoughts + tool calls/results)."""
    session = request.args.get("session_name", "default")
    query = request.args.get("query", "")
    source_col = request.args.get("sourceColumn", None)
    target_col = request.args.get("targetColumn", None)

    if not query:
        return {"status": "error", "message": "Missing query"}, 400

    agent = get_langgraph_agent(session)

    ev_queue: "queue.Queue" = queue.Queue()

    def _event_cb(kind: str, payload: dict, node: str) -> None:
        try:
            ev_queue.put((kind, payload or {}, node or ""))
        except Exception:
            pass

    def _run_agent():
        try:
            agent.run_with_stream(
                query=query,
                source_column=source_col,
                target_column=target_col,
                reset=False,
                event_cb=_event_cb,
            )
        except Exception as e:
            try:
                ev_queue.put(("error", {"message": str(e)}, "agent"))
            except Exception:
                pass
        finally:
            try:
                ev_queue.put(("done", {}, "agent"))
            except Exception:
                pass

    th = threading.Thread(target=_run_agent, daemon=True)
    th.start()

    def _gen():
        def sse(event: str, data: dict):
            payload = json.dumps(data, ensure_ascii=False)
            return f"event: {event}\ndata: {payload}\n\n"

        # Send an initial event to open the stream promptly and defeat proxy buffering
        yield sse("ready", {"ok": True})

        while True:
            item = ev_queue.get()
            if not item:
                continue
            kind, payload, node = item
            # app.logger.info(
            #     f"[STREAMING] Agent stream event: {kind}, {payload}, {node}"
            # )
            if kind == "done":
                yield sse("done", {"ok": True})
                break
            elif kind == "delta":
                # Normalize: always wrap agent state under `state`
                state = payload.get("state") if isinstance(payload, dict) else None
                if state is None:
                    # Backward compatibility: promote content to state.message
                    content = (
                        payload.get("content") if isinstance(payload, dict) else None
                    )
                    state = {
                        "message": (
                            content if isinstance(content, str) else str(content)
                        ),
                        "query": query,
                        "conversation_summary": "",
                        "source_column": source_col,
                        "target_column": target_col,
                        "next_agents": [],
                        "candidates": [],
                        "candidates_to_append": [],
                    }
                yield sse("delta", {"node": node, "state": state})
            elif kind == "tool":
                # Normalize: always wrap tool envelope under `tool`
                tool = payload.get("tool") if isinstance(payload, dict) else None
                if tool is None and isinstance(payload, dict):
                    # Back-compat for older shapes
                    if "calls" in payload:
                        tool = {"phase": "call", "calls": payload.get("calls")}
                    else:
                        tool = {
                            "phase": "result",
                            "name": payload.get("name"),
                            "content": payload.get("content"),
                            "is_error": payload.get("is_error", False),
                        }
                yield sse("tool", {"node": node, "tool": tool})
            elif kind == "final":
                # Final returns the full state already; wrap it consistently
                state = (
                    payload if isinstance(payload, dict) else {"message": str(payload)}
                )
                yield sse("final", {"node": node, "state": state})
            elif kind == "error":
                yield sse("error", {"node": node, **(payload or {})})
            else:
                yield sse("event", {"node": node, **(payload or {}), "kind": kind})

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
    }

    return Response(stream_with_context(_gen()), headers=headers)


@app.route("/api/agent/outer-source", methods=["POST"])
def agent_related_source():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json
    source_col = data["sourceColumn"]
    target_col = data["targetColumn"]
    _ = matching_task.get_source_unique_values(source_col)
    _ = matching_task.get_target_unique_values(target_col)

    # Unused variable removed to save memory
    # agent = get_agent(session)
    # response = agent.search_for_sources(candidate)
    # response = response.model_dump()
    response = {"sources": []}

    return {"message": "success", "results": response}


@app.route("/api/agent/thumb", methods=["POST"])
def agent_thumb():
    session = extract_session_name(request)
    data = request.json
    explanation = data["explanation"]
    user_operation = data["userOperation"]

    agent = get_agent(session)
    agent.remember_explanation([explanation], user_operation)

    return {"message": "success"}


@app.route("/api/agent/reset", methods=["POST"])
def agent_reset():
    """Reset the LangGraph agent's conversation state (e.g., conversation_summary) for the session."""
    session = extract_session_name(request)
    try:
        agent = get_langgraph_agent(session)
        # Reset agent state
        agent.reset_state()
        # Also clear relevant namespaces in memory to avoid context leakage
        try:
            memory_retriever = get_memory_retriever(session)
            # Keep embeddings but clear conversational/user memories
            memory_retriever.clear_namespaces(["user_memory"])
        except Exception:
            pass
        return {"message": "success"}
    except Exception as e:
        return {"message": "failure", "error": str(e)}, 500


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
        is_match_to_agent = operation_obj.get("isMatchToAgent", None)

        matching_task.apply_operation(
            operation, candidate, references, is_match_to_agent
        )

        agent = get_agent(session)
        agent.handle_user_operation(operation, candidate, is_match_to_agent)

    return {"message": "success"}


@app.route("/api/datasets/names", methods=["POST"])
def get_dataset_names():
    session = extract_session_name(request)
    source_name = None
    target_name = None

    try:
        if os.path.exists(get_session_file(session, "source.csv", create_dir=False)):
            _, meta = read_session_csv_with_comments(session, "source")
            source_name = meta.get("original_filename")
            source_timestamp = meta.get("timestamp")
            source_size = meta.get("size")
    except Exception:
        pass

    try:
        if os.path.exists(get_session_file(session, "target.csv", create_dir=False)):
            _, meta = read_session_csv_with_comments(session, "target")
            target_name = meta.get("original_filename")
            target_timestamp = meta.get("timestamp")
            target_size = meta.get("size")
        else:
            # Default target dataset when not uploaded
            target_name = os.path.basename(GDC_DATA_PATH)
            target_timestamp = None
            target_size = None
    except Exception:
        target_name = os.path.basename(GDC_DATA_PATH)
        target_timestamp = None
        target_size = None

    # Fallbacks
    source_name = source_name or "source.csv"
    target_name = target_name or os.path.basename(GDC_DATA_PATH)

    return {
        "message": "success",
        "sourceMeta": {
            "name": source_name,
            "timestamp": source_timestamp,
            "size": source_size,
        },
        "targetMeta": {
            "name": target_name,
            "timestamp": target_timestamp,
            "size": target_size,
        },
    }


@app.route("/api/user-operation/undo", methods=["POST"])
def undo_operation():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    operation = matching_task.undo()
    if operation is None:
        return {"message": "failure", "userOperation": None}

    operation_type = operation["operation"]
    candidate = operation["candidate"]
    is_match_to_agent = operation.get("isMatchToAgent", None)

    agent = get_agent(session)
    agent.handle_undo_operation(operation_type, candidate, is_match_to_agent)

    return {"message": "success", "userOperation": operation}


@app.route("/api/user-operation/redo", methods=["POST"])
def redo_operation():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    operation = matching_task.redo()
    if operation is None:
        return {"message": "failure", "userOperation": None}

    operation_type = operation["operation"]
    candidate = operation["candidate"]
    is_match_to_agent = operation.get("isMatchToAgent", None)

    agent = get_agent(session)
    agent.handle_user_operation(operation_type, candidate, is_match_to_agent)

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
    operation = data.get("operation", "source")

    if operation == "source":
        column = data["column"]
        value = data["value"]
        new_value = data["newValue"]
        matching_task.set_source_value(column, value, new_value)
        return {"message": "success"}
    elif operation == "target":
        source_column = data["sourceColumn"]
        source_value = data["sourceValue"]
        target_column = data["targetColumn"]
        new_target_value = data["newTargetValue"]
        matching_task.set_target_value_match(
            source_column, source_value, target_column, new_target_value
        )
        return {"message": "success"}
    else:
        return {"message": "failure", "error": "Invalid operation"}, 400


@app.route("/api/candidate/create", methods=["POST"])
def create_candidate():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task
    data = request.json
    candidate = data["candidate"]
    candidate["matcher"] = candidate.get("matcher", "user")
    candidate["status"] = candidate.get("status", "idle")
    candidate["score"] = candidate.get("score", 0.8)
    matching_task.append_candidates_from_agent(
        candidate["sourceColumn"], [candidate], matcher=candidate["matcher"]
    )
    matching_task.apply_operation("create", candidate, [])
    return {"message": "success"}


@app.route("/api/candidate/delete", methods=["POST"])
def delete_candidate():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task
    data = request.json
    candidate = data["candidate"]
    candidate["matchers"] = candidate.get("matchers", ["user"])
    candidate["status"] = candidate.get("status", "idle")
    candidate["score"] = candidate.get("score", 0.8)
    matching_task.apply_operation("delete", candidate, [])
    return {"message": "success"}


@app.route("/api/matching/rematch", methods=["POST"])
def rematch():
    session = extract_session_name(request)
    data = request.json
    nodes = data.get("nodes", [])  # Get nodes from request body

    if not os.path.exists(".source.csv") or not os.path.exists(".target.csv"):
        return {
            "status": "failed",
            "message": "Source or target files not found",
        }, 400

    # Start a new matching task with the specified nodes

    app.logger.info(f"Rematch task start with nodes: {nodes}")
    task = run_matching_task.delay(session, nodes)
    return {"task_id": task.id}
