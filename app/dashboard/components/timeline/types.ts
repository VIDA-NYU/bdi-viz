
export interface TimelineNode {
    timelineId: number;
    operation: 'accept' | 'reject' | 'discard' | 'append' | 'prune' | 'create' | 'delete' | 'map_source_value' | 'map_target_value';
    candidate: AggregatedCandidate | null;
    references: Candidate[];
    value_mappings?: Array<{ from: string; to: string }>;
}

export interface useTimelineProps {
    userOperations: UserOperation[];
}

export interface useTimelineStates {
    nodes: TimelineNode[];
}