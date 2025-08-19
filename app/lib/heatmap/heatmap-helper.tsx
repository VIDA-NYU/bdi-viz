"use client";

import axios from "axios";
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
            const response = await axios.post("/api/matching/status", { taskId });
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
            const response = await axios.post("/api/ontology/source/status", { taskId });
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
            const response = await axios.post("/api/ontology/target/status", { taskId });
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
    callback: (newCandidates: Candidate[], newSourceCluster: SourceCluster[]) => void;
    signal?: AbortSignal;
}

const getCachedResults = (prop: getCachedResultsProps) => {
    return makeApiRequest<void>(
        "/api/results",
        {},
        prop.signal,
        (data) => {
            const results = data?.results;
            if (results?.candidates && Array.isArray(results.candidates) && 
                results.sourceClusters && Array.isArray(results.sourceClusters)) {
                
                const candidates = parseArray<Candidate>(results.candidates, "Candidate");
                const sourceClusters = parseArray<SourceCluster>(results.sourceClusters, "SourceCluster");

                console.log("getCachedResults finished!");
                prop.callback(candidates, sourceClusters);
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
        {},
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
        {},
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
        {},
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
        {},
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
        {},
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
        {},
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
    cachedResultsCallback: (candidates: Candidate[], sourceCluster?: SourceCluster[]) => void;
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
        axios.post("/api/user-operation/apply", { userOperations }, { signal })
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
    cachedResultsCallback: (candidates: Candidate[], sourceCluster?: SourceCluster[]) => void;
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
        axios.post("/api/user-operation/undo", {}, { signal })
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
        axios.post("/api/user-operation/redo", {}, { signal })
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
        { targetColumn: prop.targetColumn },
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
        { format: prop.format },
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
        { column, value, newValue },
        signal,
        () => {
            console.log("updateSourceValue finished!");
            getValueMatches({ callback: valueMatchesCallback, signal });
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
    const response = await axios.post("/api/matcher/new", { name, code, params });
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
            const response = await axios.post("/api/matcher/status", { taskId }, { signal });
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
    const response = await axios.post("/api/matching/rematch", { nodes });
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
    newMatcher,
    pollForMatcherStatus,
    runRematchTask,
};