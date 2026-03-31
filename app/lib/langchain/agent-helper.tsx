"use client";

import axios from "axios";
import http from 'http';
import https from 'https';
import { getSessionName, setSessionName } from "@/app/lib/settings/session";

const candidateExplanationRequest = async (candidate: Candidate): Promise<CandidateExplanation | undefined> => {
    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        const resp = await axios.post("/api/agent/explain", {
            session_name: getSessionName(),
            ...candidate,
        }, {
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

type CachedExplanationItem = {
    type: string;
    isMatch: boolean;
    confidence: number;
};

type CachedExplanationSummary = {
    sourceColumn: string;
    targetColumn: string;
    types: string[];
    explanations: CachedExplanationItem[];
};

const cachedExplanationSummariesRequest = async (
    candidates: Array<Pick<Candidate, "sourceColumn" | "targetColumn">>
): Promise<CachedExplanationSummary[]> => {
    if (!candidates.length) return [];

    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        const resp = await axios.post(
            "/api/agent/explain/cached-types",
            {
                session_name: getSessionName(),
                candidates,
            },
            {
                httpAgent,
                httpsAgent,
                timeout: 10000000,
            }
        );

        const list = resp.data?.results?.cachedExplanationTypes;
        if (!Array.isArray(list)) return [];
        return list.map((item: any) => {
            const sourceColumn = String(item?.sourceColumn ?? "");
            const targetColumn = String(item?.targetColumn ?? "");
            const types = Array.isArray(item?.types) ? item.types.map(String) : [];
            const explanations: CachedExplanationItem[] = Array.isArray(item?.explanations)
                ? item.explanations
                      .map((e: any) => ({
                          type: String(e?.type ?? ""),
                          isMatch: Boolean(e?.isMatch),
                          confidence: Number(e?.confidence ?? 0),
                      }))
                      .filter((e: CachedExplanationItem) => Boolean(e.type))
                : [];

            return { sourceColumn, targetColumn, types, explanations };
        });
    } catch (error) {
        console.error("Error fetching cached explanation summaries:", error);
        return [];
    }
};

const agentSuggestValueMappings = async (candidate: Candidate): Promise<SuggestedValueMappings | undefined> => {

    try {
        const httpAgent = new http.Agent({ keepAlive: true });
        const httpsAgent = new https.Agent({ keepAlive: true });

        const resp = await axios.post("/api/agent/value-mapping", {
            session_name: getSessionName(),
            ...candidate,
        }, {
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
            session_name: getSessionName(),
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

        const resp = await axios.post("/api/agent/outer-source", {
            session_name: getSessionName(),
            ...candidate,
        }, {
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

        const resp = await axios.get("/api/agent/explore", {
            params: {
                session_name: getSessionName(),
                query,
                sourceColumn: candidate?.sourceColumn,
                targetColumn: candidate?.targetColumn,
            },
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

// SSE streaming for LangGraph agent updates
type AgentStreamEvent = {
    kind: "delta" | "tool" | "final" | "error" | "done" | string;
    node?: string;
    // Normalized envelopes from backend
    state?: any; // AgentState for delta/final
    tool?: { phase: "call" | "result"; calls?: Array<{ name?: string; args?: any }>; name?: string; content?: string; is_error?: boolean };
    // Back-compat fields
    content?: string;
    calls?: Array<{ name?: string; args?: any }>;
    name?: string;
    is_error?: boolean;
};

type AgentStreamHandlers = {
    onDelta?: (state: any, node?: string) => void;
    onTool?: (payload: any, node?: string) => void; // receives calls or tool result
    onFinal?: (state: any) => void;
    onError?: (error: any) => void;
    onDone?: () => void;
};

const agentStream = (
    query: string,
    opts?: { sourceColumn?: string; targetColumn?: string },
    handlers?: AgentStreamHandlers
) => {
    const params = new URLSearchParams({
        session_name: getSessionName() || "default",
        query: query || "",
    });
    if (opts?.sourceColumn) params.set("sourceColumn", opts.sourceColumn);
    if (opts?.targetColumn) params.set("targetColumn", opts.targetColumn);

    const base = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');
    const url = `${base || ''}/api/agent/explore?${params.toString()}`;
    const es = new EventSource(url, { withCredentials: false });

    const safeParse = (e: MessageEvent) => {
        try {
            return JSON.parse(e.data);
        } catch (err) {
            return { raw: e.data };
        }
    };

    es.addEventListener("delta", (e: MessageEvent) => {
        const data = safeParse(e) as AgentStreamEvent;
        if (data?.state && handlers?.onDelta) {
            handlers.onDelta(data.state, data.node);
        } else {
            console.error("Invalid delta event:", data);
        }
    });

    es.addEventListener("tool", (e: MessageEvent) => {
        const data = safeParse(e) as AgentStreamEvent;
        if (handlers?.onTool) handlers.onTool(data.tool ?? data, data.node);
    });

    es.addEventListener("final", (e: MessageEvent) => {
        const data = safeParse(e) as AgentStreamEvent;
        if (handlers?.onFinal) handlers.onFinal(data.state ?? data);
    });

    es.addEventListener("error", (e: MessageEvent) => {
        const data = safeParse(e);
        if (handlers?.onError) handlers.onError(data);
    });

    es.addEventListener("done", () => {
        if (handlers?.onDone) handlers.onDone();
        es.close();
    });

    // In case server sends generic events
    es.onerror = (err) => {
        if (handlers?.onError) handlers.onError(err);
    };

    return es; // caller can close if needed
};

export { 
    candidateExplanationRequest,
    cachedExplanationSummariesRequest,
    agentSuggestValueMappings,
    agentThumbRequest,
    agentGetRelatedSources,
    agentStream,
 };
