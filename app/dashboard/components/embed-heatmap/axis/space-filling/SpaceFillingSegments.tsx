import { Selection } from 'd3';
import { CategoryData, ColumnData, LayoutConfig, SuperCategoryData, highlightText } from './HierarchyUtils.tsx';
import * as d3 from 'd3';
import { getOptimalCategoryColorScale } from './ColorUtils.ts';
import { applyDefaultStyleOnColumn, applyDefaultStyleOnEdge, applyBackgroundStyleOnColumn, applyBackgroundStyleOnEdge, applyHighlightOnColumn, applyHighlightStyleOnEdge } from './InteractionUtils.ts';

// Enum for orientation types
export enum SpaceFillingOrientation {
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical'
}

// Interface for position parameters
interface SpaceFillingPosition {
  superCategoryPosition: number; // X position for horizontal, Y position for vertical
  categoryPosition: number; // X position for horizontal, Y position for vertical
  orientation: SpaceFillingOrientation;
}

// Function to calculate segment positions for categories
export function calculateCategorySegments(
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  columnsPositioned: boolean,
  columnPositions?: { id: string; x?: number; y?: number; width?: number; height?: number; }[],
  orientation: SpaceFillingOrientation = SpaceFillingOrientation.HORIZONTAL
): CategoryData[] {
  const { innerWidth, innerHeight, segmentSpacing } = layoutConfig;
  const MIN_CATEGORY_SIZE = orientation === SpaceFillingOrientation.HORIZONTAL ? 80 : 20; // Minimum size for category to ensure text fits
  const containerSize = orientation === SpaceFillingOrientation.HORIZONTAL ? innerWidth : innerHeight;
  
  // First, sort categories based on their leftmost/topmost column position
  const sortedCategories = [...categoryData].sort((a, b) => {
    if (!columnsPositioned || !columnPositions) return 0;
    
    // Find leftmost/topmost column for each category
    const aColumnIds = a.columns.map(col => col.id);
    const bColumnIds = b.columns.map(col => col.id);
    
    const aPositions = columnPositions.filter(pos => aColumnIds.includes(pos.id));
    const bPositions = columnPositions.filter(pos => bColumnIds.includes(pos.id));
    
    if (aPositions.length === 0 || bPositions.length === 0) return 0;
    
    if (orientation === SpaceFillingOrientation.HORIZONTAL) {
      const aLeftmost = Math.min(...aPositions.map(pos => pos.x || 0));
      const bLeftmost = Math.min(...bPositions.map(pos => pos.x || 0));
      return aLeftmost - bLeftmost;
    } else {
      const aTopmost = Math.min(...aPositions.map(pos => pos.y || 0));
      const bTopmost = Math.min(...bPositions.map(pos => pos.y || 0));
      return aTopmost - bTopmost;
    }
  });
  
  // Create a result array to hold the calculated positions
  const result: CategoryData[] = [];
  
  if (columnsPositioned && columnPositions) {
    // Calculate based on column positions
    for (const category of sortedCategories) {
      const updatedCategory = { ...category };
      
      // Get columns for this category
      const categoryColumns = category.columns;
      if (categoryColumns.length > 0) {
        const columnIds = categoryColumns.map(col => col.id);
        const relevantPositions = columnPositions.filter(pos => columnIds.includes(pos.id));
        
        if (relevantPositions.length > 0) {
          if (orientation === SpaceFillingOrientation.HORIZONTAL) {
            // Find actual span based on column positions
            const leftmost = Math.min(...relevantPositions.map(pos => pos.x || 0));
            const rightmost = Math.max(...relevantPositions.map(pos => (pos.x || 0) + (pos.width || 0)));
            
            updatedCategory.x = leftmost;
            updatedCategory.width = Math.max(rightmost - leftmost, MIN_CATEGORY_SIZE);
            updatedCategory.centerX = leftmost + (updatedCategory.width / 2);
          } else {
            // Find actual span based on column positions
            const topmost = Math.min(...relevantPositions.map(pos => pos.y || 0));
            const bottommost = Math.max(...relevantPositions.map(pos => (pos.y || 0) + (pos.height || 0)));
            
            updatedCategory.y = topmost;
            updatedCategory.height = Math.max(bottommost - topmost, MIN_CATEGORY_SIZE);
            updatedCategory.centerY = topmost + (updatedCategory.height / 2);
          }
        }
      }
      
      result.push(updatedCategory);
    }
  } else {
    // If columns aren't positioned yet, distribute categories evenly
    const totalCategories = sortedCategories.length;
    
    // Calculate percentage size based on column count with minimum size consideration
    const totalColumns = sortedCategories.reduce((sum, cat) => sum + cat.columns.length, 0);
    const sizeThreshold = MIN_CATEGORY_SIZE / containerSize;
    
    // Pre-calculate which categories are below threshold
    const categoriesBelowThreshold = new Set<string>();
    for (const cat of sortedCategories) {
      const proportion = cat.columns.length / totalColumns;
      if (proportion < sizeThreshold) {
        categoriesBelowThreshold.add(cat.id);
      }
    }
    
    const availableSize = containerSize - (MIN_CATEGORY_SIZE * totalCategories) - ((totalCategories - 1) * segmentSpacing);
    
    // Calculate total columns in categories above threshold once
    const numColumnsInCategoriesAboveThreshold = sortedCategories
      .filter(cat => !categoriesBelowThreshold.has(cat.id))
      .reduce((sum, cat) => sum + cat.columns.length, 0);
    
    // Pre-calculate sizes for each category
    const categorySizes = new Map<string, number>();
    for (const cat of sortedCategories) {
      const calculatedSize = categoriesBelowThreshold.has(cat.id) 
        ? MIN_CATEGORY_SIZE 
        : MIN_CATEGORY_SIZE + cat.columns.length * availableSize / numColumnsInCategoriesAboveThreshold;
      categorySizes.set(cat.id, calculatedSize);
    }
    
    // Calculate positions in a single pass
    let currentPosition = 0;
    for (let i = 0; i < sortedCategories.length; i++) {
      const category = sortedCategories[i];
      const updatedCategory = { ...category };
      const calculatedSize = categorySizes.get(category.id) || MIN_CATEGORY_SIZE;
      
      if (orientation === SpaceFillingOrientation.HORIZONTAL) {
        updatedCategory.x = currentPosition;
        updatedCategory.width = calculatedSize;
        updatedCategory.centerX = currentPosition + (calculatedSize / 2);
      } else {
        updatedCategory.y = currentPosition;
        updatedCategory.height = calculatedSize;
        updatedCategory.centerY = currentPosition + (calculatedSize / 2);
      }
      
      result.push(updatedCategory);
      
      // Update position for next category
      currentPosition += calculatedSize + segmentSpacing;
    }
  }
  
  return result;
}

