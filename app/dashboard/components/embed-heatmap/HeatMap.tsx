import React, { useState, useMemo, useCallback, useContext } from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { ClusteringOptions } from "./tree/types";
import { HeatMapConfig } from "./types";
import { useResizedSVGRef } from "../hooks/resize-hooks";
import { useHeatmapScales } from "./hooks/useHeatmapScales";
import { useTooltip } from "./hooks/useTooltip";
import { useOntologyLayout } from "./tree/useOntologyLayout";
import { useLabelManagement } from "./tree/useLabelManagement";
import { Legend } from "./axis/Legend";
import { YAxis } from "./axis/YAxis";
import { BaseExpandedCell } from "./expanded-cells/BaseExpandedCell";
import { RectCell } from "./cells/RectCell";
import HighlightGlobalContext from "@/app/lib/highlight/highlight-context";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import HierarchicalColumnViz from "./axis/space-filling/HierarchyColumnViz";

interface HeatMapProps {
  data: AggregatedCandidate[];
  sourceColumn: string;
  sourceColumns: SourceColumn[];
  setSourceColumn: (sourceColumn: string) => void;
  sourceCluster?: string[];
  targetOntologies?: TargetOntology[];
  selectedCandidate?: Candidate;
  setSelectedCandidate?: (candidate: Candidate | undefined) => void;
  sourceUniqueValues: SourceUniqueValues[];
  targetUniqueValues: TargetUniqueValues[];
  highlightSourceColumns: Array<string>;
  highlightTargetColumns: Array<string>;
  sx?: Record<string, any>;
}

const MARGIN = { top: 30, right: 78, bottom: 0, left: 200 };

