// types.ts

interface ExpandedCellProps {
    sourceUniqueValues: SourceUniqueValues;
    targetUniqueValues: TargetUniqueValues;
    data: AggregatedCandidate;
    width: number; 
    height: number;
    onClose: () => void;
    onClick: () => void;
    onMouseMove: (event: React.MouseEvent) => void;
    onMouseLeave: () => void;
    deleteCandidate: () => void;
   }
   
   interface BaseExpandedCellProps extends ExpandedCellProps {
    x: number;
    y: number;
   }
// type ExpandedCellType = 'histogram' | 'correlation' | 'scatter' | 'distribution';

type ExpandedCellType = 'histogram' | 'scatter' 

export type { ExpandedCellProps, ExpandedCellType, BaseExpandedCellProps };