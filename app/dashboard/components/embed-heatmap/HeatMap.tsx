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
// import { HierarchicalAxis } from "./axis/HierarchicalAxis";
// import IndentedTreeAxis from "./axis/IndentedTreeAxis";
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


  const [config, setConfig] = useState<HeatMapConfig>({
    cellType: "rect",
    colorScheme: "YlGnBu",
    colorScalePadding: 10,
    maxScore: 1,
    minScore: 0,
  });

  const candidates = useMemo(() => {
    return data;
  }, [data]);

  const currentExpanding = useMemo(() => {
    if (!hoverMode) {
      return selectedCandidate;
    }
    if (selectedCandidate) {
      return selectedCandidate;
    }
    return globalCandidateHighlight;
  }, [globalCandidateHighlight, selectedCandidate]);

  const { svgHeight, svgWidth, ref: svgRef } = useResizedSVGRef();

  const dimensions = {
    width: svgWidth,
    height: svgHeight,
  };
  const { x, y, color, getWidth, getHeight, dataRange } = useHeatmapScales({
    data: candidates,
    sourceCluster: sourceCluster,
    width: dimensions.width,
    height: dimensions.height,
    margin: MARGIN,
    config,
    selectedCandidate: currentExpanding,
  });

  const { tooltip, showTooltip, hideTooltip } = useTooltip();

  const defaultClusteringOptions: ClusteringOptions = {
    method: "prefix",
    showClusterLabels: true,
    labelSpacing: 40,
    maxLabelsPerView: 30,
    labelPlacementStrategy: "fixed",
  };
  const clusteringOptions = defaultClusteringOptions;
  const {
    treeData: targetTreeData,
    expandedNodes: targetExpandedNodes,
    toggleNode: toggleTargetNode,
    getVisibleColumns: getVisibleTargetColumns,
  } = useOntologyLayout({
    columns: x.domain(),
    targetOntologies: targetOntologies ?? [],
    width: dimensions.width,
    height: dimensions.height,
    margin: MARGIN,
    scale: x,
    getWidth: getWidth,
    currentExpanding: currentExpanding as AggregatedCandidate,
    useHorizontalPadding: false,
  });
  const targetLabelPlacements = useLabelManagement({
    nodes: targetTreeData,
    scale: x,
    orientation: "horizontal",
    viewportWidth: dimensions.width - MARGIN.left - MARGIN.right,
    options: clusteringOptions,
    expandedNodes: targetExpandedNodes,
  });

  const handleCellClick = useCallback(
    (cellData: Candidate) => {
      if (setSelectedCandidate) {
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
      }
    },
    [setSelectedCandidate, selectedCandidate]
  );

  // const legendData = d3.range(legendHeight).map((d) => d / legendHeight);

  const CellComponent = config.cellType === "rect" ? RectCell : RectCell;

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
            {y.domain().map((value) => {
              const status = sourceColumns.find(
                (col) => col.name === value
              )?.status;
              const isLastRow = value === sourceColumn;
              return (
              <rect
                key={`row-${value}`}
                x={0}
                y={(y(value) ?? 0) + 3}
                width={dimensions.width - MARGIN.left - MARGIN.right + 8}
                height={getHeight({ sourceColumn: value } as Candidate) - 6}
                fill={
                  status === "complete" ? "#bbdcae" : theme.palette.grey[300]
                }
                opacity={0.3}
                stroke={theme.palette.grey[600]}
                strokeWidth={isLastRow ? 2 : 0}
                onMouseMove={() => {
                  hideTooltip();
                  setGlobalCandidateHighlight(undefined);
                }}
              />
              );
            })}
            
            {candidates.map((d: AggregatedCandidate, i: number) => {
              let sourceUniqueValue;
              let targetUniqueValue;
              if (
                sourceUniqueValues !== undefined &&
                targetUniqueValues !== undefined
              ) {
                sourceUniqueValue = sourceUniqueValues.find(
                  (s) => s.sourceColumn === d.sourceColumn
                );
                targetUniqueValue = targetUniqueValues.find(
                  (t) => t.targetColumn === d.targetColumn
                );
              }
              if (
                currentExpanding &&
                currentExpanding.sourceColumn === d.sourceColumn &&
                currentExpanding.targetColumn === d.targetColumn
              ) {
                return (
                  <BaseExpandedCell
                    type={"histogram"}
                    key={`${d.sourceColumn}-${d.targetColumn}`}
                    data={d}
                    sourceUniqueValues={
                      sourceUniqueValue ?? {
                      sourceColumn: "",
                      uniqueValues: [],
                      }
                    }
                    targetUniqueValues={
                      targetUniqueValue ?? {
                      targetColumn: "",
                      uniqueValues: [],
                      }
                    }
                    onClose={() => {
                      handleCellClick(d);
                    }}
                    width={getWidth(d)}
                    height={getHeight(d)}
                    x={x(d.targetColumn) ?? 0}
                    y={y(d.sourceColumn) ?? 0}
                    onClick={() => {
                      handleCellClick(d);
                    }}
                    onMouseMove={(event: React.MouseEvent) => {
                      showTooltip(event, d);
                    }}
                    onMouseLeave={() => {
                      hideTooltip();
                    }}
                  />
                );
              } else {
                return (
                  <CellComponent
                  key={`${d.sourceColumn}-${d.targetColumn}`}
                  data={d}
                  config={config}
                  x={x(d.targetColumn) ?? 0}
                  y={y(d.sourceColumn) ?? 0}
                  width={getWidth(d)}
                  height={getHeight(d)}
                  color={color}
                  onHover={(
                    event: React.MouseEvent,
                    data: AggregatedCandidate
                  ) => {
                    if (!selectedCandidate) {
                    // toggleTargetNode(data.targetColumn);
                      setGlobalCandidateHighlight(data);
                    }
                  }}
                  onMouseMove={(event: React.MouseEvent) => {
                    showTooltip(event, d);
                  }}
                  onLeave={() => {
                    hideTooltip();
                  }}
                  onClick={() => {
                    handleCellClick(d);
                  }}
                  isHighlighted={
                    highlightSourceColumns.length !== 0 &&
                    highlightTargetColumns.length !== 0
                    ? highlightSourceColumns.includes(d.sourceColumn.toLowerCase()) &&
                      highlightTargetColumns.includes(d.targetColumn.toLowerCase())
                    : globalQuery
                    ? d.targetColumn.includes(globalQuery.toLowerCase())
                    : undefined
                  }
                  />
                );
              }
            })}
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
        {tooltip.visible && (
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
        )}
      </Box>

      <Box sx={{ flexGrow: 1, paddingLeft: 0, flexBasis: "280px" }}>
        {/* Hierarchical Axis */}
        {/* <HierarchicalAxis
          targetTreeData={targetTreeData}
          targetLabelPlacements={targetLabelPlacements}
          targetExpandedNodes={targetExpandedNodes}
          toggleTargetNode={toggleTargetNode}
        /> */}
        <HierarchicalColumnViz
          targetTreeData={targetTreeData} currentExpanding={currentExpanding as AggregatedCandidate}
          transform={`translate(${MARGIN.left},${0})`}
          hideTooltip={hideTooltip}
        />
        {/* <IndentedTreeAxis targetTreeData={targetTreeData} currentExpanding={currentExpanding as AggregatedCandidate} /> */}
      </Box>
    </>
  );
};

export default HeatMap;