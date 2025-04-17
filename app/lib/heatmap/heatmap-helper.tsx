"use client";

import axios from "axios";
import http from 'http';
import https from 'https';

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
        const config = {
            ...getHttpAgents(),
            ...data
        };

        axios.post(endpoint, config, { signal })
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
    callback: (newCandidates: Candidate[], newSourceCluster: SourceCluster[], newMatchers: Matcher[]) => void;
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
                const matchers = parseArray<Matcher>(results.matchers, "Matcher");

                console.log("getCachedResults finished!");
                prop.callback(candidates, sourceClusters, matchers);
                return;
            } else {
                throw new Error("Invalid results format");
            }
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
    callback: (targetOntology: TargetOntology[]) => void;
    signal?: AbortSignal;
}

const getTargetOntology = (prop: targetOntologyProps) => {
    return makeApiRequest<void>(
        "/api/ontology",
        {},
        prop.signal,
        (data) => {
            const results = data?.results;
            if (results && Array.isArray(results)) {
                const targetOntology = parseArray<TargetOntology>(results, "TargetOntology");
                console.log("getTargetOntology finished!");
                prop.callback(targetOntology);
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

interface getExactMatchesProps {
    callback: (exactMatches: Candidate[]) => void;
    signal?: AbortSignal;
}

const getExactMatches = ({callback, signal}: getExactMatchesProps) => {
    return makeApiRequest<void>(
        "/api/exact-matches",
        {},
        signal,
        (data) => {
            const results = data?.results;
            if (results && Array.isArray(results)) {
                const exactMatches = parseArray<Candidate>(results, "Candidate");
                console.log("getExactMatches finished!");
                callback(exactMatches);
                return;
            } else {
                throw new Error("Invalid results format");
            }
        }
    );
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

export { 
    getCachedResults, 
    getValueBins, 
    getValueMatches, 
    getUserOperationHistory, 
    getTargetOntology, 
    applyUserOperation, 
    undoUserOperation, 
    redoUserOperation, 
    getExactMatches, 
    getGDCAttribute, 
    getCandidatesResult, 
    updateSourceValue 
};