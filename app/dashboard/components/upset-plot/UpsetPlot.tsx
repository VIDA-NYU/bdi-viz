import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import { Box, useTheme } from "@mui/material";
import React, { useRef, useEffect, useMemo, useState, useContext } from "react";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import { useHeatmapScales } from "../embed-heatmap/hooks/useHeatmapScales";
import { useResizedSVGRef } from "../hooks/resize-hooks";
import { HeatMapConfig } from "../embed-heatmap/types";
import HighlightGlobalContext from "@/app/lib/highlight/highlight-context";


interface GroupedData {
    targetColumn: string;
    sourceColumn: string;
    matchers: (string | undefined)[];
    score: number;
    id: number;
    status: string;
    isSelected: boolean;
}

interface DataPerMatcher {
    id: number;
    targetColumn: string;
    matchers: string;
    score: number;
    isSelected: boolean;
    status: string;
}

interface UpsetPlotProps {
    aggData: AggregatedCandidate[];
    matchers: Matcher[];
    selectedCandidate?: Candidate;
    setSelectedCandidate: (sourceColumn: string, targetColumn: string) => void;
}

const upperChartHeight = 150;
const lowerSetChartHeight = 220;
const upperMarginLeft = 30;
const lowerMarginBottom = 80;
const lowerBarChartWidth = 200;

const UpsetPlot: React.FC<UpsetPlotProps> = ({ aggData, matchers, selectedCandidate, setSelectedCandidate }) => {
    const upperColumnChartRef = useRef<HTMLDivElement>(null);
    const lowerBarChartRef = useRef<HTMLDivElement>(null);
    const lowerSetChartRef = useRef<HTMLDivElement>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const [fullWidth, setFullWidth] = useState(containerRef.current ? containerRef.current.clientWidth : 0);
    
    const theme = useTheme();
    const { svgHeight, svgWidth, ref: svgRef } = useResizedSVGRef();
    const dimensions = {
        width: svgWidth,
        height: svgHeight,
    };

    const { globalCandidateHighlight } = useContext(HighlightGlobalContext);
    const currentExpanding = useMemo(() => {
        let candidate = selectedCandidate;
        if (selectedCandidate?.targetColumn === "") {
            if (globalCandidateHighlight) {
                candidate = globalCandidateHighlight as Candidate;
            }
        }
        return candidate;
    }, [selectedCandidate, globalCandidateHighlight]);
    const { x, y, color, getWidth, getHeight, dataRange } = useHeatmapScales({
        data: aggData,
        width: dimensions.width,
        height: dimensions.height,
        margin: { top: 30, right: 78, bottom: 0, left: 200 },
        config: {
            colorScheme: "YlGnBu",
            colorScalePadding: 10,
            maxScore: 1,
            minScore: 0,
        } as HeatMapConfig,
        selectedCandidate: currentExpanding,
    });

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current) {
                setFullWidth(containerRef.current.clientWidth);
            }
        };
            handleResize();
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
    }, []);

    const filteredMatchers = useMemo(() => matchers.filter(m => aggData.flatMap(d => d.matchers).includes(m.name)), [aggData, matchers]);

    const groupedData = useMemo(() => {
        return aggData.map((d) => ({
            ...d,
            isSelected: currentExpanding ? d.sourceColumn === currentExpanding.sourceColumn && d.targetColumn === currentExpanding.targetColumn : false
        })).map((d, idx) => ({ id: idx + 1, ...d }));
    }, [aggData, currentExpanding]);

    const dataPerMatcher = useMemo(() => {
        return groupedData.flatMap(
            (d) => d.matchers.map((matcher) => ({
                id: d.id,
                targetColumn: d.targetColumn,
                matchers: matcher ?? '',
                score: d.score,
                isSelected: d.isSelected,
                status: d.status
            }))
        );
    }, [groupedData]);

    const dataCrossProduct = useMemo(() => crossProduct(dataPerMatcher), [dataPerMatcher]);

    const weightPerMatcher = useMemo(() => {
        return Array.from(d3.group(dataPerMatcher, d => d.matchers), ([matcher, _]) => ({
            name: matcher,
            weight: filteredMatchers.find(m => m.name === matcher)?.weight ?? 1,
        })).sort((a, b) => b.weight - a.weight);
    }, [dataPerMatcher, filteredMatchers]);

    const { developerMode } = useContext(SettingsGlobalContext);

    useEffect(() => {
        if (upperColumnChartRef.current) {
            upperColumnChartRef.current.innerHTML = '';
            upperColumnChartRef.current.appendChild(upperColumnChart(groupedData, fullWidth, color, theme));
        }
        if (lowerBarChartRef.current) {
            lowerBarChartRef.current.innerHTML = '';
            lowerBarChartRef.current.appendChild(lowerBarChart(weightPerMatcher, developerMode));
        }
        if (lowerSetChartRef.current) {
            lowerSetChartRef.current.innerHTML = '';
            lowerSetChartRef.current.appendChild(lowerSetChart({ dataCrossProduct, dataPerMatcher }, fullWidth, theme));
        }
    }, [groupedData, weightPerMatcher, dataCrossProduct, dataPerMatcher, fullWidth, developerMode, theme]);

    return (
        <Box ref={containerRef}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: `${fullWidth}px` }}>
                <div ref={upperColumnChartRef}></div>
                <div style={{ display: 'flex', position: 'relative', top: '-50px', alignItems: 'flex-start' }}>
                    <div ref={lowerBarChartRef}></div>
                    <div ref={lowerSetChartRef}></div>
                </div>
            </div>
        </Box>
    );
};

