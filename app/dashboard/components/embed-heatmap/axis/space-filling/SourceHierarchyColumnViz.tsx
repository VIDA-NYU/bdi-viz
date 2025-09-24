import React, { useRef, useMemo, useCallback, useContext } from 'react';
import * as d3 from 'd3';
import { useTheme } from '@mui/material';
import { getHierarchyData } from './HierarchyUtils';
import { getOptimalCategoryColorScale } from './ColorUtils';
import { TreeNode } from '../../tree/types';
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';
import { renderEdgeBundlingHorizontal } from './EdgeBundling';
import { renderSpaceFillingSegmentsVertical } from './SpaceFillingSegments';
import { renderColumnsVertical } from './ColumnRenderer';

interface SourceHierarchyColumnVizProps {
  sourceTreeData: TreeNode[];
  currentExpanding?: any;
  transform: string;
  hideTooltip: () => void;
  setSourceColumn: (column: string) => void;
  sourceMeta?: DatasetMeta;
}

const MARGIN = { top: 40, right: 20, bottom: 20, left: 70 };

const SourceHierarchyColumnViz: React.FC<SourceHierarchyColumnVizProps> = ({
  sourceTreeData,
  currentExpanding,
  transform,
  hideTooltip,
  setSourceColumn,
  sourceMeta,
}) => {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const { globalQuery, selectedSourceNodes, setSelectedSourceNodes } = useContext(HighlightGlobalContext);

  // Layout config for vertical orientation
  const layoutConfig = {
    innerWidth: 200,
    innerHeight: 600,
    columnHeight: 50,
    columnWidth: 100,
    columnSpacing: 30,
    hierarchyWidth: 20,
    hierarchySpacing: 20,
    segmentSpacing: 2,
    hierarchyHeight: 100,
    theme,
    globalQuery: "",
    paddingTop: 10,
  };

  // Process tree data
  const { columnData, categoryData, superCategoryData } = getHierarchyData(sourceTreeData, layoutConfig);

  const columnsX = 100;
  const categoryX = 70;
  const superCategoryX = 45;

  const spaceFillingHeight = useMemo(() => columnData.reduce(
    (acc, column) => Math.max(acc, column.y! + column.height!),
    0 // Initial value
  ), [columnData]);

  // Color scale
  const categoryColorScale = getOptimalCategoryColorScale(categoryData.map(c => c.id));

  // Render function
  const renderVisualization = useCallback(() => {
    if (!sourceTreeData || sourceTreeData.length === 0 || !svgRef.current || !gRef.current) return;

    const g = d3.select(gRef.current);
    g.selectAll('*').remove();

    // // Render the segments and connections
    renderSpaceFillingSegmentsVertical(
      g, 
      columnData,
      superCategoryData, 
      categoryData,
      {
        ...layoutConfig,
        innerHeight: spaceFillingHeight
      },
      superCategoryX,
      categoryX,
      categoryColorScale,
      selectedSourceNodes,
      setSelectedSourceNodes
    );

    renderEdgeBundlingHorizontal(
      g, 
      columnData, 
      categoryData, 
      {
        ...layoutConfig,
        innerHeight: spaceFillingHeight
      }, 
      columnsX, 
      categoryX, 
      categoryColorScale
    );

    renderColumnsVertical(
      g, 
      columnData, 
      layoutConfig, 
      columnsX, 
      currentExpanding,
      categoryColorScale,
      setSourceColumn,
      globalQuery,
    );

    // Add title
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .attr('x', -layoutConfig.innerHeight / 2 + 120)
      .attr('y', layoutConfig.innerWidth / 2 - 70)
      .attr('font-size', '1rem')
      .attr('font-weight', '300')
      .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
      .text(sourceMeta?.name ? `${sourceMeta.name} (Source)` : 'Database Schema Hierarchy');
  }, [sourceTreeData, layoutConfig, columnData, superCategoryData, categoryData, categoryColorScale, selectedSourceNodes, setSelectedSourceNodes, globalQuery, currentExpanding]);

  // Use ref callback to get access to the g element and render when it's available
  const setGRef = useCallback((node: SVGGElement | null) => {
    gRef.current = node;
    if (node) {
      renderVisualization();
    }
  }, [renderVisualization]);

  return (
    <div onMouseMove={hideTooltip}>
      <svg
        width={layoutConfig.innerWidth + 5}
        height={layoutConfig.innerHeight - 210}
        ref={svgRef}
      >
        <g
          ref={setGRef}
          transform={transform}
        />
      </svg>
    </div>
  );
};


export default SourceHierarchyColumnViz;
