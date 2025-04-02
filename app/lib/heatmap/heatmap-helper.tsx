"use client";

import axios from "axios";
import http from 'http';
import https from 'https';

interface getCachedResultsProps {
    callback: (newCandidates: Candidate[], newSourceCluster: SourceCluster[], newMatchers: Matcher[]) => void;
}

const getCachedResults = (prop: getCachedResultsProps) => {
    return new Promise<void>((resolve, reject) => {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        axios.post("/api/results", {
            httpAgent,
            httpsAgent,
            timeout: 600000, // 10 minutes in milliseconds
        }).then((response) => {
            const results = response.data?.results;
            if (results.candidates && Array.isArray(results.candidates) && results.sourceClusters && Array.isArray(results.sourceClusters)) {
                const candidates = results.candidates.map((result: object) => {
                    try {
                        return result as Candidate;
                    } catch (error) {
                        console.error("Error parsing result to Candidate:", error);
                        return null;
                    }
                }).filter((candidate: Candidate | null) => candidate !== null);

                const sourceClusters = results.sourceClusters.map((result: object) => {
                    try {
                        return result as SourceCluster;
                    } catch (error) {
                        console.error("Error parsing result to SourceCluster:", error);
                        return null;
                    }
                }).filter((sourceCluster: SourceCluster | null) => sourceCluster !== null);

                const matchers = results.matchers.map((result: object) => {
                    try {
                        return result as Matcher;
                    } catch (error) {
                        console.error("Error parsing result to Matcher:", error);
                        return null;
                    }
                }).filter((matcher: Matcher | null) => matcher !== null);

                console.log("getCachedResults finished!");
                prop.callback(candidates, sourceClusters, matchers);
                resolve();
            } else {
                reject(new Error("Invalid results format"));
            }
        }).catch((error) => {
            console.error("Error getting cached results:", error);
            reject(error);
        });
    });
};

interface getUniqueValuesProps {
    callback: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
}

const getValueBins = (prop: getUniqueValuesProps) => {
    return new Promise<void>((resolve, reject) => {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });
        axios.post(`/api/value/bins`, {
            httpAgent,
            httpsAgent,
            timeout: 600000, // 10 minutes in milliseconds
        }).then((response) => {
            const results = response.data?.results;
            if (results.sourceUniqueValues && Array.isArray(results.sourceUniqueValues) && results.targetUniqueValues && Array.isArray(results.targetUniqueValues)) {
                const sourceUniqueValuesArray = results.sourceUniqueValues.map((result: object) => {
                    try {
                        return result as SourceUniqueValues;
                    } catch (error) {
                        console.error("Error parsing result to SourceUniqueValues:", error);
                        return null;
                    }
                }).filter((sourceUniqueValues: SourceUniqueValues | null) => sourceUniqueValues !== null);

                const targetUniqueValuesArray = results.targetUniqueValues.map((result: object) => {
                    try {
                        return result as TargetUniqueValues;
                    } catch (error) {
                        console.error("Error parsing result to TargetUniqueValues:", error);
                        return null;
                    }
                }).filter((targetUniqueValues: TargetUniqueValues | null) => targetUniqueValues !== null);

                console.log("getValueBins finished!");
                prop.callback(sourceUniqueValuesArray, targetUniqueValuesArray);
                resolve();
            } else {
                console.error("Invalid results format");
                reject(new Error("Invalid results format"));
            }
        }).catch((error) => {
            console.error("Error getting unique values:", error);
            reject(error);
        });
    });
}


interface getValueMatchesProps {
    callback: (valueMatches: ValueMatch[]) => void;
}

const getValueMatches = (prop: getValueMatchesProps) => {
    return new Promise<void>((resolve, reject) => {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });
        axios.post(`/api/value/matches`, {
            httpAgent,
            httpsAgent,
            timeout: 600000, // 10 minutes in milliseconds
        }).then((response) => {
            const results = response.data?.results;
            if (results && Array.isArray(results)) {
                const valueMatches = results.map((result: object) => {
                    try {
                        return result as ValueMatch;
                    } catch (error) {
                        console.error("Error parsing result to ValueMatch:", error);
                        return null;
                    }
                }).filter((valueMatch: ValueMatch | null) => valueMatch !== null);

                console.log("getValueMatches finished!");
                prop.callback(valueMatches);
                resolve();
            } else {
                console.error("Invalid results format");
                reject(new Error("Invalid results format"));
            }
        }).catch((error) => {
            console.error("Error getting value matches:", error);
            reject(error);
        });
    });
}

