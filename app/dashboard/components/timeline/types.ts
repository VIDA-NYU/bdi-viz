
export interface TimelineNode {
    timelineId: number;
    operation: 'accept' | 'reject' | 'discard' | 'append' | 'prune';
    candidate: AggregatedCandidate | null;
    references: Candidate[];
}

export interface useTimelineProps {
    userOperations: UserOperation[];
}

export interface useTimelineStates {
    nodes: TimelineNode[];
}