import React, { useRef, useEffect, useMemo, useCallback, useContext } from 'react';
import * as d3 from 'd3';
import { useTheme } from '@mui/material';
import { ColumnData, getHierarchyData, LayoutConfig } from './HierarchyUtils';
import { getOptimalCategoryColorScale } from './ColorUtils';
import { TreeNode } from '../../tree/types';
import { CategoryData, SuperCategoryData, highlightText } from './HierarchyUtils.tsx';
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';
import { Selection } from 'd3';
import { intelligentTextSplit, shouldDisplayText, getMultiLineTextOffset } from './TextWrappingUtils.ts';
import { applyDefaultStyleOnColumn, applyDefaultStyleOnEdge } from './InteractionUtils.ts';

interface SourceHierarchyColumnVizProps {
  sourceTreeData: TreeNode[];
  currentExpanding?: any;
  transform: string;
  hideTooltip: () => void;
  setSourceColumn: (column: string) => void;
}

const MARGIN = { top: 40, right: 20, bottom: 20, left: 70 };

const SourceHierarchyColumnViz: React.FC<SourceHierarchyColumnVizProps> = ({
  sourceTreeData,
  currentExpanding,
  transform,
  hideTooltip,
  setSourceColumn,
}) => {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const { globalQuery, selectedNodes, setSelectedNodes } = useContext(HighlightGlobalContext);

  // Layout config for vertical orientation
  const layoutConfig = {
    innerWidth: 200,
    innerHeight: 600,
    columnHeight: 50,
    columnWidth: 80,
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
    renderSpaceFillingSegments(
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
      selectedNodes,
      setSelectedNodes
    );

    renderEdgeBundling(
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

    renderColumns(
      g, 
      columnData, 
      layoutConfig, 
      columnsX, 
      currentExpanding,
      categoryColorScale,
      setSourceColumn,
      globalQuery,
    );
  }, [sourceTreeData, layoutConfig, columnData, superCategoryData, categoryData, categoryColorScale, selectedNodes, setSelectedNodes, globalQuery, currentExpanding]);

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



// Function to render the columns
function renderColumns(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  layoutConfig: LayoutConfig,
  columnsX: number,
  currentExpanding: any,
  categoryColorScale: (id: string) => string,
  setSourceColumn: (column: string) => void,
  globalQuery?: string,
) {
  const { theme } = layoutConfig;
  
  // Typography settings
  const typography = {
    fontSize: 10,
    lineHeight: 14,
    maxLines: 2,
    minCharsPerLine: 3,
    textPadding: 12,
    tooltipFontSize: 12
  };
  
  // Style settings
  const styles = {
    column: {
      cornerRadius: 3,
      strokeWidth: 1,
      hoverStrokeWidth: 2,
      fill: 'white'
    },
    categoryIndicator: {
      width: 5,
      margin: 3,
      cornerRadius: 1,
      opacity: 0.7
    },
    path: {
      normalWidth: 1.5,
      highlightWidth: 2.5,
      normalOpacity: 0.7,
      fadedOpacity: 0.2,
      dashArray: '3,3'
    },
    tooltip: {
      padding: { x: 8, y: 6 },
      cornerRadius: 3,
      opacity: 0.9,
    }
  };

  // Calculate column positions - use the original node's x position and width
  const positionedColumns = columnData.map((column) => ({
    ...column,
    x: columnsX,
    y: column.y || 0,
    width: column.width || 100,
    height: column.height || 100
  }));

  // Create column group
  const columnGroup = g.append('g')
    .attr('class', 'columns')
    .attr('transform', `translate(${columnsX}, 0)`);
  
  // Add column rectangles and labels
  columnGroup.selectAll('.column')
    .data(positionedColumns)
    .enter()
    .append('g')
    .attr('class', 'column')
    .attr('id', d => `column-${d.id}`)
    .attr('transform', d => `translate(0, ${d.y})`)
    .each(function(d) {
      const group = d3.select(this);
      const columnWidth = d.width || 100;
      
      // Main rectangle
      group.append('rect')
        .attr('width', columnWidth)
        .attr('height', d.height)
        .attr('rx', styles.column.cornerRadius)
        .attr('fill', styles.column.fill)
        .attr('stroke', categoryColorScale(d.category))
        .attr('stroke-width', styles.column.strokeWidth);
      
      // Category indicator bar
      group.append('rect')
        .attr('x', styles.categoryIndicator.margin)
        .attr('y', styles.categoryIndicator.margin)
        .attr('width', styles.categoryIndicator.width)
        .attr('height', d.height - (styles.categoryIndicator.margin * 2))
        .attr('rx', styles.categoryIndicator.cornerRadius)
        .attr('fill', categoryColorScale(d.category))
        .attr('opacity', styles.categoryIndicator.opacity);
      
      // Calculate available text width
      const availableTextWidth = columnWidth;
      
      // Check if we should display text or not
      if (shouldDisplayText(availableTextWidth, typography.fontSize, typography.minCharsPerLine, typography.maxLines)) {
        const { lines, isTruncated } = intelligentTextSplit(
          d.name, 
          availableTextWidth, 
          typography.fontSize,
          typography.maxLines
        );
        
        // Create a group for text lines
        const textGroup = group.append('g')
          .attr('class', 'column-text')
          .attr('transform', `translate(${typography.textPadding}, ${d.height / 2})`);
        
        // Add each line of text
        lines.forEach((line, i) => {
          // Center the text block vertically
          const yOffset = i * typography.lineHeight - getMultiLineTextOffset(lines.length, typography.lineHeight);
          
          textGroup.append('text')
            .attr('y', yOffset)
            .attr('dy', '0.35em') // Vertical alignment
            .attr('text-anchor', 'start')
            .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
            .attr('font-size', `${typography.fontSize}px`)
            .attr('fill', theme.palette.text.primary)
            .html(line);
        });
      }
    })
    .on('mouseover', function(event, d) {
      // Highlight this column
      d3.select(this)
        .select('rect')
        .attr('stroke-width', styles.column.hoverStrokeWidth);
      
      // Highlight the related paths
      g.selectAll('.column-category-path')
        .filter(path => (path as any)?.column?.id === d.id)
        .attr('stroke-width', styles.path.highlightWidth)
        .attr('stroke-opacity', 1)
        .attr('stroke-dasharray', '0');
      
      // Highlight the category
      g.select(`#category-${d.category}`)
        .select('rect')
        .attr('stroke-width', styles.column.hoverStrokeWidth);
      
      // Fade other paths
      g.selectAll('.column-category-path')
        .filter(path => (path as any)?.column?.id !== d.id)
        .attr('stroke-opacity', styles.path.fadedOpacity);
      
      // Create tooltip
      const tooltip = g.append('g')
        .attr('class', 'column-tooltip')
        .attr('pointer-events', 'none');
      
      const columnWidth = d.width || 100;
      
      // Background rectangle
      const tooltipBg = tooltip.append('rect')
        .attr('fill', styles.column.fill)
        .attr('stroke', theme.palette.divider)
        .attr('rx', styles.tooltip.cornerRadius)
        .attr('opacity', styles.tooltip.opacity);
      
      // Text element
      const tooltipText = tooltip.append('text')
        .attr('x', styles.tooltip.padding.x)
        .attr('y', styles.tooltip.padding.y * 2)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', `${typography.tooltipFontSize}px`)
        .attr('fill', theme.palette.text.primary)
        .text(d.name);
      
      // Get the text bounding box to size the rectangle
      const textBox = (tooltipText.node() as SVGTextElement).getBBox();
      
      // Position and size the background rectangle
      tooltipBg
        .attr('width', textBox.width + (styles.tooltip.padding.x * 2))
        .attr('height', textBox.height + (styles.tooltip.padding.y * 2));
      
      // Position the tooltip - above the column
      tooltip.attr('transform', `translate(${d.x + columnWidth / 2 - (textBox.width + styles.tooltip.padding.x * 2) / 2}, ${d.y + d.height})`);
    })
    .on('mouseout', function() {
      // Reset all elements
      g.selectAll('.column rect')
        .attr('stroke-width', styles.column.strokeWidth);
      
      g.selectAll('.category rect')
        .attr('stroke-width', styles.column.strokeWidth);
      
      g.selectAll('.column-category-path')
        .attr('stroke-width', styles.path.normalWidth)
        .attr('stroke-opacity', styles.path.normalOpacity)
        .attr('stroke-dasharray', styles.path.dashArray);
      
      g.select('.column-tooltip').remove();
    })
    .on('click', function(event, d) {
      // Dispatch event or handle column click
      if (d.originalNode && typeof d.originalNode.isExpanded !== 'undefined') {
        console.log('Column clicked:', d.name);
        setSourceColumn(d.name);
      }
    });

  return {
    positionedColumns
  };
}



// Function to render the space-filling segments
export function renderSpaceFillingSegments(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  superCategoryData: SuperCategoryData[],
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  superCategoryX: number,
  categoryX: number,
  categoryColorScale: (id: string) => string,
  selectedNodes: string[],
  setSelectedNodes: (nodes: string[]) => void
) {
  const { theme, globalQuery } = layoutConfig;
  
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

  const hierarchyWidth = 20;
  const hierarchyHeight = 100;
  
  superCategoryGroup.selectAll('.super-category')
    .data(positionedSuperCategorySegments)
    .enter()
    .append('g')
    .attr('class', 'super-category')
    .attr('id', d => `super-category-${d.id}`)
    .attr('transform', d => `translate(${superCategoryX}, ${d.y})`)
    .each(function(d:any) {
      const group = d3.select(this);
      
      // Segment rectangle
      group.append('rect')
        .attr('width', hierarchyWidth)
        .attr('height', d.height)
        .attr('rx', 3)
        .attr('fill', (() => {
          const color = d3.color(superCategoryColorScale(d.id));
          return color ? color.darker(0).toString() : superCategoryColorScale(d.id);
        })())
        .attr('stroke', theme.palette.text.primary)
        .attr('stroke-width', 1)
        .style('cursor', 'pointer');
      
      // Label text
      group.append('text')
        .attr('x', -d.height / 2)
        .attr('y', hierarchyWidth / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', theme.palette.common.white)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', '0.8rem')
        .attr('font-weight', '500')
        .attr('letter-spacing', '0')
        .attr('transform', `rotate(-90)`)
        .html(highlightText(d.id, globalQuery, theme));
    })
    .on('click', function(event, d: SuperCategoryData) {
      // Get child categories
      const childCategories = categoriesBySuper.get(d.id) || [];
      
      // Toggle selection of child categories
      const allChildrenSelected = childCategories.every(catId => selectedNodes.includes(catId));
      
      if (allChildrenSelected) {
        // Remove all child categories from selection
        setSelectedNodes(selectedNodes.filter(node => !childCategories.includes(node)));
      } else {
        // Add all child categories to selection
        setSelectedNodes([...selectedNodes, ...childCategories]);
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
    .attr('transform', d => `translate(${categoryX}, ${d.y})`)
    .each(function(d: any) {
      const group = d3.select(this);
      
      // Segment rectangle
      group.append('rect')
        .attr('width', hierarchyWidth)
        .attr('height', d.height)
        .attr('rx', 2)
        .attr('fill', (() => {
          const color = d3.color(categoryColorScale(d.id));
          return color ? color.darker(selectedNodes.includes(d.id) ? 0.4 : 0).toString() : categoryColorScale(d.id);
        })())
        .attr('stroke', selectedNodes.includes(d.id) ? theme.palette.primary.main : theme.palette.text.primary)
        .attr('stroke-width', selectedNodes.includes(d.id) ? 3 : 1)
        .style('cursor', 'pointer');
      
      // Label text
      group.append('text')
        .attr('x', -d.height / 2)
        .attr('y', hierarchyWidth / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', theme.palette.common.white)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', '0.7rem')
        .attr('font-weight', selectedNodes.includes(d.id) ? '700' : '400')
        .attr('letter-spacing', selectedNodes.includes(d.id) ? '0.3px' : '0')
        .attr('transform', `rotate(-90)`)
        .html(highlightText(d.id, globalQuery, theme));
    })
    .on('click', function(event, d: CategoryData) {
      // Toggle selection of this category
      const isSelected = selectedNodes.includes(d.id);
      
      if (isSelected) {
        setSelectedNodes(selectedNodes.filter(node => node !== d.id));
      } else {
        setSelectedNodes([...selectedNodes, d.id]);
      }
      
      // Update visual state
      d3.select(this)
        .select('rect')
        .attr('stroke-width', isSelected ? 1 : 3)
        .attr('stroke', isSelected ? theme.palette.text.primary : theme.palette.primary.main);
    })
    .on('mouseover', function(event, d: CategoryData) {
      const isSelected = selectedNodes.includes(d.id);
      
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
      if (!selectedNodes.includes(d.id)) {
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
    if (!superCategory || !category.centerY || !superCategory.centerY) return;
    
    g.append('path')
      .attr('id', `category-super-connection-${category.id}-${superCategory.id}`)
      .attr('class', 'category-super-connection')
      .attr('d', `
        M ${superCategoryX + 20} ${superCategory.centerY}
        C ${superCategoryX + 30} ${superCategory.centerY},
          ${categoryX - 10} ${category.centerY},
          ${categoryX} ${category.centerY}
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

// Function to calculate segment positions for categories
export function calculateCategorySegments(
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  columnsPositioned: boolean,
  columnPositions?: { id: string; y: number; height: number; }[]
): CategoryData[] {
  const { innerHeight, segmentSpacing } = layoutConfig;
  const MIN_CATEGORY_HEIGHT = 20; // Minimum height for category to ensure text fits
  
  // First, sort categories based on their topmost column position
  const sortedCategories = [...categoryData].sort((a, b) => {
    if (!columnsPositioned || !columnPositions) return 0;
    
    // Find topmost column for each category
    const aColumnIds = a.columns.map(col => col.id);
    const bColumnIds = b.columns.map(col => col.id);
    
    const aPositions = columnPositions.filter(pos => aColumnIds.includes(pos.id));
    const bPositions = columnPositions.filter(pos => bColumnIds.includes(pos.id));
    
    if (aPositions.length === 0 || bPositions.length === 0) return 0;
    
    const aTopmost = Math.min(...aPositions.map(pos => pos.y));
    const bTopmost = Math.min(...bPositions.map(pos => pos.y));
    
    return aTopmost - bTopmost;
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
          const topmost = Math.min(...relevantPositions.map(pos => pos.y));
          const bottommost = Math.max(...relevantPositions.map(pos => pos.y + pos.height));
          
          updatedCategory.y = topmost;
          updatedCategory.height = Math.max(bottommost - topmost, MIN_CATEGORY_HEIGHT);
          updatedCategory.centerY = topmost + (updatedCategory.height / 2);
        }
      }
      
      result.push(updatedCategory);
    }
  } else {
    // If columns aren't positioned yet, distribute categories evenly
    const totalCategories = sortedCategories.length;
    
    // Calculate percentage width based on column count with minimum width consideration
    const totalColumns = sortedCategories.reduce((sum, cat) => sum + cat.columns.length, 0);
    const widthThreshold = MIN_CATEGORY_HEIGHT / innerHeight;
    
    // Pre-calculate which categories are below threshold
    const categoriesBelowThreshold = new Set<string>();
    for (const cat of sortedCategories) {
      const proportion = cat.columns.length / totalColumns;
      if (proportion < widthThreshold) {
        categoriesBelowThreshold.add(cat.id);
      }
    }
    
    const availableHeight = innerHeight - (MIN_CATEGORY_HEIGHT * totalCategories) - ((totalCategories - 1) * segmentSpacing);
    
    // Calculate total columns in categories above threshold once
    const numColumnsInCategoriesAboveThreshold = sortedCategories
      .filter(cat => !categoriesBelowThreshold.has(cat.id))
      .reduce((sum, cat) => sum + cat.columns.length, 0);
    
    // Pre-calculate widths for each category
    const categoryWidths = new Map<string, number>();
    for (const cat of sortedCategories) {
      const proportionOfColumns = cat.columns.length / totalColumns;
      const calculatedWidth = categoriesBelowThreshold.has(cat.id) 
        ? MIN_CATEGORY_HEIGHT 
        : MIN_CATEGORY_HEIGHT + cat.columns.length * availableHeight / numColumnsInCategoriesAboveThreshold;
      categoryWidths.set(cat.id, calculatedWidth);
    }
    
    // Calculate positions in a single pass
    let currentY = 0;
    for (let i = 0; i < sortedCategories.length; i++) {
      const category = sortedCategories[i];
      const updatedCategory = { ...category };
      const calculatedHeight = categoryWidths.get(category.id) || MIN_CATEGORY_HEIGHT;
      
      updatedCategory.y = currentY;
      updatedCategory.height = calculatedHeight;
      updatedCategory.centerY = currentY + (calculatedHeight / 2);
      
      result.push(updatedCategory);
      
      // Update y position for next category
      currentY += calculatedHeight + segmentSpacing;
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
      const topmost = Math.min(...relevantCategories.map(cat => cat.y || 0));
      const bottommost = Math.max(...relevantCategories.map(cat => (cat.y || 0) + (cat.height || 0)));
      
      updatedSuperCategory.y = topmost;
      updatedSuperCategory.height = bottommost - topmost;
      updatedSuperCategory.centerY = topmost + (updatedSuperCategory.height / 2);
    }
    
    return updatedSuperCategory;
  });
}



// Main function to render the edge bundling
export function renderEdgeBundling(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  categoryData: CategoryData[],
  layoutConfig: LayoutConfig,
  columnsX: number,
  categoryX: number,
  categoryColorScale: (id: string) => string
) {
  // Position columns and categories - memoize these calculations
  const positionedColumns = columnData.map((column) => ({
    ...column,
    x: columnsX,
    y: column.originalNode.y || 0,
    width: layoutConfig.columnWidth,
    height: column.originalNode.height || 100,
  }));
  
  const positionedCategories = calculateCategorySegments(categoryData, layoutConfig, false);

  // Create paths - do this once and cache the result
  const bundledPaths = createBundledPaths(
    positionedColumns,
    positionedCategories,
    columnsX,
    categoryX,
    layoutConfig
  );

  console.log('bundledPaths', bundledPaths);

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


// Create the bundled paths from columns to categories
interface BundledPath {
  id: string;
  path: string;
  column: ColumnData;
  category: CategoryData;
}

function createBundledPaths(
  positionedColumns: ColumnData[],
  positionedCategories: CategoryData[],
  columnsX: number,
  categoryX: number,
  layoutConfig: LayoutConfig
): BundledPath[] {
  const { columnWidth } = layoutConfig;
  const controlPointOffsetX = (columnsX - categoryX) * 0.5;
  
  // Create a lookup map for faster category access
  const categoryMap = new Map(positionedCategories.map(cat => [cat.id, cat]));
  
  // Pre-calculate paths in a single pass
  return positionedColumns
    .map(column => {
      const category = categoryMap.get(column.category);
      if (!category || !category.centerY) return null;
      
      const startX = column.x!;
      const startY = column.y! + column.height! / 2;
      const endX = categoryX + 20;
      const endY = category.centerY!;
      
      // Create bundled path with S-curve to give bundling effect
      // Use template literal only once for better performance
      const path = `M ${startX} ${startY} C ${startX} ${startY - controlPointOffsetX * 0.3}, ${endX} ${endY + controlPointOffsetX * 0.7}, ${endX} ${endY}`;
      
      return {
        id: `edge-${column.id}-${category.id}`,
        column,
        category,
        path
      };
    })
    .filter(Boolean) as BundledPath[];
}

export default SourceHierarchyColumnViz;