// Function to calculate segment positions for super categories
export function calculateSuperCategorySegments(
  superCategoryData: SuperCategoryData[],
  categorySegments: CategoryData[],
  orientation: SpaceFillingOrientation = SpaceFillingOrientation.HORIZONTAL
): SuperCategoryData[] {
  // Create a map to group categories by super category for faster lookup
  const categoriesBySuperCategory = new Map<string, CategoryData[]>();
  
  for (const cat of categorySegments) {
    if (!cat.superCategory) continue;
    
    if (!categoriesBySuperCategory.has(cat.superCategory)) {
      categoriesBySuperCategory.set(cat.superCategory, []);
    }
    categoriesBySuperCategory.get(cat.superCategory)!.push(cat);
  }
  
  return superCategoryData.map(superCategory => {
    const updatedSuperCategory = { ...superCategory };
    const relevantCategories = categoriesBySuperCategory.get(superCategory.id) || [];
    
    if (relevantCategories.length > 0) {
      if (orientation === SpaceFillingOrientation.HORIZONTAL) {
        const leftmost = Math.min(...relevantCategories.map(cat => cat.x || 0));
        const rightmost = Math.max(...relevantCategories.map(cat => (cat.x || 0) + (cat.width || 0)));
        
        updatedSuperCategory.x = leftmost;
        updatedSuperCategory.width = rightmost - leftmost;
        updatedSuperCategory.centerX = leftmost + (rightmost - leftmost) / 2;
      } else {
        const topmost = Math.min(...relevantCategories.map(cat => cat.y || 0));
        const bottommost = Math.max(...relevantCategories.map(cat => (cat.y || 0) + (cat.height || 0)));
        
        updatedSuperCategory.y = topmost;
        updatedSuperCategory.height = bottommost - topmost;
        updatedSuperCategory.centerY = topmost + (updatedSuperCategory.height / 2);
      }
    }
    
    return updatedSuperCategory;
  });
}