function crossProduct(data: DataPerMatcher[]) {
    const n = d3.max(data, (d) => d.id) as number;
    const ids = [...Array(n).keys()].map((idx) => idx + 1);
    const categories = [...new Set(data.map((d) => d.matchers))];

    return d3.cross(categories, ids).map((d) => ({ matchers: d[0], id: d[1] }));
}

function upperColumnChart(groupedData: GroupedData[], fullWidth: number, color: d3.ScaleSequential<string>, theme: any) {
    const columnChart = Plot.barY(
        groupedData,
        {
            y: d => d.score,
            x: d => d.id,
            fill: d => d.isSelected
                ? theme.palette.secondary.dark
                : d.status === "rejected"
                    ? theme.palette.error.dark
                    : d.status === "accepted"
                        ? theme.palette.success.dark
                        : color(d.score),
            insetLeft: 0.5,
            insetRight: 0.5,
            marginLeft: 0,
            marginRight: 0,
        }
    );
    return Plot.plot({
        width: fullWidth - lowerBarChartWidth + upperMarginLeft,
        height: upperChartHeight,
        marginLeft: upperMarginLeft,
        style: {
            background: '#ffffff00'
        },
        marginRight: 80,
        grid: true,
        x: {
            axis: null,
            padding: 0,
            round: false
        },
        y: {
            tickPadding: 2,
            line: true
        },
        marks: [
            Plot.ruleY([0], { fill: '#333333' }),
            columnChart,
        ]
    });
}

function lowerBarChart(matchers: Matcher[], developerMode: boolean) {
    const matcherData = Plot.barX(
        matchers,
        {
            x: d => d.weight,
            y: d => d.name.length > 15 ? d.name.substring(0, 12) + '...' : d.name,
            opacity: developerMode ? 1 : 0,
            fill: 'steelblue',
        }
    );

    const maxWeight = Math.max(...matchers.map(m => m.weight));
    const tickStep = maxWeight < 0.5 ? 0.1 : 0.3;
    const ticks = d3.range(0, maxWeight, tickStep);

    return Plot.plot({
        marks: [
            matcherData
        ],
        x: {
            axis: 'top',
            line: developerMode,
            ticks: developerMode ? ticks : [],
            reverse: true,
            tickFormat: (d) => d3.format(".1f")(d),
        },
        y: {
            axis: 'right',
            tickSize: 0,
            tickPadding: 7,
            insetTop: 2,
            round: false,
            padding: 0.1,
            align: 0,
        },

        width: lowerBarChartWidth,
        height: lowerSetChartHeight + lowerMarginBottom,
        marginRight: 90,
        marginBottom: lowerMarginBottom,
        style: {
            background: '#ffffff00'
        }
    });
}

interface LowerSetChartProps {
    dataCrossProduct: { matchers: string, id: number }[];
    // evenMatcherNames: string[];
    dataPerMatcher: DataPerMatcher[];
}

function lowerSetChart({ dataCrossProduct, dataPerMatcher }: LowerSetChartProps, fullWidth: number, theme: any) {
    const backgroundStripeChart = Plot.cell(
        dataCrossProduct,
        {
            x: d => d.id,
            y: d => d.matchers,
            fill: '#efefef',
            stroke: '#efefef',
            strokeWidth: 3,
        }
    );

    const backgroundDotChart = Plot.dot(
        dataCrossProduct,
        {
            x: d => d.id,
            y: d => d.matchers,
            fill: '#dedede',
            r: 3.5,
        }
    );

    const dotChart = Plot.dot(
        dataPerMatcher,
        {
            x: d => d.id,
            y: d => d.matchers,
            fill: d => d.isSelected
                ? theme.palette.secondary.dark
                : d.status === 'rejected'
                    ? theme.palette.error.dark
                    : '#333333',
            r: 3.5,
        }
    );

    const lineChart = Plot.line(
        dataPerMatcher,
        {
            x: d => d.id,
            y: d => d.matchers,
            z: d => d.id,
            strokeWidth: 2,
            stroke: d => d.isSelected
                ? theme.palette.secondary.dark
                : d.status === 'rejected'
                    ? theme.palette.error.dark
                    : '#333333',
        }
    );

    return Plot.plot({
        marks: [
            backgroundStripeChart,
            backgroundDotChart,
            dotChart,
            lineChart
        ],
        x: {
            axis: 'bottom',
            padding: 0,
            round: false,
            insetRight: 1,
            insetLeft: 1,
            tickFormat: (d) => dataPerMatcher.find(item => item.id === d)?.targetColumn ?? d,
            tickRotate: 45, // Rotate the tick labels to be vertical
            labelAnchor: 'left', // Align the labels to the end
        },
        y: {
            axis: null,
            tickSize: 0
        },
        width: fullWidth - lowerBarChartWidth,
        height: lowerSetChartHeight + lowerMarginBottom,
        marginTop: 28,
        marginLeft: 0,
        marginRight: 80,
        marginBottom: lowerMarginBottom,
        style: {
            background: '#ffffff00'
        },
    });
}

export default UpsetPlot;
