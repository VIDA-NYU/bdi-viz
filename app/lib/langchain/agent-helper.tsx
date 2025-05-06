"use client";

import axios from "axios";
import http from 'http';
import https from 'https';

const candidateExplanationRequest = async (candidate: Candidate): Promise<CandidateExplanation | undefined> => {
    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        const resp = await axios.post("/api/agent/explain", candidate, {
            httpAgent,
            httpsAgent,
            timeout: 10000000, // Set timeout to unlimited
        });
        console.log("candidateExplanationRequest: ", resp.data);
        const { is_match, explanations, relevant_knowledge } = resp.data;
        let explanationObjects: Explanation[] = [];
        if (explanations && explanations.length > 0) {
            explanationObjects = explanations.map((e: { id: string; title: string; is_match: boolean; type: string; reason: string; reference: string; confidence: number }) => {
                try {
                    return {
                        id: e.id,
                        title: e.title,
                        isMatch: e.is_match,
                        type: e.type,
                        reason: e.reason,
                        reference: e.reference,
                        confidence: e.confidence,
                    } as Explanation;
                } catch (error) {
                    console.error("Error parsing explanation to Explanation:", error);
                    return null;
                }
            }).filter((e: Explanation | null) => e !== null);
        }
        let relevantKnowledgeObjects: RelevantKnowledge[] = [];
        if (relevant_knowledge && relevant_knowledge.length > 0) {
            relevantKnowledgeObjects = relevant_knowledge.map((rk: object) => {
                try {
                    return rk as RelevantKnowledge;
                } catch (error) {
                    console.error("Error parsing relevant knowledge to RelevantKnowledge:", error);
                    return null;
                }
            }).filter((rk: RelevantKnowledge | null) => rk !== null);
        }
        const candidateExplanation: CandidateExplanation = {
            isMatch: is_match,
            explanations: explanationObjects,
            relevantKnowledge: relevantKnowledgeObjects,
        };

        return candidateExplanation;
    } catch (error) {
        console.error("Error sending candidate explanation request:", error);
    }
};

const agentSuggestionsRequest = async (userOperation: UserOperation, explanations: Explanation[]): Promise<AgentSuggestions | undefined> => {
    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        const resp = await axios.post("/api/agent/suggest", {
            userOperation,
            explanations,
        }, {
            httpAgent,
            httpsAgent,
            timeout: 10000000, // Set timeout to unlimited
        });
        console.log("agentSuggestionsRequest: ", resp.data);

        const { actions } = resp.data;
        let agentActions: AgentAction[] = [];
        if (actions && actions.length > 0) {
            agentActions = actions.map((a: object) => {
                try {
                    return a as AgentAction;
                } catch (error) {
                    console.error("Error parsing action to AgentAction:", error);
                    return null;
                }
            }).filter((a: AgentAction | null) => a !== null);
        }

        const agentSuggestions: AgentSuggestions = {
            actions: agentActions,
        };

        return agentSuggestions;

    } catch (error) {
        console.error("Error sending agent suggestions request:", error);
    }
}

const agentSuggestValueMappings = async (candidate: Candidate): Promise<SuggestedValueMappings | undefined> => {

    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        const resp = await axios.post("/api/agent/value-mapping", candidate, {
            httpAgent,
            httpsAgent,
            timeout: 10000000, // Set timeout to unlimited
        });
        console.log("agentSuggestValueMappings: ", resp.data);

        const valueMappings = resp.data as SuggestedValueMappings;

        return valueMappings;

    } catch (error) {
        console.error("Error sending agent suggest value mappings request:", error);
    }
}

const agentActionRequest = async (reaction: UserReaction): Promise<ActionResponse[] | undefined> => {
    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });
        
        const resp = await axios.post("/api/agent/apply", reaction, {
            httpAgent,
            httpsAgent,
            timeout: 10000000, // Set timeout to unlimited
        });
        console.log("agentActionRequest: ", resp.data);
        
        // let actionResponses = [];
        if (resp.data && resp.data.length > 0) {
            // actionResponses = resp.data.map((ar: object) => {
            //     try {
            //         const {status, response, action, target_candidates} = ar;
            //         if (target_candidates && target_candidates.length > 0) {
            //             target_candidates.map((tc: object) => {
            //                 try {
            //                     return tc as Candidate;
            //                 } catch (error) {
            //                     console.error("Error parsing target candidate to Candidate:", error);
            //                     return null;
            //                 }
            //             }).filter((tc: Candidate | null) => tc !== null);
            //         }
            //         return ar as ActionResponse;
            //     } catch (error) {
            //         console.error("Error parsing action response to ActionResponse:", error);
            //         return null;
            //     }
            // }).filter((ar: ActionResponse | null) => ar !== null);
            console.log("actionResponses: ", resp.data);
            return resp.data;
        }
    } catch (error) {
        console.error("Error sending agent action request:", error);
    }
}

const agentSearchRequest = async (query: string): Promise<Candidate[] | undefined> => {
    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        const resp = await axios.post("/api/agent/search/candidates", { query }, {
            httpAgent,
            httpsAgent,
            timeout: 10000000, // Set timeout to unlimited
        });

        if (resp.data.status === "success" &&
            resp.data.candidates && resp.data.candidates.length > 0) {
            const candidates = resp.data.candidates.map((c: object) => {
                try {
                    return c as Candidate;
                } catch (error) {
                    console.error("Error parsing candidate to Candidate:", error);
                    return null;
                }
            }).filter((c: Candidate | null) => c !== null);
            return candidates;
        }
    } catch (error) {
        console.error("Error sending agent search request:", error);
    }
}

const agentThumbRequest = async (explanation: Explanation, userOperation: UserOperation) => {
    try {
        const resp = await axios.post("/api/agent/thumb", {
            explanation,
            userOperation,
        });
        console.log("agentThumbRequest: ", resp.data);
        return;
    } catch (error) {
        console.error("Error sending agent thumb request:", error);
    }
}


const agentGetRelatedSources = async (candidate: Candidate) => {
    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        const resp = await axios.post("/api/agent/outer-source", candidate, {
            httpAgent,
            httpsAgent,
            timeout: 10000000, // Set timeout to unlimited
        });
        console.log("agentGetRelatedSources: ", resp.data);
        const sources = resp.data.results.sources.map((s: object) => {
            try {
                return s as RelatedSource;
            } catch (error) {
                console.error("Error parsing source to Source:", error);
                return null;
            }
        }).filter((s: RelatedSource | null) => s !== null);

        return sources;

    } catch (error) {
        console.error("Error sending agent get related sources request:", error);
    }
}



const agentSearchOntology = async (query: string, candidate: Candidate) => {
    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        const resp = await axios.post("/api/agent/explore", {
            candidate,
            query,
        }, {
            httpAgent,
            httpsAgent,
            timeout: 10000000, // Set timeout to unlimited
        });
        console.log("agentSearchOntology: ", resp.data);
        
        if (resp.data.status === "success" && resp.data.candidates) {
            return resp.data;
        }
        return null;
    } catch (error) {
        console.error("Error sending agent search ontology request:", error);
    }
}

export { candidateExplanationRequest, agentSuggestionsRequest, agentSuggestValueMappings, agentActionRequest, agentSearchRequest, agentThumbRequest, agentGetRelatedSources, agentSearchOntology };