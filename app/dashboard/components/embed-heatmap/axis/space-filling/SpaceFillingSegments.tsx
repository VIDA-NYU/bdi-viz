import { Selection } from 'd3';
import { CategoryData, ColumnData, LayoutConfig, SuperCategoryData, highlightText } from './HierarchyUtils.tsx';
import * as d3 from 'd3';
import { getOptimalCategoryColorScale } from './ColorUtils.ts';
import { applyDefaultStyleOnColumn, applyDefaultStyleOnEdge, applyBackgroundStyleOnColumn, applyBackgroundStyleOnEdge, applyHighlightOnColumn, applyHighlightStyleOnEdge } from './InteractionUtils.ts';

// Function to calculate segment positions for categories
export function calculateCategorySegments(
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  columnsPositioned: boolean,
  columnPositions?: { id: string; x: number; width: number; }[]
): CategoryData[] {
  const { innerWidth, segmentSpacing } = layoutConfig;
  const MIN_CATEGORY_WIDTH = 80; // Minimum width for category to ensure text fits
  
  // First, sort categories based on their leftmost column position
  const sortedCategories = [...categoryData].sort((a, b) => {
    if (!columnsPositioned || !columnPositions) return 0;
    
    // Find leftmost column for each category
    const aColumnIds = a.columns.map(col => col.id);
    const bColumnIds = b.columns.map(col => col.id);
    
    const aPositions = columnPositions.filter(pos => aColumnIds.includes(pos.id));
    const bPositions = columnPositions.filter(pos => bColumnIds.includes(pos.id));
    
    if (aPositions.length === 0 || bPositions.length === 0) return 0;
    
    const aLeftmost = Math.min(...aPositions.map(pos => pos.x));
    const bLeftmost = Math.min(...bPositions.map(pos => pos.x));
    
    return aLeftmost - bLeftmost;
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
          // Find actual span based on column positions
          const leftmost = Math.min(...relevantPositions.map(pos => pos.x));
          const rightmost = Math.max(...relevantPositions.map(pos => pos.x + pos.width));
          
          updatedCategory.x = leftmost;
          updatedCategory.width = Math.max(rightmost - leftmost, MIN_CATEGORY_WIDTH);
          updatedCategory.centerX = leftmost + (updatedCategory.width / 2);
        }
      }
      
      result.push(updatedCategory);
    }
  } else {
    // If columns aren't positioned yet, distribute categories evenly
    const totalCategories = sortedCategories.length;
    
    // Calculate percentage width based on column count with minimum width consideration
    const totalColumns = sortedCategories.reduce((sum, cat) => sum + cat.columns.length, 0);
    const widthThreshold = MIN_CATEGORY_WIDTH / innerWidth;
    
    // Pre-calculate which categories are below threshold
    const categoriesBelowThreshold = new Set<string>();
    for (const cat of sortedCategories) {
      const proportion = cat.columns.length / totalColumns;
      if (proportion < widthThreshold) {
        categoriesBelowThreshold.add(cat.id);
      }
    }
    
    const availableWidth = innerWidth - (MIN_CATEGORY_WIDTH * totalCategories) - ((totalCategories - 1) * segmentSpacing);
    
    // Calculate total columns in categories above threshold once
    const numColumnsInCategoriesAboveThreshold = sortedCategories
      .filter(cat => !categoriesBelowThreshold.has(cat.id))
      .reduce((sum, cat) => sum + cat.columns.length, 0);
    
    // Pre-calculate widths for each category
    const categoryWidths = new Map<string, number>();
    for (const cat of sortedCategories) {
      const proportionOfColumns = cat.columns.length / totalColumns;
      const calculatedWidth = categoriesBelowThreshold.has(cat.id) 
        ? MIN_CATEGORY_WIDTH 
        : MIN_CATEGORY_WIDTH + cat.columns.length * availableWidth / numColumnsInCategoriesAboveThreshold;
      categoryWidths.set(cat.id, calculatedWidth);
    }
    
    // Calculate positions in a single pass
    let currentX = 0;
    for (let i = 0; i < sortedCategories.length; i++) {
      const category = sortedCategories[i];
      const updatedCategory = { ...category };
      const calculatedWidth = categoryWidths.get(category.id) || MIN_CATEGORY_WIDTH;
      
      updatedCategory.x = currentX;
      updatedCategory.width = calculatedWidth;
      updatedCategory.centerX = currentX + (calculatedWidth / 2);
      
      result.push(updatedCategory);
      
      // Update x position for next category
      currentX += calculatedWidth + segmentSpacing;
    }
  }
  
  return result;
}

