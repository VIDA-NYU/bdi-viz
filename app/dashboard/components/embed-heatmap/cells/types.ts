// components/cells/types.ts
import { ScaleSequential } from 'd3';
import { HeatMapConfig } from '../types';

interface CellProps {
    config: HeatMapConfig;
    data: AggregatedCandidate;
    x: number;
    y: number;
    width: number;
    height: number;
    color: ScaleSequential<string, string>;
    isSelected?: boolean;
    onHover?: (event: React.MouseEvent, data: any) => void;
    onMouseMove?: (event: React.MouseEvent) => void;
    onLeave?: () => void;
    onClick?: (data: AggregatedCandidate) => void;
    isHighlighted?: boolean;
    hasComment?: boolean;
    onCommentClick?: (data: AggregatedCandidate, event?: React.MouseEvent) => void;
    onContextMenu?: (event: React.MouseEvent, data: AggregatedCandidate) => void;
}

export type {
    CellProps
}