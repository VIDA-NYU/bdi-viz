"use client";

import * as d3 from 'd3';
import { useEffect, useRef } from "react";
import { useTimeline } from "./useTimeline";
import { Box, useTheme, Button } from '@mui/material';
import { SectionHeader } from '../../layout/components';
import { TimelineNode } from './types';
import ExportHistoryButton from './export-history-button';

interface TimelineProps {
    userOperations: UserOperation[];
}

const chipStyle = (bg: string, color: string, theme: any) => `
            display:inline-block;
            background:${bg};
            color:${color};
            border-radius:16px;
            padding:0 8px;
            font-size:0.65rem;
            font-weight:500;
            margin-right:0px;
            margin-bottom:0px;
            line-height:1.8;
            vertical-align:middle;
            border:1px solid ${theme.palette.divider};
        `;

const chipStyleSecondary = (color: string, theme: any) => `
            display:inline-block;
            background:${color}20;
            color:${color};
            border-radius:10px;
            padding:3px;
            font-size:0.6rem;
            font-weight:500;
            margin-right:1px;
            margin-bottom:1px;
            line-height:1.2;
            vertical-align:middle;
        `;

const getOpColor = (
    operation: TimelineNode["operation"],
    theme: any
): string => {
    return operation === "accept"
        ? theme.palette.success.main
        : operation === "reject"
        ? theme.palette.error.main
        : operation === "discard"
        ? theme.palette.warning.main
        : operation === "append"
        ? theme.palette.info.main
        : operation === "prune"
        ? theme.palette.secondary.main
        : operation === "create"
        ? theme.palette.primary.main
        : operation === "delete"
        ? theme.palette.error.main
        : operation === "map_source_value"
        ? theme.palette.info.main
        : operation === "map_target_value"
        ? theme.palette.info.main
        : theme.palette.text.primary;
};

