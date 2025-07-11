// types/TreeTypes.ts

// Basic tree node structure
export interface Scale {
  (column: string): number | undefined;
  domain(): string[];
  range(): number[];
}

// export interface TreeNode {
//   id: string;
//   label: string;
//   children?: TreeNode[];
//   level: number;
//   x: number;  // SVG x position
//   y: number;  // SVG y position
//   width: number;
//   height: number;
//   isExpanded?: boolean;
//   originalColumn?: string;
// }

// Configuration for tree clustering and visualization
export interface TreeConfig {
  // Clustering method to use
  clusteringMethod: 'prefix' | 'hierarchical' | 'custom';
  
  // Custom clustering function if needed
  customClusterFn?: (columns: string[]) => TreeNode[];
  
  // Visual configuration
  nodeWidth?: number;
  nodeHeight?: number;
  nodePadding?: number;
  
  // Optional: Initial expansion state
  initiallyExpanded?: boolean;
  
  // Optional: Maximum depth to show
  maxDepth?: number;
}

// State for managing tree interactions
export interface TreeState {
  expandedNodes: Set<string>;
  hoveredNode?: string;
  selectedNode?: string;
}

// Event handlers for tree interactions
export interface TreeEventHandlers {
  onNodeClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string) => void;
  onNodeLeave?: () => void;
  onNodeExpand?: (nodeId: string) => void;
  onNodeCollapse?: (nodeId: string) => void;
}

// Props for tree visualization component
export interface TreeVisualizationProps {
  nodes: TreeNode[];
  treeState: TreeState;
  config: TreeConfig;
  eventHandlers: TreeEventHandlers;
  orientation: 'vertical' | 'horizontal';
}

// Types for clustering results
export interface ClusteringResult {
  nodes: TreeNode[];
  rootNode: TreeNode;
  nodeMap: Map<string, TreeNode>;
}

// types/TreeTypes.ts
export interface TreeNodeLabel {
  text: string;
  show: boolean;
  isClusterLabel?: boolean;
  adjustedX?: number;  // For fine-tuning label positions
  adjustedY?: number;
}

// export interface TreeNode {
//   id: string;
//   label: TreeNodeLabel;
//   children?: TreeNode[];
//   level: number;
//   x: number;
//   y: number;
//   originalColumn?: string;
//   isExpanded?: boolean;
// }

export interface ClusteringOptions {
  method: 'prefix' | 'hierarchical' | 'custom';
  showClusterLabels: boolean;
  labelSpacing?: number;  // Minimum space between labels
  maxLabelsPerView?: number;  // Maximum number of labels to show at once
  customClusterFn?: (columns: string[]) => TreeNode[];
  labelPlacementStrategy?: 'dynamic' | 'fixed';
}

export interface LabelPlacement {
  x: number;
  y: number;
  show: boolean;
  text: string;
  isClusterLabel: boolean;
}

export interface TreeNodeLabel {
  text: string;
  show: boolean;
  isClusterLabel?: boolean;
  adjustedX?: number;
  adjustedY?: number;
}

export interface TreeNode {
  id: string;
  label: TreeNodeLabel;
  children?: TreeNode[];
  level: number;
  x: number;
  y: number;
  width: number;
  height: number;
  originalColumn?: string;
  isExpanded?: boolean;
}
