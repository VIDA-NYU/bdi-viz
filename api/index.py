import json
import logging
import os
from uuid import uuid4

import pandas as pd
from flask import Flask, request

from .langchain.agent import AGENT

# langchain
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

app = Flask("bdiviz_flask")
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 1024
app.logger.setLevel(logging.INFO)


@app.route("/api/matching", methods=["POST"])
def matcher():
    matching_task = SESSION_MANAGER.get_session("default").matching_task

    source, target, target_json = extract_data_from_request(request)
    if target is None:
        # GDC
        target = pd.read_csv(GDC_DATA_PATH)
        target_json = json.load(open(GDC_JSON_PATH, "r"))
    else:
        if target_json is None:
            app.logger.info("[AGENT] Generating ontology...")
            response = AGENT.infer_ontology(target)
            target_json = response.model_dump()
        target_json = parse_llm_generated_ontology(target_json)

    # cache csvs
    source.to_csv(".source.csv", index=False)
    target.to_csv(".target.csv", index=False)
    # cache json
    with open(".target.json", "w") as f:
        json.dump(target_json, f)

    app.logger.info("Matching task started!")

    matching_task.update_dataframe(source_df=source, target_df=target)

    _ = matching_task.get_candidates()

    return {"message": "success"}


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
        candidates = matching_task.get_candidates()
        # AGENT.remember_candidates(candidates)

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
        _ = matching_task.get_candidates()
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
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    target_col = request.json["targetColumn"]

    property = load_gdc_property(target_col)

    return {"message": "success", "property": property}


@app.route("/api/property", methods=["POST"])
def get_property():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

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


@app.route("/api/agent", methods=["POST"])
def ask_agent():
    data = request.json
    prompt = data["prompt"]
    app.logger.info(f"Prompt: {prompt}")
    response = AGENT.invoke(prompt, [], AgentResponse)
    app.logger.info(f"{response}")

    response = response.model_dump()
    app.logger.info(f"Response: {response}")
    return response


@app.route("/api/agent/search/candidates", methods=["POST"])
def search_candidates():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json
    query = data["query"]

    response = AGENT.search(query)
    response = response.model_dump()

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

    response = AGENT.explain(
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


@app.route("/api/agent/value-mapping", methods=["POST"])
def agent_suggest_value_mapping():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    data = request.json

    source_col = data["sourceColumn"]
    target_col = data["targetColumn"]
    source_values = matching_task.get_source_unique_values(source_col)
    target_values = matching_task.get_target_unique_values(target_col)

    response = AGENT.suggest_value_mapping(
        {
            "sourceColumn": source_col,
            "targetColumn": target_col,
            "sourceValues": source_values,
            "targetValues": target_values,
        }
    )
    response = response.model_dump()

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
        if agent_thinks_is_match and operation == "reject":
            AGENT.remember_fp(
                {
                    "sourceColumn": source_col,
                    "targetColumn": target_col,
                    "sourceValues": source_values,
                    "targetValues": target_values,
                }
            )
        elif not agent_thinks_is_match and operation == "accept":
            AGENT.remember_fn(
                {
                    "sourceColumn": source_col,
                    "targetColumn": target_col,
                    "sourceValues": source_values,
                    "targetValues": target_values,
                }
            )

    matching_task.apply_operation(operation, candidate, references)

    # put into memory
    AGENT.remember_explanation(explanations, user_operation)
    response = AGENT.make_suggestion(explanations, user_operation)
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

    candidate = {
        "sourceColumn": source_col,
        "targetColumn": target_col,
        "sourceValues": source_values,
        "targetValues": target_values,
    }

    # response = AGENT.search_for_sources(candidate)
    # response = response.model_dump()
    response = {"sources": []}

    return {"message": "success", "results": response}


@app.route("/api/agent/thumb", methods=["POST"])
def agent_thumb():
    data = request.json
    explanation = data["explanation"]
    user_operation = data["userOperation"]

    AGENT.remember_explanation([explanation], user_operation)

    return {"message": "success"}


@app.route("/api/agent/apply", methods=["POST"])
def agent_apply():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    reaction = request.json
    actions = reaction["actions"]
    previous_operation = reaction["previousOperation"]

    app.logger.info(f"User Reaction: {reaction}")

    responses = []
    for action in actions:
        response = AGENT.apply(session, action, previous_operation)
        if response:
            response_obj = response.model_dump()
            if response_obj["action"] == "undo":
                user_operation = previous_operation["operation"]
                candidate = previous_operation["candidate"]
                references = previous_operation["references"]
                matching_task.undo_operation(user_operation, candidate, references)
            responses.append(response_obj)

    return responses


@app.route("/api/user-operation/apply", methods=["POST"])
def user_operation():
    session = extract_session_name(request)
    matching_task = SESSION_MANAGER.get_session(session).matching_task

    operation_objs = request.json["userOperations"]

    for operation_obj in operation_objs:
        operation = operation_obj["operation"]
        candidate = operation_obj["candidate"]
        references = operation_obj["references"]

        matching_task.apply_operation(operation, candidate, references)

        if operation == "accept":
            AGENT.remember_fn(candidate)
        elif operation == "reject":
            AGENT.remember_fp(candidate)

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