const getNodeContent = (d: TimelineNode, isExpanded: boolean, theme: any): string => {
    const { operation, candidate, references, value_mappings } = d;
    const truncate = (str: string, n: number) => (str.length > n ? str.slice(0, n-1) + '…' : str);
    let title = '';
    let details = '';
    
    if (operation === 'map_source_value' && candidate) {
        // Use all mappings for expanded table view, but only the first for the compact title
        const mappings = (value_mappings || []) as Array<{ from?: string; to?: string }>;
        const first = mappings[0] || {};
        const from = (first.from ?? '').toString();
        const to = (first.to ?? '').toString();

        const column = truncate(candidate.sourceColumn || '', isExpanded ? 30 : 18);
        const columnChip = `<span style="${chipStyle(theme.palette.primary.main, theme.palette.primary.contrastText, theme)}">${column}</span>`;
        const fromChip = `<span style="${chipStyleSecondary(theme.palette.text.secondary, theme)}">${truncate(from, isExpanded ? 32 : 14)}</span>`;
        const toChip = `<span style="${chipStyleSecondary(theme.palette.info.main, theme)}">${truncate(to, isExpanded ? 32 : 14)}</span>`;

        title = `
            <span style="font-weight:600;font-size:0.7rem;">value:</span>
            ${columnChip}
            <span style="margin:0 2px;font-size:0.65rem;">→</span>
            ${toChip}
        `;

        if (isExpanded) {
            const maxRows = 8;
            const rows = mappings.slice(0, maxRows).map(m => {
                const f = (m.from ?? '').toString();
                const t = (m.to ?? '').toString();
                return `
                    <tr>
                        <td style="padding:2px 6px;border-bottom:1px solid ${theme.palette.divider};max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${f || '<em>(empty)</em>'}
                        </td>
                        <td style="padding:2px 6px;border-bottom:1px solid ${theme.palette.divider};max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${t || '<em>(empty)</em>'}
                        </td>
                    </tr>
                `;
            }).join('');
            const moreRow =
                mappings.length > maxRows
                    ? `<tr><td colspan="2" style="padding:2px 6px;color:${theme.palette.text.disabled};font-style:italic;">+${mappings.length - maxRows} more…</td></tr>`
                    : '';

            details = `
                <div class="timeline-details" style="
                    color:${theme.palette.text.secondary};
                    font-size:0.6rem;
                    margin-top:4px;
                    line-height:1.4;
                ">
                    <table style="margin-top:4px;border-collapse:collapse;width:100%;table-layout:fixed;">
                        <thead>
                            <tr>
                                <th style="text-align:left;font-weight:500;padding:2px 6px;border-bottom:1px solid ${theme.palette.divider};">From</th>
                                <th style="text-align:left;font-weight:500;padding:2px 6px;border-bottom:1px solid ${theme.palette.divider};">To</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                            ${moreRow}
                        </tbody>
                    </table>
                </div>
            `;
        }
    } else if (operation === 'map_target_value' && candidate) {
        // For map_target_value we may receive enriched mappings:
        // { source_value, old_target_value, new_target_value }
        // Fall back to legacy { from, to } if needed.
        const mappings = (value_mappings || []) as Array<{
            source_value?: string;
            old_target_value?: string;
            new_target_value?: string;
            from?: string;
            to?: string;
        }>;
        const first = mappings[0] || {};
        const sourceValue = (first.source_value ?? '').toString();
        const oldTarget = (first.old_target_value ?? first.from ?? '').toString();
        const newTarget = (first.new_target_value ?? first.to ?? '').toString();

        const targetCol = truncate(candidate.targetColumn || '', isExpanded ? 22 : 12);
        const targetChip = `<span style="${chipStyle(theme.palette.secondary.main, theme.palette.primary.contrastText, theme)}">${targetCol}</span>`;
        const changeLabel = truncate(
            `${oldTarget || '(none)'} → ${newTarget || '(none)'}`,
            isExpanded ? 40 : 18
        );
        const changeChip = `<span style="${chipStyleSecondary(theme.palette.info.main, theme)}">${changeLabel}</span>`;

        title = `
            <span style="font-weight:600;font-size:0.7rem;">value:</span>
            ${targetChip}
            ${changeChip}
        `;

        if (isExpanded) {
            const maxRows = 8;
            const rows = mappings.slice(0, maxRows).map(m => {
                const src = (m.source_value ?? '').toString();
                const oldT = (m.old_target_value ?? m.from ?? '').toString();
                const newT = (m.new_target_value ?? m.to ?? '').toString();
                return `
                    <tr>
                        <td style="padding:2px 6px;border-bottom:1px solid ${theme.palette.divider};max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${src || '<em>(empty)</em>'}
                        </td>
                        <td style="padding:2px 6px;border-bottom:1px solid ${theme.palette.divider};max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${oldT || '<em>(empty)</em>'}
                        </td>
                        <td style="padding:2px 6px;border-bottom:1px solid ${theme.palette.divider};max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${newT || '<em>(empty)</em>'}
                        </td>
                    </tr>
                `;
            }).join('');
            const moreRow =
                mappings.length > maxRows
                    ? `<tr><td colspan="3" style="padding:2px 6px;color:${theme.palette.text.disabled};font-style:italic;">+${mappings.length - maxRows} more…</td></tr>`
                    : '';

            details = `
                <div class="timeline-details" style="
                    color:${theme.palette.text.secondary};
                    font-size:0.6rem;
                    margin-top:4px;
                    line-height:1.4;
                ">
                    <table style="margin-top:4px;border-collapse:collapse;width:100%;table-layout:fixed;">
                        <thead>
                            <tr>
                                <th style="text-align:left;font-weight:500;padding:2px 6px;border-bottom:1px solid ${theme.palette.divider};">Source value</th>
                                <th style="text-align:left;font-weight:500;padding:2px 6px;border-bottom:1px solid ${theme.palette.divider};">Old target</th>
                                <th style="text-align:left;font-weight:500;padding:2px 6px;border-bottom:1px solid ${theme.palette.divider};">New target</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                            ${moreRow}
                        </tbody>
                    </table>
                </div>
            `;
        }
    } else if (operation === 'append' || operation === 'prune') {
        const count = references.length;
        const source = truncate(candidate?.sourceColumn || '', isExpanded ? 30 : 15);
        const sourceChip = `<span style="${chipStyle(theme.palette.primary.main, theme.palette.primary.contrastText, theme)}">${source}</span>`;
        title = `<span style='font-weight:600;font-size:0.7rem;'>${operation}: ${sourceChip}</span>`;
        if (count > 0) {
            const sliceEnd = isExpanded ? count : 2;
            const list = references.slice(0, sliceEnd).map(r => `<span style="${chipStyleSecondary("#2196f3", theme)}">${truncate(r.targetColumn, 15)}</span>`).join(', ');
            const more = !isExpanded && count > 2 ? ` ... (+${count - 2})` : '';
            details = `
                <div class="timeline-details" style="
                    color:${theme.palette.text.secondary};
                    font-size:0.6rem;
                    line-height:1.2;
                ">
                    ${list}${more}
                </div>
            `;
        }
    } else if (candidate) {
        const source = truncate(candidate.sourceColumn, isExpanded ? 30 : 15);
        const target = truncate(candidate.targetColumn, isExpanded ? 30 : 15);
        const sourceChip = `<span style="${chipStyle(theme.palette.primary.main, theme.palette.primary.contrastText, theme)}">${source}</span>`;
        const targetChip = `<span style="${chipStyle(theme.palette.secondary.main, theme.palette.primary.contrastText, theme)}">${target}</span>`;
        title = `<span style='font-weight:600;font-size:0.7rem;'>${operation}:</span> ${sourceChip} <span style="font-size:1.1em;vertical-align:middle;">→</span> ${targetChip}`;

        if (isExpanded) {
            details = `
                <div class="timeline-details" style="
                    color:${theme.palette.text.secondary};
                    font-size:0.6rem;
                    margin-top:5px;
                    line-height:1.2;
                ">
                    <span style='font-weight:500;'>Score:</span> ${candidate.score?.toFixed(2)}
                    ${isExpanded && candidate.matchers ? `<br/><span style='font-weight:500;'>Matchers:</span> ${candidate.matchers.join(', ')}` : ''}
                </div>
            `;
        } else {
            details = `
                <div class="timeline-details" style="
                    color:${theme.palette.text.secondary};
                    font-size:0.6rem;
                    margin-top:5px;
                    line-height:1.2;
                ">
                    <span style='font-weight:500;'>Score:</span> ${candidate.score?.toFixed(2)}
                </div>
            `;
        }
    }
    return `
        <div style="flex-direction:column;align-items:flex-start;">
            <div style="align-items:center;">${title}</div>
            ${details ? `<div style='margin-top:2px;width:100%;height:56px;overflow-y:auto;'>${details}</div>` : ''}
        </div>
    `;
};


