// components/cells/RectCell.tsx
import React from 'react';
import { useTheme } from '@mui/material';
import { CellProps } from './types';

const RectCell: React.FC<CellProps> = ({
    data,
    x,
    y,
    width,
    height,
    color,
    onHover,
    onMouseMove,
    onLeave,
    onClick,
    isHighlighted
}) => {
    const theme = useTheme();

    const getFillColor = () => {
        if (data.status === 'accepted') return theme.palette.success.dark;
        if (data.status === 'rejected') return theme.palette.error.dark;
        return color(data.score);
    };

    const getOpacity = () => {
        if (data.status === 'rejected') return 0.8;
        if (data.status === 'discarded') return 0.1;
        if (isHighlighted !== undefined && !isHighlighted) return 0.5;
        return 1;
    };

    return (
        <rect
            data-testid={`cell-${data.sourceColumn}-${data.targetColumn}`}
            className='heatmap-cell'
            x={x}
            y={y}
            width={width}
            height={height}
            fill={getFillColor()}
            opacity={getOpacity()}
            stroke="black"
            strokeWidth={isHighlighted ? 2 : 0}
            onMouseEnter={(e) => {
                onHover?.(e, data);
            }}
            onMouseLeave={(e) => {
                onLeave?.();
            }}
            onMouseMove={onMouseMove}
            onClick={() => onClick?.(data)}
            rx={3}
            ry={3}
        />
    );
};

export { RectCell };
