import { Selection } from 'd3';
import { CategoryData, ColumnData, LabeledNode, LayoutConfig, NodeData, highlightText } from './HierarchyUtils.tsx';
import * as d3 from 'd3';
import { getOptimalCategoryColorScale } from './ColorUtils.ts';
import { 
  applyDefaultStyleOnColumn,
  applyDefaultStyleOnEdge,
  applyDefaultStyleOnNode,
  applyHighlightStyleOnNode,
  applyBackgroundStyleOnNode,
  applyHighlightStyleOnColumn,
  applyBackgroundStyleOnEdge,
  applyHighlightStyleOnEdge,
  applyBackgroundStyleOnColumn,
  applyBackgroundStyleOnCategory,
  applyHighlightStyleOnCategory,
  applyDefaultStyleOnCategory
} from './InteractionUtils.ts';

// Enum for orientation types
export enum SpaceFillingOrientation {
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical'
}

// Function to calculate segment positions for categories
export function calculateNodeSegments(
  nodeData: NodeData[],
  layoutConfig: LayoutConfig,
  columnsPositioned: boolean,
  columnPositions?: { id: string; x?: number; y?: number; width?: number; height?: number; }[],
  orientation: SpaceFillingOrientation = SpaceFillingOrientation.HORIZONTAL
): NodeData[] {
  const { innerWidth, innerHeight, segmentSpacing } = layoutConfig;
  const MIN_CATEGORY_SIZE = orientation === SpaceFillingOrientation.HORIZONTAL ? 80 : 20; // Minimum size for category to ensure text fits
  const containerSize = orientation === SpaceFillingOrientation.HORIZONTAL ? innerWidth : innerHeight;
  
  // First, sort categories based on their leftmost/topmost column position
  const sortedNodes = [...nodeData].sort((a, b) => {
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
  const result: NodeData[] = [];
  
  if (columnsPositioned && columnPositions) {
    // Calculate based on column positions
    for (const node of sortedNodes) {
      const updatedNode = { ...node };
      
      // Get columns for this category
      const nodeColumns = node.columns;
      if (nodeColumns.length > 0) {
        const columnIds = nodeColumns.map(col => col.id);
        const relevantPositions = columnPositions.filter(pos => columnIds.includes(pos.id));
        
        if (relevantPositions.length > 0) {
          if (orientation === SpaceFillingOrientation.HORIZONTAL) {
            // Find actual span based on column positions
            const leftmost = Math.min(...relevantPositions.map(pos => pos.x || 0));
            const rightmost = Math.max(...relevantPositions.map(pos => (pos.x || 0) + (pos.width || 0)));
            
            updatedNode.x = leftmost;
            updatedNode.width = Math.max(rightmost - leftmost, MIN_CATEGORY_SIZE);
            updatedNode.centerX = leftmost + (updatedNode.width / 2);
          } else {
            // Find actual span based on column positions
            const topmost = Math.min(...relevantPositions.map(pos => pos.y || 0));
            const bottommost = Math.max(...relevantPositions.map(pos => (pos.y || 0) + (pos.height || 0)));
            
            updatedNode.y = topmost;
            updatedNode.height = Math.max(bottommost - topmost, MIN_CATEGORY_SIZE);
            updatedNode.centerY = topmost + (updatedNode.height / 2);
          }
        }
      }
      
      result.push(updatedNode);
    }
  } else {
    // If columns aren't positioned yet, distribute categories evenly
    const totalCategories = sortedNodes.length;
    
    // Calculate percentage size based on column count with minimum size consideration
    const totalColumns = sortedNodes.reduce((sum, cat) => sum + cat.columns.length, 0);
    const sizeThreshold = MIN_CATEGORY_SIZE / containerSize;
    
    // Pre-calculate which categories are below threshold
    const categoriesBelowThreshold = new Set<string>();
    for (const cat of sortedNodes) {
      const proportion = cat.columns.length / totalColumns;
      if (proportion < sizeThreshold) {
        categoriesBelowThreshold.add(cat.id);
      }
    }
    
    const availableSize = containerSize - (MIN_CATEGORY_SIZE * totalCategories) - ((totalCategories - 1) * segmentSpacing);
    
    // Calculate total columns in categories above threshold once
    const numColumnsInCategoriesAboveThreshold = sortedNodes
      .filter(node => !categoriesBelowThreshold.has(node.id))
      .reduce((sum, node) => sum + node.columns.length, 0);
    
    // Pre-calculate sizes for each category
    const categorySizes = new Map<string, number>();
    for (const node of sortedNodes) {
      const calculatedSize = categoriesBelowThreshold.has(node.id) 
        ? MIN_CATEGORY_SIZE 
        : MIN_CATEGORY_SIZE + node.columns.length * availableSize / numColumnsInCategoriesAboveThreshold;
      categorySizes.set(node.id, calculatedSize);
    }
    
    // Calculate positions in a single pass
    let currentPosition = 0;
    for (let i = 0; i < sortedNodes.length; i++) {
      const node = sortedNodes[i];
      const updatedNode = { ...node };
      const calculatedSize = categorySizes.get(node.id) || MIN_CATEGORY_SIZE;
      
      if (orientation === SpaceFillingOrientation.HORIZONTAL) {
        updatedNode.x = currentPosition;
        updatedNode.width = calculatedSize;
        updatedNode.centerX = currentPosition + (calculatedSize / 2);
      } else {
        updatedNode.y = currentPosition;
        updatedNode.height = calculatedSize;
        updatedNode.centerY = currentPosition + (calculatedSize / 2);
      }
      
      result.push(updatedNode);
      
      // Update position for next category
      currentPosition += calculatedSize + segmentSpacing;
    }
  }
  
  return result;
}

// Function to calculate segment positions for categories
export function calculateCategorySegments(
  categoryData: CategoryData[],
  nodeSegments: NodeData[],
  orientation: SpaceFillingOrientation = SpaceFillingOrientation.HORIZONTAL
): CategoryData[] {
  // Create a map to group categories by category for faster lookup
  const nodesByCategory = new Map<string, NodeData[]>();
  
  for (const node of nodeSegments) {
    if (!node.category) continue;
    
    if (!nodesByCategory.has(node.category.id)) {
      nodesByCategory.set(node.category.id, []);
    }
    nodesByCategory.get(node.category.id)!.push(node);
  }
  
  return categoryData.map(category => {
    const updatedCategory = { ...category };
    const relevantNodes = nodesByCategory.get(category.id) || [];
    
    if (relevantNodes.length > 0) {
      if (orientation === SpaceFillingOrientation.HORIZONTAL) {
        const leftmost = Math.min(...relevantNodes.map(node => node.x || 0));
        const rightmost = Math.max(...relevantNodes.map(node => (node.x || 0) + (node.width || 0)));
        
        updatedCategory.x = leftmost;
        updatedCategory.width = rightmost - leftmost;
        updatedCategory.centerX = leftmost + (rightmost - leftmost) / 2;
      } else {
        const topmost = Math.min(...relevantNodes.map(node => node.y || 0));
        const bottommost = Math.max(...relevantNodes.map(node => (node.y || 0) + (node.height || 0)));
        
        updatedCategory.y = topmost;
        updatedCategory.height = bottommost - topmost;
        updatedCategory.centerY = topmost + (updatedCategory.height / 2);
      }
    }
    
    return updatedCategory;
  });
}

// Function to render the space-filling segments with orientation support
export function renderSpaceFillingSegments(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  categoryData: CategoryData[],
  nodeData: NodeData[],
  layoutConfig: LayoutConfig,
  categoryPosition: number,
  nodePosition: number,
  nodeColorScale: (id: string) => string,
  selectedNodes: SelectedNode[],
  setSelectedNodes: (nodes: SelectedNode[]) => void,
  orientation: SpaceFillingOrientation = SpaceFillingOrientation.HORIZONTAL
) {
  const { theme, globalQuery, hierarchyHeight } = layoutConfig;
  
  // Create a color scale for categories
  const categoryIds = [...new Set(categoryData.map(category => category.id))];
  const categoryColorScale = getOptimalCategoryColorScale(categoryIds);

  // Position the segments
  const positionedNodeSegments = calculateNodeSegments(nodeData, layoutConfig, false, undefined, orientation);
  const positionedCategorySegments = calculateCategorySegments(categoryData, positionedNodeSegments, orientation);

  // Create maps for faster lookups during interactions
  const columnsByNodeId = new Map<string, LabeledNode[]>();
  const columnsByCategoryId = new Map<string, LabeledNode[]>();
  const nodesByCategoryId = new Map<string, LabeledNode[]>();

  // Convert SelectedNodes to string list for faster lookups
  const selectedNodesStringList = selectedNodes.map(node => node.node);
  
  // Build lookup maps
  for (const node of nodeData) {
    const columns = node.columns.map(col => ({
      id: col.id,
      name: col.name
    }));
    columnsByNodeId.set(node.id, columns);
    
    if (node.category) {
      if (!nodesByCategoryId.has(node.category.id)) {
        nodesByCategoryId.set(node.category.id, []);
      }
      nodesByCategoryId.get(node.category.id)!.push({
        id: node.id,
        name: node.name
      });
      
      if (!columnsByCategoryId.has(node.category.id)) {
        columnsByCategoryId.set(node.category.id, []);
      }
      columnsByCategoryId.get(node.category.id)!.push(...columns);
    }
  }

  // Determine segment dimensions based on orientation
  const segmentWidth = orientation === SpaceFillingOrientation.HORIZONTAL ? undefined : 20;
  const segmentHeight = orientation === SpaceFillingOrientation.HORIZONTAL ? (hierarchyHeight || 20) : undefined;

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
    .each(function(d:any) {
      const group = d3.select(this);
      
      // Segment rectangle
      group.append('rect')
        .attr('width', orientation === SpaceFillingOrientation.HORIZONTAL ? d.width : segmentWidth)
        .attr('height', orientation === SpaceFillingOrientation.HORIZONTAL ? segmentHeight : d.height)
        .attr('rx', 3)
        .attr('fill', (() => {
          const color = d3.color(categoryColorScale(d.id));
          return color ? color.darker(0).toString() : categoryColorScale(d.id);
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
        .html(highlightText(d.name, globalQuery, theme));
      
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
      // Get child categories
      const childNodes = nodesByCategoryId.get(d.id) || [];
      
      // Toggle selection of child categories
      const allChildrenSelected = childNodes.every(cat => selectedNodesStringList.includes(cat.name));
      
      if (allChildrenSelected) {
        // Remove all child categories from selection
        setSelectedNodes(selectedNodes.filter(node => !childNodes.map(cat => cat.name).includes(node.node)));
      } else {
        // Add all child categories to selection
        setSelectedNodes([...selectedNodes, ...childNodes.map((node: LabeledNode) => ({
          node: node.name,
          columns: columnsByNodeId.get(node.id)?.map(col => col.name) || [],
          category: d.name
        }))]);
      }
    })
    .on('mouseover', function(event, d: CategoryData) {
      g.select(`#category-${d.id}`)
        .call(applyHighlightStyleOnCategory, theme);

      const childNodes = nodesByCategoryId.get(d.id) || [];
      
      // apply highlight style on nodes
      nodeData.forEach(node => {
        if (childNodes.map(cat => cat.id).includes(node.id)) {
          g.select(`#node-${node.id}`)
            .call(applyHighlightStyleOnNode, theme);
          g.select(`#node-category-connection-${node.id}-${d.id}`)
            .call(applyHighlightStyleOnEdge);

          const relatedColumns = columnsByNodeId.get(node.id) || [];
          columnData.forEach(column => {
            if (relatedColumns.map(col => col.id).includes(column.id)) {
              g.select(`#column-${column.id}`)
                .call(applyHighlightStyleOnColumn);

              g.select(`#edge-${column.id}-${node.id}`)
                .call(applyHighlightStyleOnEdge);
            }
          });
        } else {
          g.select(`#node-${node.id}`)
            .call(applyBackgroundStyleOnNode, theme);

          g.select(`#node-category-connection-${node.id}-${node.category.id}`)
            .call(applyBackgroundStyleOnEdge);

          const relatedColumns = columnsByNodeId.get(node.id) || [];
          columnData.forEach(column => {
            if (relatedColumns.map(col => col.id).includes(column.id)) {
              g.select(`#column-${column.id}`)
                .call(applyBackgroundStyleOnColumn);

              g.select(`#edge-${column.id}-${node.id}`)
                .call(applyBackgroundStyleOnEdge);
            }
          });
        }
      });
    })
    .on('mouseout', function(event, d: CategoryData) {
      g.select(`#category-${d.id}`)
        .call(applyDefaultStyleOnCategory, theme);

      // apply default style on node
      nodeData.forEach(node => {
        g.select(`#node-${node.id}`)
          .call(applyDefaultStyleOnNode, theme);

        g.select(`#node-category-connection-${node.id}-${node.category.id}`)
          .call(applyDefaultStyleOnEdge);
      });

      // apply default style on columns and edges
      columnData.forEach(column => {
        g.select(`#column-${column.id}`)
          .call(applyDefaultStyleOnColumn);

        g.select(`#edge-${column.id}-${column.node.id}`)
          .call(applyDefaultStyleOnEdge);
      });
    });

  // Create category segments
  const nodeGroup = g.append('g')
    .attr('class', 'nodes');
  
  nodeGroup.selectAll('.node')
    .data(positionedNodeSegments)
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('id', d => `node-${d.id}`)
    .attr('transform', d => {
      if (orientation === SpaceFillingOrientation.HORIZONTAL) {
        return `translate(${d.x}, ${nodePosition})`;
      } else {
        return `translate(${nodePosition}, ${d.y})`;
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
          const color = d3.color(nodeColorScale(d.id));
          return color ? color.darker(selectedNodesStringList.includes(d.name) ? 0.4 : 0).toString() : nodeColorScale(d.id);
        })())
        .attr('stroke', selectedNodesStringList.includes(d.name) ? theme.palette.primary.main : theme.palette.text.primary)
        .attr('stroke-width', selectedNodesStringList.includes(d.name) ? 3 : 1)
        .style('cursor', 'pointer');
      
      // Label text
      const text = group.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', theme.palette.common.white)
        .attr('font-family', `"Roboto","Helvetica","Arial",sans-serif`)
        .attr('font-size', orientation === SpaceFillingOrientation.HORIZONTAL ? '0.8rem' : '0.7rem')
        .attr('font-weight', selectedNodesStringList.includes(d.name) ? '700' : '400')
        .attr('letter-spacing', selectedNodesStringList.includes(d.name) ? '0.3px' : '0')
        .html(highlightText(d.name, globalQuery, theme));
      
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
    .on('click', function(event, d: NodeData) {
      // Toggle selection of this node
      const isSelected = selectedNodesStringList.includes(d.name);
      
      if (isSelected) {
        setSelectedNodes(selectedNodes.filter(node => node.node !== d.name ));
      } else {
        setSelectedNodes([...selectedNodes, {
          node: d.name,
          columns: columnsByNodeId.get(d.id)?.map(col => col.name) || [],
          category: d.category.name
        }]);
      }
      
      // Update visual state
      d3.select(this)
        .select('rect')
        .attr('stroke-width', isSelected ? 1 : 3)
        .attr('stroke', isSelected ? theme.palette.text.primary : theme.palette.primary.main);
    })
    .on('mouseover', function(event, d: NodeData) {
      const isSelected = selectedNodesStringList.includes(d.name);
      
      // Only apply hover effects if not selected
      if (!isSelected) {
        g.select(`#node-${d.id}`)
          .call(applyHighlightStyleOnNode, theme);
      }
      
      const relatedColumns = columnsByNodeId.get(d.id) || [];

      // Highlight related columns
      columnData.forEach(column => {
        if (relatedColumns.map(col => col.id).includes(column.id)) {
          g.select(`#column-${column.id}`)
            .call(applyHighlightStyleOnColumn);
          
          g.select(`#edge-${column.id}-${d.id}`)
            .call(applyHighlightStyleOnEdge);
        } else {
          g.select(`#column-${column.id}`)
            .call(applyBackgroundStyleOnColumn)
          
          g.select(`#edge-${column.id}-${column.node.id}`)
            .call(applyBackgroundStyleOnEdge);
        }
      });
    })
    .on('mouseout', function(event, d: NodeData) {
      // Only reset if not selected
      if (!selectedNodesStringList.includes(d.name)) {
        d3.select(this)
          .select('rect')
          .attr('fill', (() => {
            const color = d3.color(nodeColorScale(d.id));
            return color ? color.darker(0).toString() : nodeColorScale(d.id);
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
        g.select(`#edge-${column.id}-${d.id}`).call(applyDefaultStyleOnEdge);
      });
    });

  // Create connecting lines from nodes to categories
  positionedNodeSegments.forEach(node => {
    const category = positionedCategorySegments.find(category => category.id === node.category.id);
    if (!category) return;
    
    let path: string;
    if (orientation === SpaceFillingOrientation.HORIZONTAL) {
      if (!node.centerX || !category.centerX) return;
      path = `
        M ${node.centerX} ${nodePosition + segmentHeight!}
        C ${node.centerX} ${nodePosition + segmentHeight! + 10},
          ${category.centerX} ${categoryPosition - 10},
          ${category.centerX} ${categoryPosition}
      `;
    } else {
      if (!node.centerY || !category.centerY) return;
      path = `
        M ${categoryPosition + segmentWidth!} ${category.centerY}
        C ${categoryPosition + segmentWidth! + 10} ${category.centerY},
          ${nodePosition - 10} ${node.centerY},
          ${nodePosition} ${node.centerY}
      `;
    }
    
    g.append('path')
      .attr('id', `node-category-connection-${node.id}-${category.id}`)
      .attr('class', 'node-category-connection')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', nodeColorScale(node.id))
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.7);
  });
  
  return {
    positionedNodeSegments,
    positionedCategorySegments,
    nodeColorScale
  };
}

// Legacy function for backward compatibility - horizontal orientation
export function renderSpaceFillingSegmentsHorizontal(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  categoryData: CategoryData[],
  nodeData: NodeData[],
  layoutConfig: LayoutConfig,
  categoryY: number,
  nodeY: number,
  nodeColorScale: (id: string) => string,
  selectedTargetNodes: SelectedNode[],
  setSelectedTargetNodes: (nodes: SelectedNode[]) => void
) {
  return renderSpaceFillingSegments(
    g,
    columnData,
    categoryData,
    nodeData,
    layoutConfig,
    categoryY,
    nodeY,
    nodeColorScale,
    selectedTargetNodes,
    setSelectedTargetNodes,
    SpaceFillingOrientation.HORIZONTAL
  );
}

// Legacy function for backward compatibility - vertical orientation
export function renderSpaceFillingSegmentsVertical(
  g: Selection<SVGGElement, unknown, null, undefined>,
  columnData: ColumnData[],
  categoryData: CategoryData[],
  nodeData: NodeData[],
  layoutConfig: LayoutConfig,
  categoryX: number,
  nodeX: number,
  nodeColorScale: (id: string) => string,
  selectedSourceNodes: SelectedNode[],
  setSelectedSourceNodes: (nodes: SelectedNode[]) => void
) {
  return renderSpaceFillingSegments(
    g,
    columnData,
    categoryData,
    nodeData,
    layoutConfig,
    categoryX,
    nodeX,
    nodeColorScale,
    selectedSourceNodes,
    setSelectedSourceNodes,
    SpaceFillingOrientation.VERTICAL
  );
}