interface userOperationHistoryProps {
    callback: (userOperations: UserOperation[]) => void;
}

const getUserOperationHistory = (prop: userOperationHistoryProps) => {
    return new Promise<void>((resolve, reject) => {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });
        axios.post("/api/history", {
            httpAgent,
            httpsAgent,
            timeout: 600000, // 10 minutes in milliseconds
        }).then((response) => {
            const history = response.data?.history;
            if (history && Array.isArray(history)) {
                const userOperations = history.map((result: object) => {
                    try {
                        return result as UserOperation;
                    } catch (error) {
                        console.error("Error parsing result to UserOperation:", error);
                        return null;
                    }
                }).filter((userOperation: UserOperation | null) => userOperation !== null);

                console.log("getUserOperationHistory finished!");
                prop.callback(userOperations);
                resolve();
            } else {
                console.error("Invalid results format");
                reject(new Error("Invalid results format"));
            }
        }).catch((error) => {
            console.error("Error getting user operation history:", error);
            reject(error);
        });
    });
}

interface targetOntologyProps {
    callback: (targetOntology: TargetOntology[]) => void;
}

const getTargetOntology = (prop: targetOntologyProps) => {
    return new Promise<void>((resolve, reject) => {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });
        axios.post("/api/ontology", {
            httpAgent,
            httpsAgent,
            timeout: 600000, // 10 minutes in milliseconds
        }).then((response) => {
            const results = response.data?.results;
            if (results && Array.isArray(results)) {
                const targetOntology = results.map((result: object) => {
                    try {
                        return result as TargetOntology;
                    } catch (error) {
                        console.error("Error parsing result to TargetOntology:", error);
                        return null;
                    }
                }).filter((targetOntology: TargetOntology | null) => targetOntology !== null);

                console.log("getTargetOntology finished!");
                prop.callback(targetOntology);
                resolve();
            } else {
                console.error("Invalid results format");
                reject(new Error("Invalid results format"));
            }
        }).catch((error) => {
            console.error("Error getting target ontology:", error);
            reject(error);
        });
    });
}

interface userOperationsProps {
    userOperations?: UserOperation[];
    cachedResultsCallback: (candidates: Candidate[], sourceCluster?: SourceCluster[]) => void;
    userOperationHistoryCallback: (userOperations: UserOperation[]) => void;
}