// Function to render the space-filling segments with orientation support
export function renderSpaceFillingSegments(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  superCategoryData: SuperCategoryData[],
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  superCategoryPosition: number,
  categoryPosition: number,
  categoryColorScale: (id: string) => string,
  selectedNodes: SelectedNode[],
  setSelectedNodes: (nodes: SelectedNode[]) => void,
  orientation: SpaceFillingOrientation = SpaceFillingOrientation.HORIZONTAL
) {
  const { theme, globalQuery, hierarchyHeight } = layoutConfig;
  
  // Create a color scale for super categories
  const superCategoryIds = [...new Set(superCategoryData.map(sc => sc.id))];
  const superCategoryColorScale = getOptimalCategoryColorScale(superCategoryIds);

  // Position the segments
  const positionedCategorySegments = calculateCategorySegments(categoryData, layoutConfig, false, undefined, orientation);
  const positionedSuperCategorySegments = calculateSuperCategorySegments(superCategoryData, positionedCategorySegments, orientation);

  // Create maps for faster lookups during interactions
  const columnsByCategory = new Map<string, string[]>();
  const columnNamesByCategory = new Map<string, string[]>();
  const columnsBySuperCategory = new Map<string, string[]>();
  const categoriesBySuper = new Map<string, string[]>();

  // Convert SelectedNodes to string list for faster lookups
  const selectedNodesStringList = selectedNodes.map(node => node.node);
  
  // Build lookup maps
  for (const cat of categoryData) {
    const columnIds = cat.columns.map(col => col.id);
    columnsByCategory.set(cat.id, columnIds);
    const columnNames = cat.columns.map(col => col.name);
    columnNamesByCategory.set(cat.id, columnNames);
    
    if (cat.superCategory) {
      if (!categoriesBySuper.has(cat.superCategory)) {
        categoriesBySuper.set(cat.superCategory, []);
      }
      categoriesBySuper.get(cat.superCategory)!.push(cat.id);
      
      if (!columnsBySuperCategory.has(cat.superCategory)) {
        columnsBySuperCategory.set(cat.superCategory, []);
      }
      columnsBySuperCategory.get(cat.superCategory)!.push(...columnIds);
    }
  }

  // Determine segment dimensions based on orientation
  const segmentWidth = orientation === SpaceFillingOrientation.HORIZONTAL ? undefined : 20;
  const segmentHeight = orientation === SpaceFillingOrientation.HORIZONTAL ? (hierarchyHeight || 20) : undefined;

  // Create super category segments
  const superCategoryGroup = g.append('g')
    .attr('class', 'super-categories');
  
  superCategoryGroup.selectAll('.super-category')
    .data(positionedSuperCategorySegments)
    .enter()
    .append('g')
    .attr('class', 'super-category')
    .attr('id', d => `super-category-${d.id}`)
    .attr('transform', d => {
      if (orientation === SpaceFillingOrientation.HORIZONTAL) {
        return `translate(${d.x}, ${superCategoryPosition})`;
      } else {
        return `translate(${superCategoryPosition}, ${d.y})`;
      }
    })
    .each(function(d:any) {
      const group = d3.select(this);
      
      // Segment rectangle
      group.append('rect')
        .attr('width', orientation === SpaceFillingOrientation.HORIZONTAL ? d.width : segmentWidth)
        .attr('height', orientation === SpaceFillingOrientation.HORIZONTAL ? segmentHeight : d.height)
        .attr('rx', 3)
        .attr('fill', (() => {
          const color = d3.color(superCategoryColorScale(d.id));
          return color ? color.darker(0).toString() : superCategoryColorScale(d.id);
        })())
        .attr('stroke', theme.palette.text.primary)
        .attr('stroke-width', 1)
        .style('cursor', 'pointer');
      
      // Label text
      const text = group.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', theme.palette.common.white)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', orientation === SpaceFillingOrientation.HORIZONTAL ? '0.9rem' : '0.8rem')
        .attr('font-weight', '500')
        .attr('letter-spacing', '0')
        .html(highlightText(d.id, globalQuery, theme));
      
      if (orientation === SpaceFillingOrientation.HORIZONTAL) {
        text
          .attr('x', d.width! / 2)
          .attr('y', segmentHeight! / 2)
          .attr('dy', '0.35em');
      } else {
        text
          .attr('x', -d.height! / 2)
          .attr('y', segmentWidth! / 2)
          .attr('dy', '0.35em')
          .attr('transform', `rotate(-90)`);
      }
    })
    .on('click', function(event, d: SuperCategoryData) {
      // Get child categories
      const childCategories = categoriesBySuper.get(d.id) || [];
      
      // Toggle selection of child categories
      const allChildrenSelected = childCategories.every(catId => selectedNodesStringList.includes(catId));
      
      if (allChildrenSelected) {
        // Remove all child categories from selection
        setSelectedNodes(selectedNodes.filter(node => !childCategories.includes(node.node)));
      } else {
        // Add all child categories to selection
        setSelectedNodes([...selectedNodes, ...childCategories.map(catId => ({
          node: catId,
          columns: columnNamesByCategory.get(catId) || [],
          category: catId
        }))]);
      }
    });

  // Create category segments
  const categoryGroup = g.append('g')
    .attr('class', 'categories');
  
  categoryGroup.selectAll('.category')
    .data(positionedCategorySegments)
    .enter()
    .append('g')
    .attr('class', 'category')
    .attr('id', d => `category-${d.id}`)
    .attr('transform', d => {
      if (orientation === SpaceFillingOrientation.HORIZONTAL) {
        return `translate(${d.x}, ${categoryPosition})`;
      } else {
        return `translate(${categoryPosition}, ${d.y})`;
      }
    })
    .each(function(d: any) {
      const group = d3.select(this);
      
      // Segment rectangle
      group.append('rect')
        .attr('width', orientation === SpaceFillingOrientation.HORIZONTAL ? d.width : segmentWidth)
        .attr('height', orientation === SpaceFillingOrientation.HORIZONTAL ? segmentHeight : d.height)
        .attr('rx', 2)
        .attr('fill', (() => {
          const color = d3.color(categoryColorScale(d.id));
          return color ? color.darker(selectedNodesStringList.includes(d.id) ? 0.4 : 0).toString() : categoryColorScale(d.id);
        })())
        .attr('stroke', selectedNodesStringList.includes(d.id) ? theme.palette.primary.main : theme.palette.text.primary)
        .attr('stroke-width', selectedNodesStringList.includes(d.id) ? 3 : 1)
        .style('cursor', 'pointer');
      
      // Label text
      const text = group.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', theme.palette.common.white)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', orientation === SpaceFillingOrientation.HORIZONTAL ? '0.8rem' : '0.7rem')
        .attr('font-weight', selectedNodesStringList.includes(d.id) ? '700' : '400')
        .attr('letter-spacing', selectedNodesStringList.includes(d.id) ? '0.3px' : '0')
        .html(highlightText(d.id, globalQuery, theme));
      
      if (orientation === SpaceFillingOrientation.HORIZONTAL) {
        text
          .attr('x', d.width! / 2)
          .attr('y', segmentHeight! / 2)
          .attr('dy', '0.35em');
      } else {
        text
          .attr('x', -d.height! / 2)
          .attr('y', segmentWidth! / 2)
          .attr('dy', '0.35em')
          .attr('transform', `rotate(-90)`);
      }
    })
    .on('click', function(event, d: CategoryData) {
      // Toggle selection of this category
      const isSelected = selectedNodesStringList.includes(d.id);
      
      if (isSelected) {
        setSelectedNodes(selectedNodes.filter(node => node.node !== d.id));
      } else {
        setSelectedNodes([...selectedNodes, {
          node: d.id,
          columns: columnNamesByCategory.get(d.id) || [],
          category: d.id
        }]);
      }
      
      // Update visual state
      d3.select(this)
        .select('rect')
        .attr('stroke-width', isSelected ? 1 : 3)
        .attr('stroke', isSelected ? theme.palette.text.primary : theme.palette.primary.main);
    })
    .on('mouseover', function(event, d: CategoryData) {
      const isSelected = selectedNodesStringList.includes(d.id);
      
      // Only apply hover effects if not selected
      if (!isSelected) {
        d3.select(this)
          .select('rect')
          .attr('stroke-width', 3)
          .attr('stroke', theme.palette.primary.main)
          .attr('stroke-opacity', 1)
          .attr('stroke-dasharray', '0');
      }
      
      const relatedColumnIds = columnsByCategory.get(d.id) || [];
      
      // Highlight related columns
      columnData.forEach(column => {
        if (relatedColumnIds.includes(column.id)) {
          g.select(`#column-${column.id}`)
            .attr('opacity', 1)
            .select('rect')
            .attr('stroke-width', 2);
          
          g.select(`#edge-${column.id}-${d.id}`)
            .attr('stroke-width', 1.5)
            .attr('stroke-opacity', 1)
            .attr('stroke-dasharray', '3,3');
        } else {
          g.select(`#column-${column.id}`)
            .attr('opacity', 0.2)
            .select('rect')
            .attr('stroke-width', 1);
          
          g.select(`#edge-${column.id}-${column.category}`)
            .attr('stroke-width', 1.5)
            .attr('stroke-opacity', 0.2)
            .attr('stroke-dasharray', '3,3');
        }
      });
    })
    .on('mouseout', function(event, d: CategoryData) {
      // Only reset if not selected
      if (!selectedNodesStringList.includes(d.id)) {
        d3.select(this)
          .select('rect')
          .attr('fill', (() => {
            const color = d3.color(categoryColorScale(d.id));
            return color ? color.darker(0).toString() : categoryColorScale(d.id);
          })())
          .attr('stroke-width', 1)
          .attr('stroke', theme.palette.text.primary);
        
        d3.select(this)
          .select('text')
          .attr('font-weight', '400')
          .attr('letter-spacing', '0');
      }
      
      // Reset all columns and edges
      columnData.forEach(column => {
        g.select(`#column-${column.id}`).call(applyDefaultStyleOnColumn);
        g.select(`#edge-${column.id}-${column.category}`).call(applyDefaultStyleOnEdge);
      });
    });

  // Create connecting lines from categories to super categories
  positionedCategorySegments.forEach(category => {
    const superCategory = positionedSuperCategorySegments.find(sc => sc.id === category.superCategory);
    if (!superCategory) return;
    
    let path: string;
    if (orientation === SpaceFillingOrientation.HORIZONTAL) {
      if (!category.centerX || !superCategory.centerX) return;
      path = `
        M ${category.centerX} ${categoryPosition + segmentHeight!}
        C ${category.centerX} ${categoryPosition + segmentHeight! + 10},
          ${superCategory.centerX} ${superCategoryPosition - 10},
          ${superCategory.centerX} ${superCategoryPosition}
      `;
    } else {
      if (!category.centerY || !superCategory.centerY) return;
      path = `
        M ${superCategoryPosition + segmentWidth!} ${superCategory.centerY}
        C ${superCategoryPosition + segmentWidth! + 10} ${superCategory.centerY},
          ${categoryPosition - 10} ${category.centerY},
          ${categoryPosition} ${category.centerY}
      `;
    }
    
    g.append('path')
      .attr('id', `category-super-connection-${category.id}-${superCategory.id}`)
      .attr('class', 'category-super-connection')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', categoryColorScale(category.id))
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.7);
  });

  return {
    positionedCategorySegments,
    positionedSuperCategorySegments,
    categoryColorScale
  };
}

