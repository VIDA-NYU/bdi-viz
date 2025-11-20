"use client";

import { useMemo } from 'react';
import { TimelineNode } from './types';

interface useTimelineProps {
    userOperations: UserOperation[];
}

interface useTimelineStates {
    nodes: TimelineNode[];
}

export const useTimeline = ({ userOperations }: useTimelineProps): useTimelineStates => {
    
    const nodes = useMemo(() => {
        const nodes: TimelineNode[] = [];
        userOperations.forEach((operation: UserOperation, index: number) => {
            nodes.push({
                timelineId: index,
                operation: operation.operation as 'accept' | 'reject' | 'discard' | 'append' | 'prune' | 'map_source_value' | 'map_target_value',
                candidate: operation.candidate as AggregatedCandidate,
                references: operation.references || [],
                value_mappings: (operation as any).value_mappings || [],
            });
        });
        return nodes;
    }, [userOperations]);

    return { nodes };
};