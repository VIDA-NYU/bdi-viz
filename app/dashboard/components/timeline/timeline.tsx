"use client";

import * as d3 from 'd3';
import { useEffect, useRef } from "react";
import { useTimeline } from "./useTimeline";
import { Box, useTheme } from '@mui/material';
import { SectionHeader } from '../../layout/components';
import { TimelineNode } from './types';

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

const getNodeContent = (d: TimelineNode, isExpanded: boolean, theme: any): string => {
    const { operation, candidate, references } = d;
    const opColor =
        operation === 'accept' ? theme.palette.success.main :
        operation === 'reject' ? theme.palette.error.main :
        operation === 'discard' ? theme.palette.warning.main :
        operation === 'append' ? theme.palette.info.main :
        operation === 'prune' ? theme.palette.secondary.main :
        theme.palette.text.primary;
    const truncate = (str: string, n: number) => (str.length > n ? str.slice(0, n-1) + '…' : str);
    let title = '';
    let details = '';
    if (operation === 'append' || operation === 'prune') {
        const count = references.length;
        const source = truncate(candidate?.sourceColumn || '', isExpanded ? 30 : 10);
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
        const source = truncate(candidate.sourceColumn, isExpanded ? 30 : 10);
        const target = truncate(candidate.targetColumn, isExpanded ? 30 : 10);
        const sourceChip = `<span style="${chipStyle(theme.palette.primary.main, theme.palette.primary.contrastText, theme)}">${source}</span>`;
        const targetChip = `<span style="${chipStyle(theme.palette.secondary.main, theme.palette.primary.contrastText, theme)}">${target}</span>`;
        title = `<span style='font-weight:600;font-size:0.7rem;'>${operation}:</span> ${sourceChip} <span style="font-size:1.1em;vertical-align:middle;">→</span> ${targetChip}`;

        if (isExpanded) {
            details = `
                <div class="timeline-details" style="
                    color:${theme.palette.text.secondary};
                    font-size:0.6rem;
                    line-height:1.2;
                ">
                    <span style='font-weight:500;'>Score:</span> ${candidate.score?.toFixed(2)}${isExpanded ? `<br/><span style='font-weight:500;'>Matcher:</span> ${candidate.matcher}` : ''}
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
            ${details ? `<div style='margin-top:2px;width:100%;height:32px;overflow-y:auto;'>${details}</div>` : ''}
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
        const startNodeY = 50;
        const nodeDistance = 60;
        const height = (nodes.length + 1) * nodeDistance + startNodeY; // Adjust height for the start node

        svg.attr("width", width).attr("height", height);

        svg
            .selectAll(".link")
            .data(nodes)
            .enter()
            .append("line")
            .attr("class", "link")
            .attr("x1", 50)
            .attr("y1", (d, i) => i * nodeDistance + startNodeY)
            .attr("x2", 50)
            .attr("y2", (d, i) => (i + 1) * nodeDistance + startNodeY)
            .attr("stroke", theme.palette.divider)
            .attr("stroke-width", 2);
        
        const startNodeGroup = svg
            .append("g")
            .attr("class", "start-node")
            .attr("transform", `translate(50, ${startNodeY})`);

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
            .attr("transform", (d, i) => `translate(50, ${(i + 1) * nodeDistance + startNodeY})`);

        nodeGroup
            .append("circle")
            .attr("r", 12)
            .attr("fill", 
                d => d.operation === 'accept' ? theme.palette.success.main : 
                d.operation === 'reject' ? theme.palette.error.main : 
                d.operation === 'discard' ? theme.palette.warning.main : 
                d.operation === 'append' ? theme.palette.info.main : 
                d.operation === 'prune' ? theme.palette.secondary.main : 
                theme.palette.grey[500]);

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
            .attr("x", 20)
            .attr("y", -25)
            .attr("width", 220)
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
            .style("max-width", "220px")
            .style("width", "220px")
            .html(d => getNodeContent(d, false, theme));

        nodeGroup
            .on("click", function(event, d) {
                // If expanded, collapse, vice versa
                const fo = d3.select(this).select("foreignObject");
                if (parseInt(fo.attr("height")) === 60) {
                    fo.transition()
                        .attr("width", 220)
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
                        .attr("width", 220)
                        .attr("height", 60)
                        .attr("y", -30);
                    fo.select("div")
                        .style("white-space", "normal")
                        .style("padding", "3px 5px")
                        .style("font-size", "0.7rem")
                        .style("border-radius", "8px")
                        .html(getNodeContent(d, true, theme));
                }
            });

    }, [nodes, theme]);

    return (
        <Box sx={{ maxHeight: '400px' }}>
            <SectionHeader>Timeline</SectionHeader>
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