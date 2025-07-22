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
                operation: operation.operation as 'accept' | 'reject' | 'discard' | 'append' | 'prune',
                candidate: operation.candidate,
                references: operation.references || [],
            });
        });
        return nodes;
    }, [userOperations]);

    return { nodes };
};