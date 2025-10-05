"use client";

import axios from "axios";
import { getSessionName, setSessionName } from "@/app/lib/settings/session";
import http from 'http';
import https from 'https';


// Matching Task

interface StartMatchingIds {
    taskId: string;
    sourceOntologyTaskId?: string | null;
    targetOntologyTaskId?: string | null;
}

const startMatchingTask = async (uploadData: FormData): Promise<StartMatchingIds> => {
    console.log("startMatchingTask", uploadData.get("type"));
    uploadData.append("session_name", getSessionName());
    const response = await axios.post("/api/matching/start", uploadData);
    return {
        taskId: response.data.task_id,
        sourceOntologyTaskId: response.data.source_ontology_task_id ?? null,
        targetOntologyTaskId: response.data.target_ontology_task_id ?? null,
    };
};

interface MatchingStatusProps {
    taskId: string;
    taskStateCallback: (taskState: TaskState) => void;
    onResult: (result: any) => void;
    onError: (error: any) => void;
}

const pollForMatchingStatus = async ({ 
    taskId, 
    taskStateCallback, 
    onResult, 
    onError 
}: MatchingStatusProps) => {
    const interval = setInterval(async () => {
        try {
            const response = await axios.post("/api/matching/status", { taskId, session_name: getSessionName() });
            const status = response.data.status;
            const taskState = response.data.taskState as TaskState;
            console.log("taskState", taskState);
            taskStateCallback(taskState);

            if (status === "completed") {
                clearInterval(interval);
                console.log("Matching task completed!");
                onResult(response.data.result);
            } else if (status === "failed") {
                clearInterval(interval);
                console.log("Matching task failed!", response.data.message);
                onError(response.data.message);
            }
        } catch (error) {
            onError(error);
            console.error("Error polling for matching status:", error);
            clearInterval(interval);
        }
    }, 5000);
};

// Source Ontology Task

interface SourceOntologyStatusProps {
    taskId: string;
    taskStateCallback?: (taskState: TaskState) => void;
    onReady: (sourceOntology: Ontology[]) => void;
    onError: (error: any) => void;
}

const pollForSourceOntologyStatus = async ({
    taskId,
    taskStateCallback,
    onReady,
    onError,
}: SourceOntologyStatusProps) => {
    const interval = setInterval(async () => {
        try {
            const response = await axios.post("/api/ontology/source/status", { taskId, session_name: getSessionName() });
            const status = response.data.status;
            const taskState = response.data.taskState as TaskState;
            if (taskStateCallback) taskStateCallback(taskState);

            if (status === "completed") {
                clearInterval(interval);
                // fetch the inferred source ontology
                getSourceOntology({
                    callback: (sourceOntology) => onReady(sourceOntology),
                });
            } else if (status === "failed") {
                clearInterval(interval);
                onError(response.data.message || "Source ontology task failed");
            }
        } catch (error) {
            onError(error);
            console.error("Error polling for source ontology status:", error);
            clearInterval(interval);
        }
    }, 5000);
};

// Target Ontology Task

interface TargetOntologyStatusProps {
    taskId: string;
    taskStateCallback?: (taskState: TaskState) => void;
    onReady: (targetOntology: Ontology[]) => void;
    onError: (error: any) => void;
}

const pollForTargetOntologyStatus = async ({
    taskId,
    taskStateCallback,
    onReady,
    onError,
}: TargetOntologyStatusProps) => {
    const interval = setInterval(async () => {
        try {
            const response = await axios.post("/api/ontology/target/status", { taskId, session_name: getSessionName() });
            const status = response.data.status;
            const taskState = response.data.taskState as TaskState;
            if (taskStateCallback) taskStateCallback(taskState);

            if (status === "completed") {
                clearInterval(interval);
                // fetch the inferred target ontology
                getTargetOntology({
                    callback: (targetOntology) => onReady(targetOntology),
                });
            } else if (status === "failed") {
                clearInterval(interval);
                onError(response.data.message || "Target ontology task failed");
            }
        } catch (error) {
            onError(error);
            console.error("Error polling for target ontology status:", error);
            clearInterval(interval);
        }
    }, 5000);
};

