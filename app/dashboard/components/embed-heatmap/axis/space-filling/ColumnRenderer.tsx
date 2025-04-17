import { Selection } from 'd3';
import { ColumnData, LayoutConfig, highlightText } from './HierarchyUtils';
import * as d3 from 'd3';
import { intelligentTextSplit, shouldDisplayText, getMultiLineTextOffset } from './TextWrappingUtils.ts';
import { getOptimalCategoryColorScale } from './ColorUtils';

// Function to render the columns
export function renderColumns(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  layoutConfig: LayoutConfig,
  columnsY: number,
  currentExpanding: any,
  categoryColorScale: (id: string) => string,
  globalQuery?: string,
) {
  const { theme, columnHeight } = layoutConfig;
  
  // Typography settings
  const typography = {
    fontSize: 10,
    lineHeight: 14,
    maxLines: 3,
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
      offsetY: 40
    }
  };

  // Calculate column positions - use the original node's x position and width
  const positionedColumns = columnData.map((column) => ({
    ...column,
    x: column.originalNode.x || 0,
    y: columnsY,
    width: column.originalNode.width || 100,
    height: columnHeight
  }));

  // Create column group
  const columnGroup = g.append('g')
    .attr('class', 'columns')
    .attr('transform', `translate(0, ${columnsY})`);
  
  // Add column rectangles and labels
  columnGroup.selectAll('.column')
    .data(positionedColumns)
    .enter()
    .append('g')
    .attr('class', 'column')
    .attr('id', d => `column-${d.id}`)
    .attr('transform', d => `translate(${d.x}, 0)`)
    .each(function(d) {
      const group = d3.select(this);
      const columnWidth = d.width || 100;
      
      // Main rectangle
      group.append('rect')
        .attr('width', columnWidth)
        .attr('height', columnHeight)
        .attr('rx', styles.column.cornerRadius)
        .attr('fill', styles.column.fill)
        .attr('stroke', categoryColorScale(d.category))
        .attr('stroke-width', styles.column.strokeWidth);
      
      // Category indicator bar
      group.append('rect')
        .attr('x', styles.categoryIndicator.margin)
        .attr('y', styles.categoryIndicator.margin)
        .attr('width', styles.categoryIndicator.width)
        .attr('height', columnHeight - (styles.categoryIndicator.margin * 2))
        .attr('rx', styles.categoryIndicator.cornerRadius)
        .attr('fill', categoryColorScale(d.category))
        .attr('opacity', styles.categoryIndicator.opacity);
      
      // Calculate available text width
      const availableTextWidth = columnWidth - (typography.textPadding + styles.categoryIndicator.width + styles.categoryIndicator.margin);
      
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
          .attr('transform', `translate(${typography.textPadding}, ${columnHeight / 2})`);
        
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
            .html(globalQuery ? highlightText(line, globalQuery, theme) : line);
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
      tooltip.attr('transform', `translate(${d.x + columnWidth / 2 - (textBox.width + styles.tooltip.padding.x * 2) / 2}, ${columnsY - styles.tooltip.offsetY})`);
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