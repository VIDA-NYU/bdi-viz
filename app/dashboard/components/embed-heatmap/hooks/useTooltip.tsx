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

    const showTooltip = useCallback((event: React.MouseEvent, data: AggregatedCandidate) => {
        const normalizeName = (name: string) =>
            (name || '')
                .toLowerCase()
                .replace(/[_\s\-]/g, '')
                .replace(/[^a-z0-9]/g, '');

        const isEasy = Array.isArray(data.matchers) && data.matchers.includes('candidate_quadrants');
        const isExactName = normalizeName(data.sourceColumn) === normalizeName(data.targetColumn);

        const easyMatchBadge = isEasy
            ? `<div style="margin: 6px 0 4px 0; display: inline-flex; align-items: center; gap: 6px;">
                   <span style="background:#E8F5E9;color:#1B5E20;border:1px solid #A5D6A7;border-radius:10px;padding:2px 8px;font-weight:700;font-size:10px;">EASY MATCH</span>
                   <span style="color:#2E7D32;font-size:11px;">${isExactName ? 'Exact name match' : 'High name/value similarity'}</span>
               </div>`
            : '';

        const matchersList = Array.isArray(data.matchers) && data.matchers.length
            ? `<div>
                   <strong>Matchers:</strong>
                   <ul style="list-style: disc; margin-left: 20px; padding: 0;">
                       ${data.matchers.map((matcher: string) => `<li style="margin-bottom: 4px;">${matcher}</li>`).join('')}
                   </ul>
               </div>`
            : '';

        setTooltip({
            visible: true,
            x: event.pageX,
            y: event.pageY,
            content: `
            <div style="font-family: Arial, sans-serif; font-size: 12px;">
                ${easyMatchBadge}
                <div><strong>Source:</strong> ${data.sourceColumn}</div>
                <div><strong>Target:</strong> ${data.targetColumn}</div>
                <div><strong>Score:</strong> ${data.score.toFixed(3)}</div>
                ${matchersList}
                <div><strong>Status:</strong> ${data.status}</div>
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