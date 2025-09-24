import React, { useContext, useCallback, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useTheme } from '@mui/material';
import { useResizedSVGRef } from '../../../hooks/resize-hooks.tsx';
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';
import { renderSpaceFillingSegmentsHorizontal } from './SpaceFillingSegments';
import { renderEdgeBundlingVertical } from './EdgeBundling';
import { renderColumnsHorizontal } from './ColumnRenderer.tsx';
import { getHierarchyData } from './HierarchyUtils';
import { TreeNode } from '../../tree/types';
import { getOptimalCategoryColorScale } from './ColorUtils.ts';

interface HierarchicalColumnVizProps {
  targetTreeData: TreeNode[];
  currentExpanding?: any; // Using any to match your existing code
  transform: string;
  hideTooltip: () => void;
  targetMeta?: DatasetMeta;
}

const MARGIN = { top: 40, right: 70, bottom: 20, left: 70 };

const HierarchicalColumnViz: React.FC<HierarchicalColumnVizProps> = ({ 
  targetTreeData, 
  currentExpanding,
  transform,
  hideTooltip,
  targetMeta,
}) => {
  const theme = useTheme();
  const { globalQuery, selectedTargetNodes, setSelectedTargetNodes } = useContext(HighlightGlobalContext);
  const { svgHeight, svgWidth, ref: svgRef } = useResizedSVGRef();
  const gRef = useRef<SVGGElement | null>(null);

  // Total SVG dimensions
  const dimensions = useMemo(
    () => ({
      width: svgWidth,
      height: svgHeight,
    }),
    [svgWidth, svgHeight]
  );

  // Inner dimensions reduce margins
  const innerWidth = useMemo(() => dimensions.width - MARGIN.left - MARGIN.right, [dimensions.width]);
  const innerHeight = useMemo(() => dimensions.height - MARGIN.top - MARGIN.bottom, [dimensions.height]);
  
  const layoutConfig = useMemo(() => ({
    innerWidth,
    innerHeight,
    columnHeight: 50,
    columnWidth: 80,
    columnSpacing: 30,
    hierarchyHeight: 20,
    hierarchySpacing: 20,
    segmentSpacing: 2,
    theme,
    globalQuery
  }), [innerWidth, innerHeight, theme, globalQuery]);

  // Process tree data into the format needed for our visualization
  const { 
    columnData, 
    categoryData, 
    superCategoryData 
  } = useMemo(() => getHierarchyData(targetTreeData, layoutConfig), [targetTreeData, layoutConfig]);

  // Calculate spacing and positions
  const columnsY = useMemo(() => 0, []);
  const categoryY = useMemo(() => columnsY + layoutConfig.columnHeight + layoutConfig.columnSpacing, [columnsY, layoutConfig.columnHeight, layoutConfig.columnSpacing]);
  const superCategoryY = useMemo(() => categoryY + layoutConfig.hierarchyHeight + layoutConfig.hierarchySpacing, [categoryY, layoutConfig.hierarchyHeight, layoutConfig.hierarchySpacing]);

  const spaceFillingWidth = useMemo(() => columnData.reduce(
    (acc, column) => Math.max(acc, column.x! + column.width!),
    0 // Initial value
  ), [columnData]);

  const categoryColorScale = useMemo(() => getOptimalCategoryColorScale(
    categoryData.map(c => c.id)
  ), [categoryData]);

  // Render function
  const renderVisualization = useCallback(() => {
    if (!targetTreeData || targetTreeData.length === 0 || !svgRef.current || !gRef.current) return;

    const g = d3.select(gRef.current);
    g.selectAll('*').remove();

    // Render the segments and connections
    renderSpaceFillingSegmentsHorizontal(
      g, 
      columnData,
      superCategoryData, 
      categoryData, 
      {
        ...layoutConfig,
        innerWidth: spaceFillingWidth
      }, 
      superCategoryY, 
      categoryY,
      categoryColorScale,
      selectedTargetNodes,
      setSelectedTargetNodes
    );

    renderEdgeBundlingVertical(
      g, 
      columnData, 
      categoryData, 
      {
        ...layoutConfig,
        innerWidth: spaceFillingWidth
      }, 
      columnsY, 
      categoryY,
      categoryColorScale,
    );

    renderColumnsHorizontal(
      g, 
      columnData, 
      layoutConfig, 
      columnsY, 
      currentExpanding,
      categoryColorScale,
      globalQuery,
    );

    // Add title
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('x', spaceFillingWidth / 2)
      .attr('y', superCategoryY + 50)
      .attr('font-size', '1rem')
      .attr('font-weight', '300')
      .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
      .text(targetMeta?.name ? `${targetMeta.name} (Target)` : 'Database Schema Hierarchy');
  }, [
    targetTreeData, 
    targetTreeData, 
    innerWidth, 
    innerHeight, 
    targetTreeData,
    innerWidth, 
    innerHeight, 
    columnData, 
    categoryData, 
    superCategoryData,
    layoutConfig,
    spaceFillingWidth,
    superCategoryY,
    categoryY,
    columnsY,
    currentExpanding,
    categoryColorScale,
    globalQuery,
    selectedTargetNodes,
    setSelectedTargetNodes
  ]);

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
        width="100%" 
        height="100%" 
        style={{ overflow: 'visible' }} 
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

export default HierarchicalColumnViz;