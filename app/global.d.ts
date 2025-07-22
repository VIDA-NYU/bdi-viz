
declare interface Candidate {
    sourceColumn: string;
    targetColumn: string;
    score: number;
    matcher?: string;
    status?: string; // accepted, rejected, discarded, idle
}

type AggregatedCandidate = {
    sourceColumn: string;
    targetColumn: string;
    matchers: string[];
    score: number;
    status: string;
}

declare interface SourceColumn {
    name: string;
    status: string; // 'complete', 'incomplete', 'discard'
    maxScore: number;
}

declare interface SourceCluster {
    sourceColumn: string;
    cluster: string[];
}

declare interface Ontology {
    name: string;
    parent: string;
    grandparent: string;
}

declare interface UniqueValue {
    value: string;
    count: number;
}

declare interface SourceUniqueValues {
    sourceColumn: string;
    uniqueValues: UniqueValue[];
}

declare interface TargetUniqueValues {
    targetColumn: string;
    uniqueValues: UniqueValue[];
}

declare interface ValueMatch {
    sourceColumn: string;
    sourceValues: string[];
    sourceMappedValues: string[];
    targets: TargetValueMatch[];
}

declare interface TargetValueMatch {
    targetColumn: string;
    targetValues: string[];
}

declare interface DiagnoseObject {
    reason: string;
    confidence: number;
}

declare type UserOperationType = 'accept' | 'reject' | 'discard';

declare interface UserOperation {
    operation: UserOperationType | string;
    candidate: Candidate; // the candidate to operate on
    references: Candidate[]; // the references to the candidate
}

declare type ExplanationType = 'name' | 'token' | 'value' | 'semantic' | 'pattern' | 'history' | 'knowledge' | 'other';

declare interface Explanation {
    title: string;
    id: string;
    isMatch: boolean;
    type: ExplanationType | string;
    reason: string;
    reference: string;
    confidence: number;
}

declare interface RelevantKnowledge {
    entry: string;
    description: string;
}

declare interface CandidateExplanation {
    isMatch: boolean;
    explanations: Explanation[];
    relevantKnowledge?: RelevantKnowledge[];
}

declare interface SuggestedValueMappings {
    sourceColumn: string;
    targetColumn: string;
    matchingValues: string[][];
}

declare interface AgentAction {
    action: string;
    reason: string;
    confidence: number;
}

declare interface UserReaction {
    actions: AgentAction[];
    previousOperation: UserOperation;
}

declare interface Matcher {
    name: string;
    weight: number;
    params?: object;
    code?: string;
}

declare interface GDCAttribute {
    name: string;
    category: string;
    node: string;
    type: string;
    description: GDCDescription[] | string;
    enum?: string[];
    minimum?: number;
    maximum?: number;
}

declare interface GDCDescription {
    description: string;
    termDef?: object;
}

declare interface RelatedSource {
    snippet: string;
    title: string;
    link: string;
}


declare interface TaskState {
    status: string;
    progress: number;
    current_step: string;
    completed_steps: number;
    total_steps: number;
    logs: TaskLog[];
}

declare interface TaskLog {
    timestamp: string;
    step: string;
    progress: number;
    message: string;
}

declare interface MatcherAnalysis {
    name: string;
    description: string;
    mrr: number;
    recallGt: number;
    f1Score: number;
    falsePositives: Candidate[];
    falseNegatives: Candidate[];
    params?: object;
    code?: string;
}

declare interface AgentState {
    message: string;
    query: string;
    conversation_summary: string;
    source_column?: string | null;
    source_values?: string[] | null;
    target_column?: string | null;
    target_values?: string[] | null;
    target_description?: string | null;
    next_agents: string[];
    candidates: Candidate[];
    candidates_to_append: Candidate[];
    task_id?: string;
    matcher_task_id?: string;
}