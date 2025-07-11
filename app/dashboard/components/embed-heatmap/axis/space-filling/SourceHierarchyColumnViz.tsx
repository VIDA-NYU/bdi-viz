import React, { useRef, useEffect, useMemo, useCallback, useContext } from 'react';
import * as d3 from 'd3';
import { useTheme } from '@mui/material';
import { ColumnData, getHierarchyData, LayoutConfig } from './HierarchyUtils';
import { getOptimalCategoryColorScale } from './ColorUtils';
import { TreeNode } from '../../tree/types';
import { calculateCategorySegments, calculateSuperCategorySegments } from './SpaceFillingSegments';
import { CategoryData, SuperCategoryData, highlightText } from './HierarchyUtils.tsx';
import { renderEdgeBundling } from './EdgeBundling';
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';
import { Selection } from 'd3';
import { intelligentTextSplit, shouldDisplayText, getMultiLineTextOffset } from './TextWrappingUtils.ts';

interface SourceHierarchyColumnVizProps {
  sourceTreeData: TreeNode[];
  currentExpanding?: any;
  transform: string;
  hideTooltip: () => void;
}

const MARGIN = { top: 40, right: 20, bottom: 20, left: 70 };

const SourceHierarchyColumnViz: React.FC<SourceHierarchyColumnVizProps> = ({
  sourceTreeData,
  currentExpanding,
  transform,
  hideTooltip,
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
  };

  // Process tree data
  const { columnData, categoryData, superCategoryData } = getHierarchyData(sourceTreeData, layoutConfig);

  console.log("columnData", columnData);

  const columnsX = useMemo(() => 100, []);
  const categoryX = useMemo(() => columnsX + layoutConfig.columnWidth + layoutConfig.columnSpacing, [columnsX, layoutConfig.columnWidth, layoutConfig.columnSpacing]);
  const superCategoryX = useMemo(() => categoryX + layoutConfig.hierarchyWidth + layoutConfig.hierarchySpacing, [categoryX, layoutConfig.hierarchyWidth, layoutConfig.hierarchySpacing]);

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
        width={layoutConfig.innerWidth + MARGIN.left + MARGIN.right}
        height={layoutConfig.innerHeight + MARGIN.top + MARGIN.bottom}
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
        // Add your click handler implementation here
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
  superCategoryY: number,
  categoryY: number,
  categoryColorScale: (id: string) => string,
  selectedNodes: string[],
  setSelectedNodes: (nodes: string[]) => void
) {
  const { theme, globalQuery, hierarchyWidth, hierarchyHeight } = layoutConfig;
  
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
        .attr('width', hierarchyWidth)
        .attr('height', hierarchyHeight)
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
        .attr('x', d.width! / 2)
        .attr('y', hierarchyHeight / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', theme.palette.common.white)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', '0.9rem')
        .attr('font-weight', '500')
        .attr('letter-spacing', '0')
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
    .attr('transform', d => `translate(${d.x}, ${categoryY})`)
    .each(function(d: any) {
      const group = d3.select(this);
      
      // Segment rectangle
      group.append('rect')
        .attr('width', d.width)
        .attr('height', hierarchyHeight)
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
        .attr('x', d.width! / 2)
        .attr('y', hierarchyHeight / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', theme.palette.common.white)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', '0.8rem')
        .attr('font-weight', selectedNodes.includes(d.id) ? '700' : '400')
        .attr('letter-spacing', selectedNodes.includes(d.id) ? '0.3px' : '0')
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

export default SourceHierarchyColumnViz;
