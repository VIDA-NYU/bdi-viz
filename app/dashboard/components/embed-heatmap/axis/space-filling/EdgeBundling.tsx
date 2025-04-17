import { Selection } from 'd3';
import { CategoryData, ColumnData, LayoutConfig } from './HierarchyUtils';
import * as d3 from 'd3';
import { calculateCategorySegments } from './SpaceFillingSegments';
import { getOptimalCategoryColorScale } from './ColorUtils';

// Interface for bundled path data
interface BundledPath {
  id: string;
  path: string;
  column: ColumnData;
  category: CategoryData;
}

// Create the bundled paths from columns to categories
function createBundledPaths(
  positionedColumns: ColumnData[],
  positionedCategories: CategoryData[],
  columnsY: number,
  categoryY: number,
  layoutConfig: LayoutConfig
): BundledPath[] {
  const { columnHeight } = layoutConfig;
  const controlPointOffsetY = (columnsY - categoryY) * 0.5;
  
  // Create a lookup map for faster category access
  const categoryMap = new Map(positionedCategories.map(cat => [cat.id, cat]));
  
  // Pre-calculate paths in a single pass
  return positionedColumns
    .map(column => {
      const category = categoryMap.get(column.category);
      if (!category || !category.centerX) return null;
      
      const startX = column.x! + column.width! / 2;
      const startY = column.y! + columnHeight;
      const endX = category.centerX;
      const endY = categoryY;
      
      // Create bundled path with S-curve to give bundling effect
      // Use template literal only once for better performance
      const path = `M ${startX} ${startY} C ${startX} ${startY - controlPointOffsetY * 0.3}, ${endX} ${endY + controlPointOffsetY * 0.7}, ${endX} ${endY}`;
      
      return {
        id: `edge-${column.id}-${category.id}`,
        column,
        category,
        path
      };
    })
    .filter(Boolean) as BundledPath[];
}

// Main function to render the edge bundling
export function renderEdgeBundling(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  columnsY: number,
  categoryY: number,
  categoryColorScale: (id: string) => string
) {
  // Position columns and categories - memoize these calculations
  const positionedColumns = columnData.map((column) => ({
    ...column,
    x: column.originalNode.x || 0,
    y: columnsY,
    width: column.originalNode.width || 100,
    height: layoutConfig.columnHeight
  }));
  
  const positionedCategories = calculateCategorySegments(categoryData, layoutConfig, false);

  // Create paths - do this once and cache the result
  const bundledPaths = createBundledPaths(
    positionedColumns,
    positionedCategories,
    columnsY,
    categoryY,
    layoutConfig
  );

  // Define style constants to avoid recalculation
  const styles = {
    path: {
      normalWidth: 1.5,
      highlightWidth: 2.5,
      normalOpacity: 0.7,
      fadedOpacity: 0.2,
      dashArray: '3,3'
    },
    element: {
      normalStrokeWidth: 1,
      highlightStrokeWidth: 2
    }
  };

  // Render the bundled paths - use a single group for better performance
  const pathGroup = g.append('g')
    .attr('class', 'bundled-paths');
  
  // Add all paths at once
  const paths = pathGroup.selectAll('.column-category-path')
    .data(bundledPaths)
    .enter()
    .append('path')
    .attr('class', 'column-category-path')
    .attr('id', d => d.id)
    .attr('d', d => d.path)
    .attr('fill', 'none')
    .attr('stroke', d => categoryColorScale(d.category.id))
    .attr('stroke-width', styles.path.normalWidth)
    .attr('stroke-opacity', styles.path.normalOpacity)
    .attr('stroke-dasharray', styles.path.dashArray);

  // Use event delegation for better performance
  pathGroup.on('mouseover.paths', function(event) {
    const target = event.target;
    if (!target.classList.contains('column-category-path')) return;
    
    const d = d3.select(target).datum() as BundledPath;
    
    // Highlight this path
    d3.select(target)
      .attr('stroke-width', styles.path.highlightWidth)
      .attr('stroke-opacity', 1)
      .attr('stroke-dasharray', '0');
    
    // Highlight the connected column and category
    g.select(`#column-${d.column.id}`)
      .attr('opacity', 1)
      .select('rect')
      .attr('stroke-width', styles.element.highlightStrokeWidth);
    
    g.select(`#category-${d.category.id}`)
      .attr('opacity', 1)
      .select('rect')
      .attr('stroke-width', styles.element.highlightStrokeWidth);

    // Fade other paths
    pathGroup.selectAll('.column-category-path')
      .filter(function() { return this !== target; })
      .attr('stroke-opacity', styles.path.fadedOpacity);
  });

  // Use a single mouseout handler for the entire group
  pathGroup.on('mouseout.paths', function() {
    // Reset all elements
    pathGroup.selectAll('.column-category-path')
      .attr('stroke-width', styles.path.normalWidth)
      .attr('stroke-opacity', styles.path.normalOpacity)
      .attr('stroke-dasharray', styles.path.dashArray);
    
    g.selectAll('.column')
      .attr('opacity', 1)
      .select('rect')
      .attr('stroke-width', styles.element.normalStrokeWidth);
    
    g.selectAll('.category')
      .attr('opacity', 1)
      .select('rect')
      .attr('stroke-width', styles.element.normalStrokeWidth);
  });

  return {
    positionedColumns,
    positionedCategories,
    bundledPaths
  };
}