interface RunMatchingTaskProps {
    uploadData: FormData;
    onResult: (result: any) => void;
    onError: (error: any) => void;
    taskStateCallback: (taskState: TaskState) => void;
    onSourceOntologyReady?: (ontology: Ontology[]) => void;
    sourceOntologyTaskStateCallback?: (taskState: TaskState) => void;
    onTargetOntologyReady?: (ontology: Ontology[]) => void;
    targetOntologyTaskStateCallback?: (taskState: TaskState) => void;
}

const runMatchingTask = async ({
    uploadData,
    onResult,
    onError,
    taskStateCallback,
    onSourceOntologyReady,
    sourceOntologyTaskStateCallback,
    onTargetOntologyReady,
    targetOntologyTaskStateCallback,
}: RunMatchingTaskProps) => {
    try {
        const { taskId, sourceOntologyTaskId, targetOntologyTaskId } = await startMatchingTask(uploadData);
        console.log("Matching task started with taskId:", taskId, "; source task:", sourceOntologyTaskId, "; target task:", targetOntologyTaskId);
        // Start matching poller
        pollForMatchingStatus({ taskId, taskStateCallback, onResult, onError });
        // Start source ontology poller if provided by backend and callbacks exist
        if (sourceOntologyTaskId && onSourceOntologyReady) {
            pollForSourceOntologyStatus({
                taskId: sourceOntologyTaskId,
                taskStateCallback: sourceOntologyTaskStateCallback,
                onReady: onSourceOntologyReady,
                onError,
            });
        }
        // Start target ontology poller if provided by backend and callbacks exist
        if (targetOntologyTaskId && onTargetOntologyReady) {
            pollForTargetOntologyStatus({
                taskId: targetOntologyTaskId,
                taskStateCallback: targetOntologyTaskStateCallback,
                onReady: onTargetOntologyReady,
                onError,
            });
        }
    } catch (error) {
        console.error("Error running matching task:", error);
        onError(error);
    }
};


interface getDatasetNamesProps {
    callback: (sourceMeta: DatasetMeta, targetMeta: DatasetMeta) => void;
    signal?: AbortSignal;
}

const getDatasetNames = (prop: getDatasetNamesProps) => {
    return makeApiRequest<void>(
        "/api/datasets/names",
        {
            session_name: getSessionName(),
        },
        prop.signal,
        (data) => {
            const sourceMeta = data?.sourceMeta;
            const targetMeta = data?.targetMeta;
            if (sourceMeta && targetMeta) {
                prop.callback(sourceMeta, targetMeta);
                return;
            } else {
                throw new Error("Invalid dataset meta format");
            }
        }
    );
};

// Common HTTP configuration
const getHttpAgents = () => ({
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
    timeout: 600000, // 10 minutes in milliseconds
});

// Generic API request handler
const makeApiRequest = async <T,>(
    endpoint: string, 
    data: any = {}, 
    signal?: AbortSignal, 
    processResponse?: (response: any) => T
): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        axios.post(endpoint, data, { ...getHttpAgents(), signal })
            .then((response) => {
                if (processResponse) {
                    try {
                        const result = processResponse(response.data);
                        resolve(result);
                    } catch (error) {
                        console.error(`Error processing response from ${endpoint}:`, error);
                        reject(new Error("Error processing response"));
                    }
                } else {
                    resolve(response.data as T);
                }
            })
            .catch((error) => {
                if (error.name === 'AbortError' || error.name === 'CanceledError') {
                    console.log("Request was aborted");
                } else {
                    console.error(`Error in request to ${endpoint}:`, error);
                }
                reject(error);
            });
    });
};

// Generic type parser
const parseArray = <T,>(data: any[], typeName: string): T[] => {
    return data.map((item: object) => {
        try {
            return item as T;
        } catch (error) {
            console.error(`Error parsing result to ${typeName}:`, error);
            return null;
        }
    }).filter((item: T | null): item is T => item !== null);
};