const applyUserOperation = ({
    userOperations,
    cachedResultsCallback,
    userOperationHistoryCallback,
}: userOperationsProps) => {
    try {
        axios.post("/api/user-operation/apply", { userOperations }).then((response) => {
            console.log("applyUserOperations response: ", response);
            if (response.data && response.data.message === "success") {
                getCachedResults({ callback: cachedResultsCallback });
                getUserOperationHistory({ callback: userOperationHistoryCallback });
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
}

const undoUserOperation = ({
    userOperationCallback,
    cachedResultsCallback,
    userOperationHistoryCallback,
}: undoRedoProps) => {
    try {
        axios.post("/api/user-operation/undo", {}).then((response) => {
            console.log("undoUserOperations response: ", response);
            if (response.data && response.data.message === "success" && response.data.userOperation) {
                userOperationCallback(response.data.userOperation as UserOperation);
                getCachedResults({ callback: cachedResultsCallback });
                getUserOperationHistory({ callback: userOperationHistoryCallback });
            }
        });
    } catch (error) {
        console.error("Error undoing user operations:", error);
    }
}

const redoUserOperation = ({
    userOperationCallback,
    cachedResultsCallback,
    userOperationHistoryCallback,
}: undoRedoProps) => {
    try {
        axios.post("/api/user-operation/redo", {}).then((response) => {
            console.log("redoUserOperations response: ", response);
            if (response.data && response.data.message === "success") {
                userOperationCallback(response.data.userOperation as UserOperation);
                getCachedResults({ callback: cachedResultsCallback });
                getUserOperationHistory({ callback: userOperationHistoryCallback });
            }
        });
    } catch (error) {
        console.error("Error redoing user operations:", error);
    }
}

interface getExactMatchesProps {
    callback: (exactMatches: Candidate[]) => void;
}

const getExactMatches = ({callback}: getExactMatchesProps) => {
    return new Promise<void>((resolve, reject) => {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });
        try {
            axios.post("/api/exact-matches", {
                httpAgent,
                httpsAgent,
                timeout: 600000, // 10 minutes in milliseconds
            }).then((response) => {
                const results = response.data?.results;
                if (results && Array.isArray(results)) {
                    const exactMatches = results.map((result: object) => {
                        try {
                            return result as Candidate;
                        } catch (error) {
                            console.error("Error parsing result to Candidate:", error);
                            return null;
                        }
                    }).filter((candidate: Candidate | null) => candidate !== null);

                    console.log("getExactMatches finished!");
                    callback(exactMatches);
                    resolve();
                } else {
                    console.error("Invalid results format");
                    reject(new Error("Invalid results format"));
                }
            });
            resolve();
        } catch (error) {
            console.error("Error getting exact matches:", error);
            reject(error);
        }
    });
}

interface getGDCAttributeProps {
    targetColumn: string;
    callback: (gdcAttribute: GDCAttribute) => void;
}

const getGDCAttribute = (prop: getGDCAttributeProps) => {
    return new Promise<void>((resolve, reject) => {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });
        axios.post("/api/property", {
            targetColumn: prop.targetColumn,
        }, {
            httpAgent,
            httpsAgent,
            timeout: 600000, // 10 minutes in milliseconds
        }).then((response) => {
            const property = response.data?.property;
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
                resolve();
            } else {
                console.error("Invalid results format");
                reject(new Error("Invalid results format"));
            }
        }).catch((error) => {
            console.error("Error getting GDC attribute:", error);
            reject(error);
        });
    });
}

interface getCandidatesResultProps {
    format: string;
    callbackCsv: (candidates: string) => void;
    callbackJson: (candidates: string) => void;
}

const getCandidatesResult = (prop: getCandidatesResultProps) => {
    return new Promise<void>((resolve, reject) => {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });
        axios.post("/api/candidates/results", {
            format: prop.format,
        }, {
            httpAgent,
            httpsAgent,
            timeout: 600000, // 10 minutes in milliseconds
        }).then((response) => {
            const results = response.data?.results;
            if (results) {
                // const csv = results.split('\n').map((line: string) => line.split(','));
                // const headers = csv[0];
                console.log("getCandidatesResult finished!", results);
                if (prop.format === "csv") {
                    prop.callbackCsv(results as string);
                } else if (prop.format === "json") {
                    prop.callbackJson(results as string);
                }
                resolve();
            } else {
                console.error("Invalid results format");
                reject(new Error("Invalid results format"));
            }
        }).catch((error) => {
            console.error("Error getting candidates result:", error);
            reject(error);
        });
    });
}

interface updateSourceValueProps {
    column: string;
    value: any;
    newValue: any;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;

}

const updateSourceValue = ({ column, value, newValue, valueMatchesCallback }: updateSourceValueProps) => {
    return new Promise<void>((resolve, reject) => {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        console.log(`Updating source value: ${column} ${value} -> ${newValue}`);
        axios.post("/api/value/update", {
            column,
            value,
            newValue,
        }, {
            httpAgent,
            httpsAgent,
            timeout: 600000, // 10 minutes in milliseconds
        }).then(() => {
            console.log("updateSourceValue finished!");
            getValueMatches({ callback: valueMatchesCallback });
            resolve();
        }).catch((error) => {
            console.error("Error updating source value:", error);
            reject(error);
        });
    });
}



export { getCachedResults, getValueBins, getValueMatches, getUserOperationHistory, getTargetOntology, applyUserOperation, undoUserOperation, redoUserOperation, getExactMatches, getGDCAttribute, getCandidatesResult, updateSourceValue };