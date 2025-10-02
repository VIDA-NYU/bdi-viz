import { Selection } from 'd3';
import { ColumnData, LayoutConfig, highlightText } from './HierarchyUtils';
import * as d3 from 'd3';
import { intelligentTextSplit, shouldDisplayText, getMultiLineTextOffset } from './TextWrappingUtils.ts';

// Enum for orientation types
export enum ColumnOrientation {
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical'
}

// Function to render the columns with orientation support
export function renderColumns(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  layoutConfig: LayoutConfig,
  columnsPosition: number,
  currentExpanding: any,
  categoryColorScale: (id: string) => string,
  globalQuery?: string,
  orientation: ColumnOrientation = ColumnOrientation.HORIZONTAL,
  setSourceColumns?: (columns: string[]) => void
) {
  const { theme, columnHeight, columnWidth } = layoutConfig;

  // Typography settings
  const typography = {
    fontSize: 10,
    lineHeight: 14,
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
      cornerRadius: 6,
      opacity: 0.9,
      offsetY: 24
    }
  };

  // Calculate column positions based on orientation
  const positionedColumns = columnData.map((column) => {
    if (orientation === ColumnOrientation.HORIZONTAL) {
      return {
        ...column,
        x: column.originalNode.x || 0,
        y: columnsPosition,
        width: column.originalNode.width || 100,
        height: columnHeight
      };
    } else {
      return {
        ...column,
        x: columnsPosition,
        y: column.originalNode.y || 0,
        width: columnWidth,
        height: column.originalNode.height || 100
      };
    }
  });

  // Create column group with appropriate transform
  const columnGroup = g.append('g')
    .attr('class', 'columns')
    .attr('transform', orientation === ColumnOrientation.HORIZONTAL 
      ? `translate(0, ${columnsPosition})`
      : `translate(${columnsPosition}, 0)`);
  
  // Add column rectangles and labels
  columnGroup.selectAll('.column')
    .data(positionedColumns)
    .enter()
    .append('g')
    .attr('class', 'column')
    .attr('id', d => `column-${d.id}`)
    .attr('transform', d => orientation === ColumnOrientation.HORIZONTAL 
      ? `translate(${d.x}, 0)`
      : `translate(0, ${d.y})`)
    .each(function(d) {
      const group = d3.select(this);
      const columnWidth = d.width || 100;
      const columnHeight = d.height || 100;
      
      // Main rectangle
      group.append('rect')
        .attr('width', columnWidth)
        .attr('height', columnHeight)
        .attr('rx', styles.column.cornerRadius)
        .attr('fill', styles.column.fill)
        .attr('stroke', categoryColorScale(d.category.id))
        .attr('stroke-width', styles.column.strokeWidth);
      
      // Category indicator bar
      group.append('rect')
        .attr('x', styles.categoryIndicator.margin)
        .attr('y', styles.categoryIndicator.margin)
        .attr('width', styles.categoryIndicator.width)
        .attr('height', columnHeight - (styles.categoryIndicator.margin * 2))
        .attr('rx', styles.categoryIndicator.cornerRadius)
        .attr('fill', categoryColorScale(d.category.id))
        .attr('opacity', styles.categoryIndicator.opacity);
      
      // Calculate available text width
      const availableTextWidth = orientation === ColumnOrientation.HORIZONTAL 
        ? columnWidth - (typography.textPadding + styles.categoryIndicator.width + styles.categoryIndicator.margin)
        : columnWidth;
      
      const maxLines = (columnHeight - typography.textPadding) / typography.lineHeight;
      // Check if we should display text or not
      if (shouldDisplayText(availableTextWidth, typography.fontSize, typography.minCharsPerLine, maxLines)) {
        const { lines, isTruncated } = intelligentTextSplit(
          d.name, 
          availableTextWidth - typography.textPadding, 
          typography.fontSize,
          maxLines
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
      g.select(`#category-${d.category.id}`)
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
      const columnHeight = d.height || 100;
      
      // Background rectangle
      const tooltipBg = tooltip.append('rect')
        .attr('fill', theme.palette.grey[600])
        .attr('rx', styles.tooltip.cornerRadius)
        .attr('opacity', styles.tooltip.opacity)
        .attr('filter', 'drop-shadow(0 2px 8px rgba(0,0,0,0.25))');
      
      // Text element
      const tooltipText = tooltip.append('text')
        .attr('x', styles.tooltip.padding.x)
        .attr('y', styles.tooltip.padding.y + 10)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', `${typography.tooltipFontSize}px`)
        .attr('fill', theme.palette.common.white)
        .text(d.name);
      
      // Get the text bounding box to size the rectangle
      const textBox = (tooltipText.node() as SVGTextElement).getBBox();
      
      // Position and size the background rectangle
      const rectW = textBox.width + (styles.tooltip.padding.x * 2);
      const rectH = textBox.height + (styles.tooltip.padding.y * 2);
      tooltipBg
        .attr('width', rectW)
        .attr('height', rectH);
      
      // Position the tooltip based on orientation
      if (orientation === ColumnOrientation.HORIZONTAL) {
        // Position above the column
        tooltip.attr('transform', `translate(${d.x + columnWidth / 2 - (textBox.width + styles.tooltip.padding.x * 2) / 2}, ${columnsPosition - styles.tooltip.offsetY})`);
      } else {
        // Position to the right of the column
        tooltip.attr('transform', `translate(${d.x + columnWidth / 2 - (textBox.width + styles.tooltip.padding.x * 2) / 2}, ${d.y + columnHeight})`);
      }
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
        
        // Call setSourceColumns if provided (for vertical orientation)
        if (setSourceColumns) {
          setSourceColumns([d.name]);
        }
      }
    });

  return {
    positionedColumns
  };
}

// Legacy function for backward compatibility - horizontal orientation
export function renderColumnsHorizontal(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  layoutConfig: LayoutConfig,
  columnsY: number,
  currentExpanding: any,
  categoryColorScale: (id: string) => string,
  globalQuery?: string
) {
  return renderColumns(
    g,
    columnData,
    layoutConfig,
    columnsY,
    currentExpanding,
    categoryColorScale,
    globalQuery,
    ColumnOrientation.HORIZONTAL
  );
}

// Legacy function for backward compatibility - vertical orientation
export function renderColumnsVertical(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  layoutConfig: LayoutConfig,
  columnsX: number,
  currentExpanding: any,
  categoryColorScale: (id: string) => string,
  setSourceColumns: (columns: string[]) => void,
  globalQuery?: string
) {
  return renderColumns(
    g,
    columnData,
    layoutConfig,
    columnsX,
    currentExpanding,
    categoryColorScale,
    globalQuery,
    ColumnOrientation.VERTICAL,
    setSourceColumns
  );
}