interface getCachedResultsProps {
    callback: (newCandidates: Candidate[]) => void;
    signal?: AbortSignal;
}

const getCachedResults = (prop: getCachedResultsProps) => {
    return makeApiRequest<void>(
        "/api/results",
        { session_name: getSessionName() },
        prop.signal,
        (data) => {
            const results = data?.results;
            if (results?.candidates && Array.isArray(results.candidates)) {
                
                const candidates = parseArray<Candidate>(results.candidates, "Candidate");

                console.log("getCachedResults finished!");
                prop.callback(candidates);
                return;
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
};

interface getMatchersProps {
    callback: (matchers: Matcher[]) => void;
    signal?: AbortSignal;
}

const getMatchers = (prop: getMatchersProps) => {
    return makeApiRequest<void>(
        "/api/matchers",
        { session_name: getSessionName() },
        prop.signal,
        (data) => {
            const matchers = parseArray<Matcher>(data?.matchers, "Matcher");
            console.log("getMatchers finished!", matchers);
            prop.callback(matchers);
            return;
        }
    );
};

interface getUniqueValuesProps {
    callback: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
    signal?: AbortSignal;
}

const getValueBins = (prop: getUniqueValuesProps) => {
    return makeApiRequest<void>(
        "/api/value/bins",
        { session_name: getSessionName() },
        prop.signal,
        (data) => {
            const results = data?.results;
            if (results?.sourceUniqueValues && Array.isArray(results.sourceUniqueValues) && 
                results.targetUniqueValues && Array.isArray(results.targetUniqueValues)) {
                
                const sourceUniqueValuesArray = parseArray<SourceUniqueValues>(
                    results.sourceUniqueValues, 
                    "SourceUniqueValues"
                );
                
                const targetUniqueValuesArray = parseArray<TargetUniqueValues>(
                    results.targetUniqueValues, 
                    "TargetUniqueValues"
                );

                console.log("getValueBins finished!");
                prop.callback(sourceUniqueValuesArray, targetUniqueValuesArray);
                return;
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
};

interface getValueMatchesProps {
    callback: (valueMatches: ValueMatch[]) => void;
    signal?: AbortSignal;
}

const getValueMatches = (prop: getValueMatchesProps) => {
    return makeApiRequest<void>(
        "/api/value/matches",
        { session_name: getSessionName() },
        prop.signal,
        (data) => {
            const results = data?.results;
            if (results && Array.isArray(results)) {
                const valueMatches = parseArray<ValueMatch>(results, "ValueMatch");
                console.log("getValueMatches finished!");
                prop.callback(valueMatches);
                return;
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
};

interface userOperationHistoryProps {
    callback: (userOperations: UserOperation[]) => void;
    signal?: AbortSignal;
}

const getUserOperationHistory = (prop: userOperationHistoryProps) => {
    return makeApiRequest<void>(
        "/api/history",
        { session_name: getSessionName() },
        prop.signal,
        (data) => {
            const history = data?.history;
            if (history && Array.isArray(history)) {
                const userOperations = parseArray<UserOperation>(history, "UserOperation");
                console.log("getUserOperationHistory finished!");
                prop.callback(userOperations);
                return;
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
};

interface targetOntologyProps {
    callback: (targetOntology: Ontology[]) => void;
    signal?: AbortSignal;
}

const getTargetOntology = (prop: targetOntologyProps) => {
    return makeApiRequest<void>(
        "/api/ontology/target",
        { session_name: getSessionName() },
        prop.signal,
        (data) => {
            const results = data?.results;
            if (results && Array.isArray(results)) {
                const targetOntology = parseArray<Ontology>(results, "Ontology");
                console.log("getTargetOntology finished!");
                prop.callback(targetOntology);
                return;
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
};

interface getSourceOntologyProps {
    callback: (sourceOntology: Ontology[]) => void;
    signal?: AbortSignal;
}

const getSourceOntology = (prop: getSourceOntologyProps) => {
    return makeApiRequest<void>(
        "/api/ontology/source",
        { session_name: getSessionName() },
        prop.signal,
        (data) => {
            const results = data?.results;
            if (results && Array.isArray(results)) {
                const sourceOntology = parseArray<Ontology>(results, "Ontology");
                console.log("getSourceOntology finished!");
                prop.callback(sourceOntology);
                return;
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
};


interface userOperationsProps {
    userOperations?: UserOperation[];
    cachedResultsCallback: (candidates: Candidate[]) => void;
    userOperationHistoryCallback: (userOperations: UserOperation[]) => void;
    signal?: AbortSignal;
}

const applyUserOperation = ({
    userOperations,
    cachedResultsCallback,
    userOperationHistoryCallback,
    signal
}: userOperationsProps) => {
    try {
        axios.post("/api/user-operation/apply", { userOperations, session_name: getSessionName() }, { signal })
            .then((response) => {
                console.log("applyUserOperations response: ", response);
                if (response.data && response.data.message === "success") {
                    getCachedResults({ callback: cachedResultsCallback, signal });
                    getUserOperationHistory({ callback: userOperationHistoryCallback, signal });
                }
            })
            .catch((error) => {
                if (error.name === 'AbortError' || error.name === 'CanceledError') {
                    console.log("Request was aborted");
                } else {
                    console.error("Error applying user operations:", error);
                }
            });
    } catch (error) {
        console.error("Error applying user operations:", error);
    }
};

interface undoRedoProps {
    userOperationCallback: (userOperation: UserOperation) => void;
    cachedResultsCallback: (candidates: Candidate[]) => void;
    userOperationHistoryCallback: (userOperations: UserOperation[]) => void;
    signal?: AbortSignal;
}

const undoUserOperation = ({
    userOperationCallback,
    cachedResultsCallback,
    userOperationHistoryCallback,
    signal
}: undoRedoProps) => {
    try {
        axios.post("/api/user-operation/undo", { session_name: getSessionName() }, { signal })
            .then((response) => {
                console.log("undoUserOperations response: ", response);
                if (response.data && response.data.message === "success" && response.data.userOperation) {
                    userOperationCallback(response.data.userOperation as UserOperation);
                    getCachedResults({ callback: cachedResultsCallback, signal });
                    getUserOperationHistory({ callback: userOperationHistoryCallback, signal });
                }
            })
            .catch((error) => {
                if (error.name === 'AbortError' || error.name === 'CanceledError') {
                    console.log("Request was aborted");
                } else {
                    console.error("Error undoing user operations:", error);
                }
            });
    } catch (error) {
        console.error("Error undoing user operations:", error);
    }
};

const redoUserOperation = ({
    userOperationCallback,
    cachedResultsCallback,
    userOperationHistoryCallback,
    signal
}: undoRedoProps) => {
    try {
        axios.post("/api/user-operation/redo", { session_name: getSessionName() }, { signal })
            .then((response) => {
                console.log("redoUserOperations response: ", response);
                if (response.data && response.data.message === "success") {
                    userOperationCallback(response.data.userOperation as UserOperation);
                    getCachedResults({ callback: cachedResultsCallback, signal });
                    getUserOperationHistory({ callback: userOperationHistoryCallback, signal });
                }
            })
            .catch((error) => {
                if (error.name === 'AbortError' || error.name === 'CanceledError') {
                    console.log("Request was aborted");
                } else {
                    console.error("Error redoing user operations:", error);
                }
            });
    } catch (error) {
        console.error("Error redoing user operations:", error);
    }
};


interface getGDCAttributeProps {
    targetColumn: string;
    callback: (gdcAttribute: GDCAttribute) => void;
    signal?: AbortSignal;
}

const getGDCAttribute = (prop: getGDCAttributeProps) => {
    return makeApiRequest<void>(
        "/api/property",
        { targetColumn: prop.targetColumn, session_name: getSessionName() },
        prop.signal,
        (data) => {
            const property = data?.property;
            if (property) {
                const gdcAttribute = {
                    name: property.column_name,
                    category: property.category,
                    node: property.node,
                    type: property.type,
                    description: property.description,
                    enum: property.enum,
                    minimum: property.minimum,
                    maximum: property.maximum,
                    enumDef: property.enumDef,
                } as GDCAttribute;

                prop.callback(gdcAttribute);
                return;
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
};

interface getCandidatesResultProps {
    format: string;
    callbackCsv: (candidates: string) => void;
    callbackJson: (candidates: string) => void;
    signal?: AbortSignal;
}

const getCandidatesResult = (prop: getCandidatesResultProps) => {
    return makeApiRequest<void>(
        "/api/candidates/results",
        { format: prop.format, session_name: getSessionName() },
        prop.signal,
        (data) => {
            const results = data?.results;
            if (results) {
                console.log("getCandidatesResult finished!", results);
                if (prop.format === "csv") {
                    prop.callbackCsv(results as string);
                } else if (prop.format === "json") {
                    prop.callbackJson(results as string);
                }
                return;
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
};

interface updateSourceValueProps {
    column: string;
    value: any;
    newValue: any;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
    signal?: AbortSignal;
}

const updateSourceValue = ({ column, value, newValue, valueMatchesCallback, signal }: updateSourceValueProps) => {
    return makeApiRequest<void>(
        "/api/value/update",
        { column, value, newValue, operation: "source", session_name: getSessionName() },
        signal,
        (data) => {
            if (data && data.message === "success") {
            console.log("updateSourceValue finished!");
                getValueMatches({ callback: valueMatchesCallback, signal });
            } else {
                throw new Error("Invalid results format");
            }
            return;
        }
    );
};

interface updateTargetMatchValueProps {
    sourceColumn: string;
    sourceValue: any;
    targetColumn: string;
    newTargetValue: any;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
    signal?: AbortSignal;
}

const updateTargetMatchValue = ({ sourceColumn, sourceValue, targetColumn, newTargetValue, valueMatchesCallback, signal }: updateTargetMatchValueProps) => {
    return makeApiRequest<void>(
        "/api/value/update",
        { operation: "target", sourceColumn, sourceValue, targetColumn, newTargetValue, session_name: getSessionName() },
        signal,
        (data) => {
            if (data && data.message === "success") {
                console.log("updateTargetMatchValue finished!");
                getValueMatches({ callback: valueMatchesCallback, signal });
            } else {
                throw new Error("Invalid results format");
            }
            return;
        }
    );
};

interface newMatcherProps {
    name: string;
    code: string;
    params: object;
    onResult: (matchers: Matcher[]) => void;
    onError: (error: string) => void;
    taskStateCallback: (taskState: TaskState) => void;
    signal?: AbortSignal;
}

const startNewMatcher = async (name: string, code: string, params: object) => {
    console.log("startNewMatcher", name);
    const response = await axios.post("/api/matcher/new", { name, code, params, session_name: getSessionName() });
    return response.data.task_id;
};

interface MatcherStatusProps {
    taskId: string;
    onResult: (matchers: Matcher[]) => void;
    onError: (error: string) => void;
    taskStateCallback: (taskState: TaskState) => void;
    signal?: AbortSignal;
}

const pollForMatcherStatus = async ({ 
    taskId, 
    onResult, 
    onError,
    taskStateCallback,
    signal
}: MatcherStatusProps) => {
    const interval = setInterval(async () => {
        try {
            const response = await axios.post("/api/matcher/status", { taskId, session_name: getSessionName() }, { signal });
            const status = response.data.status;
            const taskState = response.data.taskState as TaskState;
            taskStateCallback(taskState);
            if (status === "completed") {
                clearInterval(interval);
                console.log("Matcher task completed!");
                if (response.data.matchers && Array.isArray(response.data.matchers)) {
                    const matchers = parseArray<Matcher>(response.data.matchers, "Matcher");
                    console.log("matchers", matchers);
                    onResult(matchers);
                } else {
                    onError("Invalid matcher results format");
                }
            } else if (status === "failed") {
                clearInterval(interval);
                console.log("Matcher task failed!", response.data.error);
                onError(response.data.error || "Unknown error");
            }
        } catch (error) {
            console.error("Error polling for matcher status:", error);
            onError("Error polling for matcher status");
            clearInterval(interval);
        }
    }, 1000);
};

const newMatcher = async ({ name, code, params, onResult, onError, taskStateCallback, signal }: newMatcherProps) => {
    try {
        const taskId = await startNewMatcher(name, code, params);
        console.log("New matcher task started with taskId:", taskId);
        pollForMatcherStatus({ taskId, onResult, onError, taskStateCallback, signal });
    } catch (error) {
        console.error("Error creating new matcher:", error);
        onError("Error creating new matcher");
    }
};

interface RematchTaskProps {
    nodes: string[];
    onResult: (result: any) => void;
    onError: (error: any) => void;
    taskStateCallback: (taskState: TaskState) => void;
}

const startRematchTask = async (nodes: string[]) => {
    console.log("startRematchTask", nodes);
    const response = await axios.post("/api/matching/rematch", { nodes, session_name: getSessionName() });
    return response.data.task_id;
};

const runRematchTask = async ({ nodes, onResult, onError, taskStateCallback }: RematchTaskProps) => {
    try {
        const taskId = await startRematchTask(nodes);
        console.log("Rematch task started with taskId:", taskId);
        pollForMatchingStatus({ taskId, taskStateCallback, onResult, onError });
    } catch (error) {
        console.error("Error running rematch task:", error);
        onError(error);
    }
};

// Session sync helpers

interface SyncSessionOptions {
    onSession?: (session: Session[]) => void;
    onDatasetMeta?: (sourceMeta: DatasetMeta, targetMeta: DatasetMeta) => void;
    onCandidates?: (candidates: Candidate[]) => void;
    onMatchers?: (matchers: Matcher[]) => void;
    signal?: AbortSignal;
}

const syncSessionData = async ({ onSession, onDatasetMeta, onCandidates, onMatchers, signal }: SyncSessionOptions = {}) => {
    const tasks: Promise<any>[] = [];

    if (onSession) {
        tasks.push(
            listSessions({ onSession, signal }),
        );
    }
    if (onDatasetMeta) {
        tasks.push(
            getDatasetNames({
                callback: (sourceMeta, targetMeta) => onDatasetMeta(sourceMeta, targetMeta),
                signal,
            })
        );
    }
    if (onCandidates) {
        tasks.push(
            getCachedResults({
                callback: (candidates) => onCandidates(candidates),
                signal,
            })
        );
    }
    if (onMatchers) {
        tasks.push(
            getMatchers({
                callback: (matchers) => onMatchers(matchers),
                signal,
            })
        );
    }
    await Promise.all(tasks);
};

const createSession = async (sessionName: string, opts: SyncSessionOptions = {}) => {
    const sessions = await axios.post('/api/session/create', { session_name: sessionName });
    // Switch current session to the newly created one
    setSessionName(sessionName);
    await syncSessionData(opts);
    return sessions;
};

const listSessions = async ({ onSession }: SyncSessionOptions = {}): Promise<Session[]> => {
    const response = await axios.post('/api/session/list', {});
    let sessions: Session[] = [];
    if (onSession) {
        if (response.data.sessions) {
            sessions = response.data.sessions.map(
                (session: string) => ({ 
                    name: session
                } as Session));
            onSession(sessions);
        }
    }
    return sessions;
};

const deleteSession = async (sessionName: string, opts: SyncSessionOptions = {}) => {
    const response = await axios.post('/api/session/delete', { session_name: sessionName });
    await syncSessionData(opts);
    return response.data.sessions as string[];
};

interface CreateCandidateProps {
    candidate: Candidate;
    callback: (candidates: Candidate[]) => void;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
    userOperationHistoryCallback: (userOperations: UserOperation[]) => void;
    signal?: AbortSignal;
}

const createCandidate = (prop: CreateCandidateProps) => {
    return makeApiRequest<void>(
        "/api/candidate/create",
        {
            candidate: prop.candidate,
            valueMatchesCallback: prop.valueMatchesCallback,
            userOperationHistoryCallback: prop.userOperationHistoryCallback,
            session_name: getSessionName()
        },
        prop.signal,
        (data) => {
            if (data && data.message === "success") {
                getCachedResults({ callback: prop.callback, signal: prop.signal });
                getValueMatches({ callback: prop.valueMatchesCallback, signal: prop.signal });
                getUserOperationHistory({ callback: prop.userOperationHistoryCallback, signal: prop.signal });
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
};

interface DeleteCandidateProps {
    candidate: AggregatedCandidate;
    callback: (candidates: Candidate[]) => void;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
    userOperationHistoryCallback: (userOperations: UserOperation[]) => void;
    signal?: AbortSignal;
}

const deleteCandidate = (prop: DeleteCandidateProps) => {
    return makeApiRequest<void>(
        "/api/candidate/delete",
        { 
            candidate: prop.candidate,
            valueMatchesCallback: prop.valueMatchesCallback,
            userOperationHistoryCallback: prop.userOperationHistoryCallback,
            session_name: getSessionName()
        },
        prop.signal,
        (data) => {
            if (data && data.message === "success") {
                getCachedResults({ callback: prop.callback, signal: prop.signal });
                getValueMatches({ callback: prop.valueMatchesCallback, signal: prop.signal });
                getUserOperationHistory({ callback: prop.userOperationHistoryCallback, signal: prop.signal });
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
};

export { 
    runMatchingTask,
    pollForMatchingStatus,
    getCachedResults, 
    getMatchers,
    getValueBins, 
    getValueMatches, 
    getUserOperationHistory, 
    getTargetOntology,
    getSourceOntology,
    applyUserOperation, 
    undoUserOperation, 
    redoUserOperation, 
    getGDCAttribute, 
    getCandidatesResult, 
    updateSourceValue,
    updateTargetMatchValue,
    newMatcher,
    pollForMatcherStatus,
    runRematchTask,
    getDatasetNames,
    createSession,
    listSessions,
    deleteSession,
    syncSessionData,
    createCandidate,
    deleteCandidate,
};

// ----------------------
// Comments API (session-scoped)
// ----------------------

type CellComment = { text: string; createdAt: string };

export const listCellComments = async (sourceColumn: string, targetColumn: string): Promise<CellComment[]> => {
    const response = await axios.post("/api/comments/list", { sourceColumn, targetColumn, session_name: getSessionName() }, { ...getHttpAgents() });
    return (response.data?.comments || []) as CellComment[];
};

export const addCellComment = async (sourceColumn: string, targetColumn: string, text: string): Promise<CellComment[]> => {
    const response = await axios.post("/api/comments/add", { sourceColumn, targetColumn, text, session_name: getSessionName() }, { ...getHttpAgents() });
    return (response.data?.comments || []) as CellComment[];
};

export const setCellComments = async (sourceColumn: string, targetColumn: string, comments: CellComment[]): Promise<CellComment[]> => {
    const response = await axios.post("/api/comments/set", { sourceColumn, targetColumn, comments, session_name: getSessionName() }, { ...getHttpAgents() });
    return (response.data?.comments || []) as CellComment[];
};

export const clearCellComments = async (sourceColumn: string, targetColumn: string): Promise<void> => {
    await axios.post("/api/comments/clear", { sourceColumn, targetColumn, session_name: getSessionName() }, { ...getHttpAgents() });
};

export const listAllCellCommentsMap = async (): Promise<Record<string, CellComment[]>> => {
    const response = await axios.post("/api/comments/list", { session_name: getSessionName() }, { ...getHttpAgents() });
    return (response.data?.commentsMap || {}) as Record<string, CellComment[]>;
};

export type { CellComment };