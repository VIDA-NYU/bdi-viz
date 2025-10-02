import { TreeNode } from '../../tree/types';
// Define the column data structure
export interface ColumnData {
  id: string;
  name: string;
  node: LabeledNode;
  category: LabeledNode;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isExpanded?: boolean;
  originalNode: TreeNode;
}

// Define the category data structure
export interface NodeData {
  id: string;
  name: string;
  columns: ColumnData[];
  category: LabeledNode;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  centerX?: number;
  centerY?: number;
}

// Define the category data structure
export interface CategoryData {
  id: string;
  name: string;
  nodes: LabeledNode[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  centerX?: number;
  centerY?: number;
}

export interface LabeledNode {
  id: string;
  name: string;
}

// Layout configuration for the visualization
export interface LayoutConfig {
  innerWidth: number;
  innerHeight: number;
  columnHeight: number;
  columnWidth: number;
  columnSpacing: number;
  hierarchyHeight: number;
  hierarchySpacing: number;
  segmentSpacing: number;
  theme: any;
  globalQuery?: string;
}

// Function to transform the tree data into the hierarchical structure we need
export function getHierarchyData(treeData: TreeNode[], layoutConfig: LayoutConfig, isSource: boolean=false) {
  if (!treeData || treeData.length === 0) {
    return {
      columnData: [],
      nodeData: [],
      categoryData: []
    };
  }
  // Step 1: Extract column data from tree nodes
  const columnData: ColumnData[] = [];
  const nodeMap: Record<string, string[]> = {};
  const categoryMap: Record<string, string[]> = {};
  const nodeData: NodeData[] = [];
  const categoryData: CategoryData[] = [];

  // Process depth 0 nodes as categories
  treeData.forEach((categoryTreeNode, categoryIndex) => {
    const categoryName = categoryTreeNode.label.text;
    const categoryId = categoryTreeNode.id;
    categoryMap[categoryId] = [];
    const category: CategoryData = {
      id: categoryId,
      name: categoryName,
      nodes: [],
    };

    // Process depth 1 nodes as nodes
    if (categoryTreeNode.children) {
      categoryTreeNode.children.forEach((nodeTreeNode, nodeIndex) => {
        const nodeName = nodeTreeNode.label.text;
        const nodeId = nodeTreeNode.id;
        nodeMap[nodeId] = [];
        categoryMap[categoryId].push(nodeId);
        const node: NodeData = {
          id: nodeId,
          name: nodeName,
          columns: [],
          category: category,
        };
        // Process depth 2 nodes as columns
        if (nodeTreeNode.children) {
          nodeTreeNode.children.forEach((columnNode, columnIndex) => {
            const columnId = columnNode.id;
            const column: ColumnData = {
              id: columnId,
              name: columnNode.label.text,
              node: {
                id: nodeId,
                name: nodeName,
              },
              category: {
                id: categoryId,
                name: categoryName,
              },
              isExpanded: columnNode.isExpanded,
              originalNode: columnNode,
              width: columnNode.width ?? 0,
              height: columnNode.height ?? 0,
              x: columnNode.x ?? 0,
              y: columnNode.y ?? 0,
            };
            columnData.push(column);
            nodeMap[nodeId].push(columnId);
            node.columns.push(column);
          });
          nodeData.push(node);
        }
        category.nodes.push(node);
      });
      categoryData.push(category);
    }
  });
  if (isSource) {
    columnData.sort((a, b) => a.originalNode.x - b.originalNode.x);
  } else {
    columnData.sort((a, b) => a.originalNode.y - b.originalNode.y);
  }
  const columnDataWithWidth: Array<ColumnData> = [];
  let rightColumnX = layoutConfig.innerWidth;
  columnData.reverse().forEach((column, i) => {
    columnDataWithWidth.push(column);
    rightColumnX = column.originalNode.x;
  });

  return {
    columnData: columnDataWithWidth,
    nodeData,
    categoryData
  };
}

// Helper function to highlight text with the global query
export function highlightText(text: string, globalQuery: string | undefined, theme: any): string {
  if (!globalQuery) return text;
  const regex = new RegExp(`(${globalQuery})`, 'gi');
  const parts = text.split(regex);
  return parts
    .map(part => 
      part.toLowerCase() === globalQuery.toLowerCase()
        ? `<tspan style="font-weight:800;fill:${theme.palette.primary.main};">${part}</tspan>`
        : part
    )
    .join('');
}

// Helper function to truncate text strings
export function truncateString(str: string, maxLength: number, ellipsis: string = '...'): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}