// Legacy function for backward compatibility - horizontal orientation
export function renderSpaceFillingSegmentsHorizontal(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  superCategoryData: SuperCategoryData[],
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  superCategoryY: number,
  categoryY: number,
  categoryColorScale: (id: string) => string,
  selectedTargetNodes: SelectedNode[],
  setSelectedTargetNodes: (nodes: SelectedNode[]) => void
) {
  return renderSpaceFillingSegments(
    g,
    columnData,
    superCategoryData,
    categoryData,
    layoutConfig,
    superCategoryY,
    categoryY,
    categoryColorScale,
    selectedTargetNodes,
    setSelectedTargetNodes,
    SpaceFillingOrientation.HORIZONTAL
  );
}

// Legacy function for backward compatibility - vertical orientation
export function renderSpaceFillingSegmentsVertical(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  superCategoryData: SuperCategoryData[],
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  superCategoryX: number,
  categoryX: number,
  categoryColorScale: (id: string) => string,
  selectedSourceNodes: SelectedNode[],
  setSelectedSourceNodes: (nodes: SelectedNode[]) => void
) {
  return renderSpaceFillingSegments(
    g,
    columnData,
    superCategoryData,
    categoryData,
    layoutConfig,
    superCategoryX,
    categoryX,
    categoryColorScale,
    selectedSourceNodes,
    setSelectedSourceNodes,
    SpaceFillingOrientation.VERTICAL
  );
}