import React, { useState, useMemo, useCallback, useContext } from "react";
import { Box, Tooltip, IconButton, Chip } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import { useTheme } from "@mui/material/styles";

import { ClusteringOptions } from "./tree/types";
import { HeatMapConfig } from "./types";
import { useResizedSVGRef } from "../hooks/resize-hooks";
import { useHeatmapScales } from "./hooks/useHeatmapScales";
import { useTooltip } from "./hooks/useTooltip";
import { useOntologyLayout } from "./tree/useOntologyLayout";
import { Legend } from "./axis/Legend";
import { YAxis } from "./axis/YAxis";
import { BaseExpandedCell } from "./expanded-cells/BaseExpandedCell";
import { RectCell } from "./cells/RectCell";
import HighlightGlobalContext from "@/app/lib/highlight/highlight-context";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import HierarchicalColumnViz from "./axis/space-filling/HierarchyColumnViz";
import SourceHierarchyColumnViz from "./axis/space-filling/SourceHierarchyColumnViz";

interface HeatMapProps {
  data: AggregatedCandidate[];
  sourceColumn: string;
  sourceColumns: SourceColumn[];
  setSourceColumn: (sourceColumn: string) => void;
  targetOntologies?: Ontology[];
  sourceOntologies?: Ontology[];
  selectedCandidate?: Candidate;
  setSelectedCandidate?: (candidate: Candidate | undefined) => void;
  sourceUniqueValues: SourceUniqueValues[];
  targetUniqueValues: TargetUniqueValues[];
  highlightSourceColumns: Array<string>;
  highlightTargetColumns: Array<string>;
  sx?: Record<string, any>;
  metaData?: { sourceMeta: DatasetMeta, targetMeta: DatasetMeta };
}

const MARGIN = { top: 30, right: 78, bottom: 0, left: 220 };

const HeatMap: React.FC<HeatMapProps> = ({
  data,
  sourceColumns,
  setSourceColumn,
  sourceColumn,
  targetOntologies,
  sourceOntologies,
  selectedCandidate,
  setSelectedCandidate,
  sourceUniqueValues,
  targetUniqueValues,
  highlightSourceColumns,
  highlightTargetColumns,
  sx,
  metaData,
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
    targetTreeData,
    sourceTreeData,
    expandedNodes: targetExpandedNodes,
    toggleNode: toggleTargetNode,
  } = useOntologyLayout({
    targetColumns: x.domain(),
    sourceColumns: y.domain(),
    targetOntologies: targetOntologies ?? [],
    sourceOntologies: sourceOntologies ?? [],
    width: dimensions.width,
    height: dimensions.height,
    margin: MARGIN,
    x: x,
    y: y,
    getWidth,
    getHeight,
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

  // Memoize tooltip element (MUI-styled for consistency)
  const tooltipElement = useMemo(() => {
    if (!tooltip.visible) return null;

    return (
      <Box
        sx={{ position: "absolute", left: tooltip.x, top: tooltip.y, pointerEvents: "none", zIndex: 1000 }}
      >
        <Tooltip
          open
          arrow
          placement="top"
          describeChild
          title={
            <Box
              sx={{
                fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
                fontSize: 12,
              }}
              dangerouslySetInnerHTML={{ __html: tooltip.content }}
            />
          }
        >
          <Box sx={{ width: 0, height: 0 }} />
        </Tooltip>
      </Box>
    );
  }, [tooltip.visible, tooltip.x, tooltip.y, tooltip.content, theme.palette.grey, theme.palette.common.white]);

  // Determine whether source ontology exists from props
  const hasSourceOntology = useMemo(() => {
    return Array.isArray(sourceOntologies) && sourceOntologies.length > 0;
  }, [sourceOntologies]);

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
            <Legend color={color} offsetX={dimensions.width - MARGIN.left - MARGIN.right + 28} />
            
            {/* Y Axis shown when no source ontology is available */}
            {!hasSourceOntology && (
              <YAxis
                y={y}
                getHeight={getHeight}
                sourceColumn={sourceColumn}
                setSourceColumn={setSourceColumn}
                sourceColumns={sourceColumns}
                hideTooltip={hideTooltip}
                sourceTreeData={sourceTreeData}
              />
            )}
          </g>
        </svg>

        {/* Task info (merged) - positioned near the legend area */}
        <Box sx={{ position: "absolute", top: 660, left: 335, display: "flex", gap: 1, alignItems: "center", zIndex: 1000 }}>
          <Tooltip arrow placement="top" describeChild
            title={
              <Box sx={{ p: 0.5 }}>
                <Box sx={{ mb: 1 }}>
                  <Chip size="small" label="Source" sx={{ mb: 0.5 }} />
                  <div><strong>Name:</strong> {metaData?.sourceMeta.name ?? "source.csv"}</div>
                  {metaData?.sourceMeta.size && <div><strong>Size:</strong> {metaData.sourceMeta.size}</div>}
                  {metaData?.sourceMeta.timestamp && <div><strong>Uploaded:</strong> {new Date(metaData.sourceMeta.timestamp).toLocaleString()}</div>}
                </Box>
                <Box>
                  <Chip size="small" label="Target" sx={{ mb: 0.5 }} />
                  <div><strong>Name:</strong> {metaData?.targetMeta.name ?? "GDC (default)"}</div>
                  {metaData?.targetMeta.size && <div><strong>Size:</strong> {metaData.targetMeta.size}</div>}
                  {metaData?.targetMeta.timestamp && <div><strong>Uploaded:</strong> {new Date(metaData.targetMeta.timestamp).toLocaleString()}</div>}
                </Box>
              </Box>
            }
          >
            <IconButton size="small" aria-label="Task info" sx={{ bgcolor: theme.palette.grey[100], border: `1px solid ${theme.palette.divider}` }}>
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Chip size="small" label="Task info" variant="outlined" />
        </Box>

        {/* Tooltip */}
        {tooltipElement}
      </Box>

      {hasSourceOntology && (
        <Box sx={{ position: "absolute", top: 160, left: MARGIN.left + 120, zIndex: 999 }}>
          <SourceHierarchyColumnViz
            sourceTreeData={sourceTreeData}
            currentExpanding={currentExpanding as AggregatedCandidate}
            transform={`translate(${0},${0})`}
            hideTooltip={hideTooltip}
            setSourceColumn={setSourceColumn}
            sourceMeta={metaData?.sourceMeta}
          />
        </Box>
      )}

      <Box sx={{ flexGrow: 1, paddingLeft: 0, flexBasis: "280px", zIndex: 1000 }}>
        <HierarchicalColumnViz
          targetTreeData={targetTreeData}
          currentExpanding={currentExpanding as AggregatedCandidate}
          transform={`translate(${MARGIN.left},${0})`}
          hideTooltip={hideTooltip}
          targetMeta={metaData?.targetMeta}
        />
      </Box>
    </>
  );
};

export default React.memo(HeatMap);