// Function to calculate segment positions for super categories
export function calculateSuperCategorySegments(
  superCategoryData: SuperCategoryData[],
  categorySegments: CategoryData[]
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
      const leftmost = Math.min(...relevantCategories.map(cat => cat.x || 0));
      const rightmost = Math.max(...relevantCategories.map(cat => (cat.x || 0) + (cat.width || 0)));
      
      updatedSuperCategory.x = leftmost;
      updatedSuperCategory.width = rightmost - leftmost;
      updatedSuperCategory.centerX = leftmost + (rightmost - leftmost) / 2;
    }
    
    return updatedSuperCategory;
  });
}

// Function to render the space-filling segments
export function renderSpaceFillingSegments(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  superCategoryData: SuperCategoryData[],
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  superCategoryY: number,
  categoryY: number,
  categoryColorScale: (id: string) => string
) {
  const { theme, globalQuery, hierarchyHeight } = layoutConfig;
  
  // Create a color scale for super categories
  const superCategoryIds = [...new Set(superCategoryData.map(sc => sc.id))];
  const superCategoryColorScale = getOptimalCategoryColorScale(superCategoryIds);

  // Position the segments
  const positionedCategorySegments = calculateCategorySegments(categoryData, layoutConfig, false);
  const positionedSuperCategorySegments = calculateSuperCategorySegments(superCategoryData, positionedCategorySegments);

  // Create maps for faster lookups during interactions
  const columnsByCategory = new Map<string, string[]>();
  const columnsBySuperCategory = new Map<string, string[]>();
  const categoriesBySuper = new Map<string, string[]>();
  
  // Build lookup maps
  for (const cat of categoryData) {
    const columnIds = cat.columns.map(col => col.id);
    columnsByCategory.set(cat.id, columnIds);
    
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

  // Create super category segments
  const superCategoryGroup = g.append('g')
    .attr('class', 'super-categories');
  
  superCategoryGroup.selectAll('.super-category')
    .data(positionedSuperCategorySegments)
    .enter()
    .append('g')
    .attr('class', 'super-category')
    .attr('id', d => `super-category-${d.id}`)
    .attr('transform', d => `translate(${d.x}, ${superCategoryY})`)
    .each(function(d:any) {
      const group = d3.select(this);
      
      // Segment rectangle
      group.append('rect')
        .attr('width', d.width)
        .attr('height', hierarchyHeight)
        .attr('rx', 3)
        .attr('fill', superCategoryColorScale(d.id))
        .attr('stroke', theme.palette.text.primary)
        .attr('stroke-width', 1);
      
      // Label text
      group.append('text')
        .attr('x', d.width! / 2)
        .attr('y', hierarchyHeight / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', theme.palette.common.white)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', '0.9rem')
        .attr('font-weight', '500')
        .html(highlightText(d.id, globalQuery, theme));
    }).on('mouseover', function(event, d: SuperCategoryData) {
      // Highlight this super category
      d3.select(this)
        .attr('stroke-width', 2.5)
        .attr('stroke-opacity', 1)
        .attr('stroke-dasharray', '0');
      
      // Fade other super categories
      superCategoryData.forEach(sc => {
        if (sc.id !== d.id) {
          g.select(`#super-category-${sc.id}`)
            .attr('opacity', 0.2)
            .select('rect')
            .attr('stroke-width', 1);
        }
      });
      
      // Get related categories and columns
      const relatedCategoryIds = categoriesBySuper.get(d.id) || [];
      const relatedColumnIds = columnsBySuperCategory.get(d.id) || [];
      
      // Highlight related categories
      relatedCategoryIds.forEach(catId => {
        g.select(`#category-${catId}`)
          .attr('opacity', 1)
          .select('rect')
          .attr('stroke-width', 2);
        
        g.select(`category-super-connection-${catId}-${d.id}`).call(applyHighlightStyleOnEdge);
      });
      
      // Fade unrelated categories
      categoryData.forEach(cat => {
        if (!relatedCategoryIds.includes(cat.id)) {
          g.select(`#category-${cat.id}`)
            .attr('opacity', 0.2)
            .select('rect')
            .attr('stroke-width', 1);
          
          g.select(`category-super-connection-${cat.id}-${cat.superCategory}`).call(applyBackgroundStyleOnEdge);
        }
      });
      
      // Highlight related columns
      columnData.forEach(column => {
        if (relatedColumnIds.includes(column.id)) {
          g.select(`#column-${column.id}`).call(applyHighlightOnColumn);
          g.select(`#edge-${column.id}-${column.category}`).call(applyHighlightStyleOnEdge);
        } else {
          g.select(`#column-${column.id}`).call(applyBackgroundStyleOnColumn);
          g.select(`#edge-${column.id}-${column.category}`).call(applyBackgroundStyleOnEdge);
        }
      });
    }).on('mouseout', function(event, d: SuperCategoryData) {
      // Reset all elements
      g.selectAll('.category')
        .attr('opacity', 1)
        .select('rect')
        .attr('stroke-width', 1);
      
      g.selectAll('.super-category')
        .attr('opacity', 1)
        .select('rect')
        .attr('stroke-width', 1);
      
      // Reset all columns and edges
      columnData.forEach(column => {
        g.select(`#column-${column.id}`).call(applyDefaultStyleOnColumn);
        g.select(`#edge-${column.id}-${column.category}`).call(applyDefaultStyleOnEdge);
      });
      
      g.selectAll('.category-super-connection').call(applyDefaultStyleOnEdge);
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
    .attr('transform', d => `translate(${d.x}, ${categoryY})`)
    .each(function(d: any) {
      const group = d3.select(this);
      
      // Segment rectangle
      group.append('rect')
        .attr('width', d.width)
        .attr('height', hierarchyHeight)
        .attr('rx', 2)
        .attr('fill', categoryColorScale(d.id))
        .attr('stroke', theme.palette.text.primary)
        .attr('stroke-width', 1);
      
      // Label text
      group.append('text')
        .attr('x', d.width! / 2)
        .attr('y', hierarchyHeight / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', theme.palette.common.white)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', '0.8rem')
        .html(highlightText(d.id, globalQuery, theme));
    }).on('mouseover', function(event, d: CategoryData) {
      // Highlight this category
      d3.select(this)
        .attr('stroke-width', 2.5)
        .attr('stroke-opacity', 1)
        .attr('stroke-dasharray', '0');
      
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
      // Reset all elements
      g.selectAll('.category')
        .attr('opacity', 1)
        .select('rect')
        .attr('stroke-width', 1);
      
      // Reset all columns and edges
      columnData.forEach(column => {
        g.select(`#column-${column.id}`).call(applyDefaultStyleOnColumn);
        g.select(`#edge-${column.id}-${column.category}`).call(applyDefaultStyleOnEdge);
      });
    });

  // Create connecting lines from categories to super categories
  positionedCategorySegments.forEach(category => {
    const superCategory = positionedSuperCategorySegments.find(sc => sc.id === category.superCategory);
    if (!superCategory || !category.centerX || !superCategory.centerX) return;
    
    g.append('path')
      .attr('id', `category-super-connection-${category.id}-${superCategory.id}`)
      .attr('class', 'category-super-connection')
      .attr('d', `
        M ${category.centerX} ${categoryY + hierarchyHeight}
        C ${category.centerX} ${categoryY + hierarchyHeight + 10},
          ${superCategory.centerX} ${superCategoryY  - 10},
          ${superCategory.centerX} ${superCategoryY}
      `)
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