import { TreeNode } from '../../tree/types';
// Define the column data structure
export interface ColumnData {
  id: string;
  name: string;
  category: string;
  superCategory: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isExpanded?: boolean;
  originalNode: TreeNode;
}

// Define the category data structure
export interface CategoryData {
  id: string;
  columns: ColumnData[];
  superCategory: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  centerX?: number;
  centerY?: number;
}

// Define the super category data structure
export interface SuperCategoryData {
  id: string;
  categories: string[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  centerX?: number;
  centerY?: number;
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
      categoryData: [],
      superCategoryData: []
    };
  }
  // Step 1: Extract column data from tree nodes
  const columnData: ColumnData[] = [];
  const categoryMap: Record<string, string[]> = {};
  const superCategoryMap: Record<string, string[]> = {};

  // Process depth 0 nodes as super categories
  treeData.forEach((superCategoryNode, superCategoryIndex) => {
    const superCategoryId = superCategoryNode.label.text;
    superCategoryMap[superCategoryId] = [];

    // Process depth 1 nodes as categories
    if (superCategoryNode.children) {
      superCategoryNode.children.forEach((categoryNode, categoryIndex) => {
        const categoryId = categoryNode.label.text;
        categoryMap[categoryId] = [];
        superCategoryMap[superCategoryId].push(categoryId);

        // Process depth 2 nodes as columns
        if (categoryNode.children) {
          categoryNode.children.forEach((columnNode, columnIndex) => {
            const columnId = `col-${superCategoryIndex}-${categoryIndex}-${columnIndex}`;
            const column: ColumnData = {
              id: columnId,
              name: columnNode.label.text,
              category: categoryId,
              superCategory: superCategoryId,
              isExpanded: columnNode.isExpanded,
              originalNode: columnNode,
              width: columnNode.width ?? 0,
              height: columnNode.height ?? 0,
              x: columnNode.x ?? 0,
              y: columnNode.y ?? 0,
            };
            columnData.push(column);
            categoryMap[categoryId].push(columnId);
          });
        }
      });
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
  

  // Step 2: Create category data
  const categoryData: CategoryData[] = Object.entries(categoryMap).map(([categoryId, columnIds]) => ({
    id: categoryId,
    columns: columnIds.map(id => columnData.find(col => col.id === id)!).filter(Boolean),
    superCategory: columnData.find(col => col.category === categoryId)?.superCategory || ''
  }));

  // Step 3: Create super category data
  const superCategoryData: SuperCategoryData[] = Object.entries(superCategoryMap).map(([superCategoryId, categoryIds]) => ({
    id: superCategoryId,
    categories: categoryIds
  }));

  return {
    columnData: columnDataWithWidth,
    categoryData,
    superCategoryData
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