const Timeline = ({ userOperations }: TimelineProps) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const theme = useTheme();

    const { nodes } = useTimeline({ userOperations });

    useEffect(() => {
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove(); // Clear previous content

        if (nodes.length === 0) return;

        const width = 290;
        const textWidth = 240;
        const paddingLeft = 20;
        const paddingTop = 20;
        const nodeDistance = 80;
        const height = (nodes.length + 1) * nodeDistance + paddingTop; // Adjust height for the start node

        svg.attr("width", width).attr("height", height);

        svg
            .selectAll(".link")
            .data(nodes)
            .enter()
            .append("line")
            .attr("class", "link")
            .attr("x1", paddingLeft)
            .attr("y1", (d, i) => i * nodeDistance + paddingTop)
            .attr("x2", paddingLeft)
            .attr("y2", (d, i) => (i + 1) * nodeDistance + paddingTop)
            .attr("stroke", theme.palette.divider)
            .attr("stroke-width", 2);
        
        const startNodeGroup = svg
            .append("g")
            .attr("class", "start-node")
            .attr("transform", `translate(${paddingLeft}, ${paddingTop})`);

        startNodeGroup
            .append("circle")
            .attr("r", 10)
            .attr("fill", theme.palette.primary.main);

        const nodeGroup = svg
            .selectAll(".node")
            .data(nodes)
            .enter()
            .append("g")
            .attr("class", "node")
            .attr("transform", (d, i) => `translate(${paddingLeft}, ${(i + 1) * nodeDistance + paddingTop})`);

        nodeGroup
            .append("circle")
            .attr("r", 12)
            .attr("fill", 
                d => getOpColor(d.operation as any, theme));

        nodeGroup
            .append("text")
            .attr("dy", ".35em")
            .attr("text-anchor", "middle")
            .attr("fill", theme.palette.common.white)
            .attr("font-size", "0.6rem")
            .attr("font-weight", "bold")
            .text(d => d.operation.charAt(0).toUpperCase());

        const foreignObject = nodeGroup
            .append("foreignObject")
            .attr("x", paddingLeft)
            .attr("y", -25)
            .attr("width", textWidth)
            .attr("height", 50);
        
        const div = foreignObject
            .append("xhtml:div")
            .style("background", theme.palette.background.paper)
            .style("padding", "3px 5px")
            .style("border-radius", "8px")
            .style("font-size", "0.7rem")
            .style("font-family", `"Roboto","Helvetica","Arial",sans-serif`)
            .style("height", "100%")
            .style("border", `1.5px solid ${theme.palette.divider}`)
            .style("box-sizing", "border-box")
            .style("white-space", "nowrap")
            .style("overflow", "hidden")
            .style("text-overflow", "ellipsis")
            .style("transition", "all 0.2s cubic-bezier(.4,2,.6,1)")
            .style("max-width", textWidth)
            .style("width", textWidth)
            .html(d => getNodeContent(d, false, theme));

        nodeGroup
            .on("click", function(event, d) {
                // If expanded, collapse, vice versa
                const fo = d3.select(this).select("foreignObject");
                if (parseInt(fo.attr("height")) === 100) {
                    fo.transition()
                        .attr("width", textWidth)
                        .attr("height", 50)
                        .attr("y", -25);
                    fo.select("div")
                        .style("white-space", "nowrap")
                        .style("padding", "3px 5px")
                        .style("font-size", "0.7rem")
                        .style("border-radius", "8px")
                        .html(getNodeContent(d, false, theme));
                } else {
                    fo.transition()
                        .attr("width", textWidth)
                        .attr("height", 100)
                        .attr("y", -45);
                    fo.select("div")
                        .style("white-space", "normal")
                        .style("padding", "3px 5px")
                        .style("font-size", "0.7rem")
                        .style("border-radius", "8px")
                        .html(getNodeContent(d, true, theme));
                }
            });

    }, [nodes, theme]);

    const handleExportHistory = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userOperations, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "timeline_history.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    return (
        <Box sx={{ maxHeight: '400px' }}>
            <SectionHeader>Timeline</SectionHeader>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ExportHistoryButton onClick={handleExportHistory} />
            </Box>
            <Box sx={{ 
                maxHeight: '380px', 
                overflowY: 'auto', 
                scrollbarWidth: 'thin',
                '&::-webkit-scrollbar': { 
                    width: '8px'
                },
                '&::-webkit-scrollbar-track': {
                    background: theme.palette.background.paper,
                },
                '&::-webkit-scrollbar-thumb': {
                    backgroundColor: theme.palette.divider,
                    borderRadius: '4px',
                }
            }}>
                <svg ref={svgRef}></svg>
            </Box>
        </Box>
    );
};

export default Timeline;