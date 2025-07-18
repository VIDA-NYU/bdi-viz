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



const agentSearchOntology = async (query: string, candidate?: Candidate) => {
    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        const resp = await axios.post("/api/agent/explore", {
            candidate: candidate || undefined,
            query,
        }, {
            httpAgent,
            httpsAgent,
            timeout: 10000000, // Set timeout to unlimited
        });
        console.log("agentSearchOntology: ", resp.data);
        return resp.data as AgentState;
    } catch (error) {
        console.error("Error sending agent search ontology request:", error);
    }
}

export { candidateExplanationRequest, agentSuggestValueMappings, agentThumbRequest, agentGetRelatedSources, agentSearchOntology };