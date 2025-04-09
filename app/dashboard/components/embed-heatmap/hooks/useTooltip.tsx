// hooks/useTooltip.ts
import { useState, useCallback } from 'react';

const useTooltip = () => {
    const [tooltip, setTooltip] = useState<{
        visible: boolean;
        x: number;
        y: number;
        content: string;
    }>({
        visible: false,
        x: 0,
        y: 0,
        content: ''
    });

    const showTooltip = useCallback((event: React.MouseEvent, data: AggregatedCandidate, pdcAttribute?: GDCAttribute) => {
        setTooltip({
            visible: true,
            x: event.pageX,
            y: event.pageY,
            content: `
            <div style="font-family: 'Roboto','Helvetica','Arial',sans-serif; font-size: 11px; max-width: 300px; word-wrap: break-word;">
            <div><strong>Source:</strong> ${data.sourceColumn}</div>
            <div><strong>Target:</strong> ${data.targetColumn}</div>
            <div><strong>Score:</strong> ${data.score.toFixed(3)}</div>
            ${pdcAttribute && pdcAttribute ? `
                <div>
                <strong>PDC Attribute:</strong>
                <div style="margin-left: 20px;">
                    <div><strong>Category:</strong> ${pdcAttribute.category}</div>
                    <div><strong>Node:</strong> ${pdcAttribute.node}</div>
                    <div><strong>Description:</strong> ${pdcAttribute.description}</div>
                    <div><strong>Type:</strong> ${pdcAttribute.type}</div>
                </div>
                </div>
            ` : ''}
            </div>
            `
        });
    }, []);

    const hideTooltip = useCallback(() => {
        setTooltip(prev => ({ ...prev, visible: false }));
    }, []);

    return { tooltip, showTooltip, hideTooltip };
};

export { useTooltip };