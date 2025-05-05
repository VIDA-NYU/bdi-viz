import { useState, useMemo } from "react";
import { TreeNode, Scale, ClusteringOptions } from "./types";

interface UseOntologyLayoutProps {
  columns: string[];
  targetOntologies: TargetOntology[];
  scale: Scale;
  getWidth: (candidate: Candidate) => number;
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  currentExpanding?: AggregatedCandidate;
  useHorizontalPadding?: boolean;
}
interface ColumnWithLocation {
  name: string;
  x: number;
  y: number;
  width: number;
  }
export const useOntologyLayout = ({
  columns,
  targetOntologies,
  scale,
  getWidth,
  width,
  height,
  margin,
  currentExpanding,
  useHorizontalPadding = true,
}: UseOntologyLayoutProps) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(["root"])
  );

  const filteredOntologies = useMemo(() => {
    return targetOntologies.filter((ontology) =>
      columns.includes(ontology.name)
    );
  }, [columns, targetOntologies]);

  const treeData = useMemo(() => {
    const grandparents = filteredOntologies.reduce((acc, ontology) => {
      if (!acc.includes(ontology.grandparent)) {
        acc.push(ontology.grandparent);
      }
      return acc;
    }, [] as string[]);

    const usableWidth = width - margin.left - margin.right;

    const columnsWithLocation: ColumnWithLocation[] = columns.map((col) => {
      const x = scale(col) ?? 0;
      return {
        name: col,
        x: x + (useHorizontalPadding? 1 : 0) * (getWidth({ targetColumn: col } as Candidate) ?? 0) / 2,
        y: 0,
        width: 0,
      };
    }
    );
    



    const treeNodes: TreeNode[] = grandparents.map((grandparent, index) => {
      // Calculate category node position evenly across available space
      const nodes = filteredOntologies.filter(
        (ontology) => ontology.grandparent === grandparent
      );
      const parents = nodes.reduce((acc, ontology) => {
        if (!acc.includes(ontology.parent)) {
          acc.push(ontology.parent);
        }
        return acc;
      }, [] as string[]);

      const grandparentPosition = 0;
      // const isExpanded =
      //   expandedNodes.has(grandparent) ||
      //   nodes.some(
      //     (ontology) =>
      //       expandedNodes.has(ontology.parent) ||
      //       expandedNodes.has(ontology.name)
      //   );

      let isExpanded = true;
      if (currentExpanding) {
        isExpanded = nodes.some((ontology) => currentExpanding.targetColumn == ontology.name);
      }
      

      return {
        id: grandparent,
        label: {
          text: grandparent,
          show: true,
          isClusterLabel: true,
        },
        level: 1,
        children: parents.map((parent) => {
          const cols = nodes
            .filter((ontology) => ontology.parent === parent)
            .map((ontology) => ontology.name);
          const parentPosition =
            (usableWidth * (parents.indexOf(parent) + 0.5)) / parents.length;
          let parentIsExpanded = true;
          if (currentExpanding) {
            parentIsExpanded = cols.some((col) => currentExpanding.targetColumn == col);
          }
          // const parentIsExpanded = expandedNodes.size > 0;
          const layerIsExpanded = expandedNodes.size > 2;
          return {
            id: parent,
            label: {
              text: parent,
              show: true,
              isClusterLabel: true,
            },
            level: 2,
            children: cols.map((col) => {
              let childIsExpanded = true;
              if (currentExpanding) {
                childIsExpanded = currentExpanding.targetColumn == col;
              }
              return {
                id: col,
                label: {
                  text: col,
                  show: true,
                  isClusterLabel: false,
                },
                level: 3,
                originalColumn: col,
                x:
                  (scale(col) ?? 0) +
                  (useHorizontalPadding? 1 :0) * (getWidth({ targetColumn: col } as Candidate) ?? 0) / 2,
                y: 0,
                width: getWidth({ targetColumn: col } as Candidate) ?? 0,
                isExpanded: childIsExpanded,
              };
            }),
            x: parentPosition,
            y: layerIsExpanded ? 80 : 40,
            width: 0,
            isExpanded: parentIsExpanded,
          };
        }),
        x: grandparentPosition,
        y: isExpanded ? 120 : 40,
        width: 0,
        isExpanded: isExpanded,
      };
    });

    return treeNodes;
  }, [filteredOntologies, scale, getWidth, width, margin, expandedNodes]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const getVisibleColumns = () => {
    const result: string[] = [];

    const traverse = (node: TreeNode) => {
      if (!node.children || !expandedNodes.has(node.id)) {
        if (node.originalColumn) {
          result.push(node.originalColumn);
        }
      } else {
        node.children.forEach(traverse);
      }
    };

    treeData.forEach(traverse);

    return result;
  };

  return {
    treeData,
    expandedNodes,
    toggleNode,
    getVisibleColumns,
  };
};
