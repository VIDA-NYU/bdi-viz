import React, { useContext, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useTheme } from '@mui/material';
import { useResizedSVG } from '../../../hooks/resize-hooks.tsx';
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';
import { renderSpaceFillingSegments } from './SpaceFillingSegments';
import { renderEdgeBundling } from './EdgeBundling';
import { renderColumns } from './ColumnRenderer.tsx';
import { getHierarchyData } from './HierarchyUtils';
import { TreeNode } from '../../tree/types';
import { useResizedSVGRef } from '../../../hooks/resize-hooks.tsx';
import { getOptimalCategoryColorScale } from './ColorUtils.ts';
interface HierarchicalColumnVizProps {
  targetTreeData: TreeNode[];
  currentExpanding?: any; // Using any to match your existing code
  transform: string;
  hideTooltip: () => void;
}

const MARGIN = { top: 40, right: 70, bottom: 20, left: 70 };

const HierarchicalColumnViz: React.FC<HierarchicalColumnVizProps> = ({ 
  targetTreeData, 
  currentExpanding,
  transform,
  hideTooltip,
}) => {
  const theme = useTheme();
  const { globalQuery } = useContext(HighlightGlobalContext);
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
  const layoutConfig = {
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
  };
  // Process tree data into the format needed for our visualization
  const { 
    columnData, 
    categoryData, 
    superCategoryData 
  } = useMemo(() => getHierarchyData(targetTreeData, layoutConfig ), [targetTreeData]);
  const g = d3.select(gRef.current) as d3.Selection<SVGGElement, unknown, null, undefined>;
  useEffect(() => {
    if (!targetTreeData || targetTreeData.length === 0 || !svgRef.current) return;

    // Initialize and clear SVG
    const svg = d3.select(svgRef.current);
    g.selectAll('*').remove();

    // Create a group element and translate by margins
    // const g = svg.append('g')
    //   .attr('transform', `translate(${MARGIN.left}, ${MARGIN.top})`);
    
    // Save reference to the group element
    // gRef.current = g.node();
    
    // Define layout constants
    

    // Calculate spacing and positions
    
    const columnsY = 0;
    const categoryY = columnsY + layoutConfig.columnHeight + layoutConfig.columnSpacing;
    const superCategoryY = categoryY + layoutConfig.hierarchyHeight + layoutConfig.hierarchySpacing;
    

    const spaceFillingWidth = columnData.reduce(
      (acc, column) => Math.max(acc, column.x! + column.width!),
      0 // Initial value
    )
    const categoryColorScale = getOptimalCategoryColorScale(
      categoryData.map(c => c.id)
    );
    // Render the segments and connections
    renderSpaceFillingSegments(
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
      categoryColorScale
    );

    renderEdgeBundling(
      g, 
      columnData, 
      categoryData, 
      {
        ...layoutConfig,
        innerWidth: spaceFillingWidth
      }, 
      columnsY, 
      categoryY,
      categoryColorScale
    );

    renderColumns(
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
      .attr('font-weight', 'bold')
      .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
      .text('Database Schema Hierarchy');

  }, [
    targetTreeData, 
    innerWidth, 
    innerHeight, 
    columnData, 
    categoryData, 
    superCategoryData, 
    theme, 
    globalQuery, 
    currentExpanding
  ]);

  return (
    <div onMouseMove={hideTooltip}>
      <svg 
        width="100%" 
        height="100%" 
        style={{ overflow: 'visible' }} 
        ref={svgRef}
      >
          <g
            ref={gRef}
            transform={transform}
          >
          </g>

      </svg>
    </div>
  );
};

export default HierarchicalColumnViz;