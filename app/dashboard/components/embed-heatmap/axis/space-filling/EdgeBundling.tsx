import { Selection } from 'd3';
import { CategoryData, ColumnData, LayoutConfig } from './HierarchyUtils';
import * as d3 from 'd3';
import { calculateCategorySegments, SpaceFillingOrientation } from './SpaceFillingSegments';
import { getOptimalCategoryColorScale } from './ColorUtils';

// Interface for bundled path data
interface BundledPath {
  id: string;
  path: string;
  column: ColumnData;
  category: CategoryData;
}

// Enum for orientation types
export enum EdgeBundlingOrientation {
  VERTICAL = 'vertical',
  HORIZONTAL = 'horizontal'
}

// Interface for position parameters
interface EdgeBundlingPosition {
  columnsPosition: number; // X position for horizontal, Y position for vertical
  categoryPosition: number; // X position for horizontal, Y position for vertical
  orientation: EdgeBundlingOrientation;
}

// Create the bundled paths from columns to categories
function createBundledPaths(
  positionedColumns: ColumnData[],
  positionedCategories: CategoryData[],
  position: EdgeBundlingPosition,
  layoutConfig: LayoutConfig
): BundledPath[] {
  const { columnHeight, columnWidth } = layoutConfig;
  const { columnsPosition, categoryPosition, orientation } = position;
  
  // Calculate control point offset based on orientation
  const controlPointOffset = (columnsPosition - categoryPosition) * 0.5;
  
  // Create a lookup map for faster category access
  const categoryMap = new Map(positionedCategories.map(cat => [cat.id, cat]));
  
  // Pre-calculate paths in a single pass
  return positionedColumns
    .map(column => {
      const category = categoryMap.get(column.category);
      if (!category) return null;
      
      let startX: number, startY: number, endX: number, endY: number, path: string;
      
      if (orientation === EdgeBundlingOrientation.VERTICAL) {
        // Vertical orientation: columns above, categories below
        if (!category.centerX) return null;
        
        startX = column.x! + column.width! / 2;
        startY = column.y! + columnHeight;
        endX = category.centerX;
        endY = categoryPosition;
        
        // Create bundled path with S-curve for vertical layout
        path = `M ${startX} ${startY} C ${startX} ${startY - controlPointOffset * 0.3}, ${endX} ${endY + controlPointOffset * 0.7}, ${endX} ${endY}`;
      } else {
        // Horizontal orientation: columns on left, categories on right
        if (!category.centerY) return null;

        startX = column.x!;
        startY = column.y! + column.height! / 2;
        endX = categoryPosition + 20; // Add offset for horizontal layout
        endY = category.centerY;
        
        // Create bundled path with S-curve for horizontal layout
        path = `M ${startX} ${startY} C ${startX + controlPointOffset * 0.3} ${startY}, ${endX - controlPointOffset * 0.7} ${endY}, ${endX} ${endY}`;
      }
      
      return {
        id: `edge-${column.id}-${category.id}`,
        column,
        category,
        path
      };
    })
    .filter(Boolean) as BundledPath[];
}

// Main function to render the edge bundling with orientation support
export function renderEdgeBundling(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  columnsPosition: number,
  categoryPosition: number,
  categoryColorScale: (id: string) => string,
  orientation: EdgeBundlingOrientation = EdgeBundlingOrientation.VERTICAL
) {
  // Position columns and categories based on orientation
  const positionedColumns = columnData.map((column) => {
    if (orientation === EdgeBundlingOrientation.VERTICAL) {
      return {
        ...column,
        x: column.originalNode.x || 0,
        y: columnsPosition,
        width: column.originalNode.width || 100,
        height: layoutConfig.columnHeight
      };
    } else {
      return {
        ...column,
        x: columnsPosition,
        y: column.originalNode.y || 0,
        width: layoutConfig.columnWidth,
        height: column.originalNode.height || 100,
      };
    }
  });
  
  const positionedCategories = calculateCategorySegments(
    categoryData,
    layoutConfig,
    false,
    undefined,
    orientation === EdgeBundlingOrientation.VERTICAL ? SpaceFillingOrientation.HORIZONTAL : SpaceFillingOrientation.VERTICAL
  );

  // Create paths - do this once and cache the result
  const bundledPaths = createBundledPaths(
    positionedColumns,
    positionedCategories,
    {
      columnsPosition,
      categoryPosition,
      orientation
    },
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

// Legacy function for backward compatibility - vertical orientation
export function renderEdgeBundlingVertical(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  columnsY: number,
  categoryY: number,
  categoryColorScale: (id: string) => string
) {
  return renderEdgeBundling(
    g,
    columnData,
    categoryData,
    layoutConfig,
    columnsY,
    categoryY,
    categoryColorScale,
    EdgeBundlingOrientation.VERTICAL
  );
}

// Legacy function for backward compatibility - horizontal orientation
export function renderEdgeBundlingHorizontal(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  columnsX: number,
  categoryX: number,
  categoryColorScale: (id: string) => string
) {
  return renderEdgeBundling(
    g,
    columnData,
    categoryData,
    layoutConfig,
    columnsX,
    categoryX,
    categoryColorScale,
    EdgeBundlingOrientation.HORIZONTAL
  );
}