const HeatMap: React.FC<HeatMapProps> = ({
  data,
  sourceCluster,
  sourceColumns,
  setSourceColumn,
  sourceColumn,
  targetOntologies,
  selectedCandidate,
  setSelectedCandidate,
  sourceUniqueValues,
  targetUniqueValues,
  highlightSourceColumns,
  highlightTargetColumns,
  sx,
}) => {
  const theme = useTheme();

  const { globalCandidateHighlight, setGlobalCandidateHighlight, globalQuery } = useContext(HighlightGlobalContext);
  const { hoverMode } = useContext(SettingsGlobalContext);

  const [config] = useState<HeatMapConfig>({
    cellType: "rect",
    colorScheme: "YlGnBu",
    colorScalePadding: 10,
    maxScore: 1,
    minScore: 0,
  });

  // Memoize candidates to prevent unnecessary re-renders
  const candidates = useMemo(() => data, [data]);

  // Determine which candidate is currently expanding
  const currentExpanding = useMemo(() => {
    if (selectedCandidate) return selectedCandidate;
    return hoverMode ? globalCandidateHighlight : undefined;
  }, [globalCandidateHighlight, selectedCandidate, hoverMode]);

  const { svgHeight, svgWidth, ref: svgRef } = useResizedSVGRef();

  const dimensions = useMemo(() => ({
    width: svgWidth,
    height: svgHeight,
  }), [svgWidth, svgHeight]);

  // Get scales for the heatmap
  const { x, y, color, getWidth, getHeight } = useHeatmapScales({
    data: candidates,
    sourceCluster,
    width: dimensions.width,
    height: dimensions.height,
    margin: MARGIN,
    config,
    selectedCandidate: currentExpanding,
  });

  const { tooltip, showTooltip, hideTooltip } = useTooltip();

  const clusteringOptions: ClusteringOptions = useMemo(() => ({
    method: "prefix",
    showClusterLabels: true,
    labelSpacing: 40,
    maxLabelsPerView: 30,
    labelPlacementStrategy: "fixed",
  }), []);

  // Setup ontology layout
  const {
    treeData: targetTreeData,
    expandedNodes: targetExpandedNodes,
    toggleNode: toggleTargetNode,
  } = useOntologyLayout({
    columns: x.domain(),
    targetOntologies: targetOntologies ?? [],
    width: dimensions.width,
    height: dimensions.height,
    margin: MARGIN,
    scale: x,
    getWidth,
    currentExpanding: currentExpanding as AggregatedCandidate,
    useHorizontalPadding: false,
  });

  // Handle cell click
  const handleCellClick = useCallback(
    (cellData: Candidate) => {
      if (!setSelectedCandidate) return;
      
      toggleTargetNode(cellData.targetColumn);
      
      if (
        selectedCandidate &&
        selectedCandidate.sourceColumn === cellData.sourceColumn &&
        selectedCandidate.targetColumn === cellData.targetColumn
      ) {
        setSelectedCandidate(undefined);
      } else {
        setSelectedCandidate(cellData);
      }
    },
    [setSelectedCandidate, selectedCandidate, toggleTargetNode]
  );

  // Memoize background rectangles for highlighted rows
  const backgroundRects = useMemo(() => {
    return y.domain().map((value) => {
      const status = sourceColumns.find(col => col.name === value)?.status;
      const isLastRow = value === sourceColumn;
      return (
        <rect
          key={`row-${value}`}
          x={0}
          y={(y(value) ?? 0) + 3}
          width={dimensions.width - MARGIN.left - MARGIN.right + 8}
          height={getHeight({ sourceColumn: value } as Candidate) - 6}
          fill={status === "complete" ? "#bbdcae" : theme.palette.grey[300]}
          opacity={0.3}
          stroke={theme.palette.grey[600]}
          strokeWidth={isLastRow ? 2 : 0}
          onMouseMove={() => {
            hideTooltip();
            setGlobalCandidateHighlight(undefined);
          }}
        />
      );
    });
  }, [y, sourceColumns, sourceColumn, dimensions.width, getHeight, hideTooltip, setGlobalCandidateHighlight, theme.palette.grey]);

  // Memoize cell rendering
  const cellElements = useMemo(() => {
    return candidates.map((d: AggregatedCandidate) => {
      const sourceUniqueValue = sourceUniqueValues?.find(
        (s) => s.sourceColumn === d.sourceColumn
      ) || { sourceColumn: "", uniqueValues: [] };
      
      const targetUniqueValue = targetUniqueValues?.find(
        (t) => t.targetColumn === d.targetColumn
      ) || { targetColumn: "", uniqueValues: [] };
      
      const isExpanded = currentExpanding &&
        currentExpanding.sourceColumn === d.sourceColumn &&
        currentExpanding.targetColumn === d.targetColumn;
      
      if (isExpanded) {
        return (
          <BaseExpandedCell
            type={"histogram"}
            key={`${d.sourceColumn}-${d.targetColumn}`}
            data={d}
            sourceUniqueValues={sourceUniqueValue}
            targetUniqueValues={targetUniqueValue}
            onClose={() => handleCellClick(d)}
            width={getWidth(d)}
            height={getHeight(d)}
            x={x(d.targetColumn) ?? 0}
            y={y(d.sourceColumn) ?? 0}
            onClick={() => handleCellClick(d)}
            onMouseMove={(event: React.MouseEvent) => showTooltip(event, d)}
            onMouseLeave={hideTooltip}
          />
        );
      }
      
      const isHighlighted = 
        highlightSourceColumns.length !== 0 &&
        highlightTargetColumns.length !== 0
          ? highlightSourceColumns.includes(d.sourceColumn.toLowerCase()) &&
            highlightTargetColumns.includes(d.targetColumn.toLowerCase())
          : globalQuery
            ? d.targetColumn.toLowerCase().includes(globalQuery.toLowerCase())
            : undefined;
      
      return (
        <RectCell
          key={`${d.sourceColumn}-${d.targetColumn}`}
          data={d}
          config={config}
          x={x(d.targetColumn) ?? 0}
          y={y(d.sourceColumn) ?? 0}
          width={getWidth(d)}
          height={getHeight(d)}
          color={color}
          onHover={(event: React.MouseEvent, data: AggregatedCandidate) => {
            if (!selectedCandidate) {
              setGlobalCandidateHighlight(data);
            }
          }}
          onMouseMove={(event: React.MouseEvent) => showTooltip(event, d)}
          onLeave={hideTooltip}
          onClick={() => handleCellClick(d)}
          isHighlighted={isHighlighted}
        />
      );
    });
  }, [
    candidates, 
    currentExpanding, 
    sourceUniqueValues, 
    targetUniqueValues, 
    getWidth, 
    getHeight, 
    x, 
    y, 
    handleCellClick, 
    showTooltip, 
    hideTooltip, 
    highlightSourceColumns, 
    highlightTargetColumns, 
    globalQuery, 
    config, 
    color, 
    selectedCandidate, 
    setGlobalCandidateHighlight
  ]);

  // Memoize tooltip element
  const tooltipElement = useMemo(() => {
    if (!tooltip.visible) return null;
    
    return (
      <div
        style={{
          position: "absolute",
          left: tooltip.x + 10,
          top: tooltip.y - 10,
          background: "white",
          padding: "8px",
          border: "1px solid black",
          borderRadius: "4px",
          pointerEvents: "none",
          zIndex: 1000,
        }}
        dangerouslySetInnerHTML={{ __html: tooltip.content }}
      />
    );
  }, [tooltip.visible, tooltip.x, tooltip.y, tooltip.content]);

  return (
    <>
      <Box
        sx={{
          ...sx,
          paddingLeft: 0,
          height: "100%",
          width: "100%",
        }}
      >
        <svg
          ref={svgRef}
          width={"100%"}
          height={"100%"}
          style={{ overflow: "visible" }}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {/* Background rectangles for highlighted rows */}
            {backgroundRects}
            
            {/* Cell elements */}
            {cellElements}
            
            {/* Color Legend */}
            <Legend color={color} />
            
            {/* Y Axis */}
            <YAxis
              y={y}
              getHeight={getHeight}
              sourceColumn={sourceColumn}
              setSourceColumn={setSourceColumn}
              sourceColumns={sourceColumns}
              hideTooltip={hideTooltip}
            />
          </g>
        </svg>

        {/* Tooltip */}
        {tooltipElement}
      </Box>

      <Box sx={{ flexGrow: 1, paddingLeft: 0, flexBasis: "280px" }}>
        <HierarchicalColumnViz
          targetTreeData={targetTreeData}
          currentExpanding={currentExpanding as AggregatedCandidate}
          transform={`translate(${MARGIN.left},${0})`}
          hideTooltip={hideTooltip}
        />
      </Box>
    </>
  );
};

export default React.memo(HeatMap);