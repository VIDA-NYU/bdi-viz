// components/TreeNode.tsx
import React from 'react';
import { TreeNode } from './types';
import { NumberValue } from 'd3';

interface TreeNodeProps {
  node: TreeNode;
  isExpanded: boolean;
  onToggle: (nodeId: string) => void;
  orientation: 'vertical' | 'horizontal';
  level: NumberValue
}

export const TreeNodeComponent: React.FC<TreeNodeProps> = ({
  node,
  isExpanded,
  onToggle,
  orientation,
  level
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.children?.length) {
      onToggle(node.id);
    }
  };

  return (
    <g transform={`translate(${node.x},${node.y})`}>
      {/* Node rectangle */}
      <rect
        width={10}
        height={10}
        rx={4}
        fill={node.children?.length ? '#e5e7eb' : '#f3f4f6'}
        stroke="#9ca3af"
        strokeWidth={1}
        cursor={node.children?.length ? 'pointer' : 'default'}
        onClick={handleClick}
      />
      
      {/* Expand/collapse indicator */}
      {node.children?.length && (
        <text
          x={5}
          y={5}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={10}
          cursor="pointer"
          onClick={handleClick}
        >
          {isExpanded ? '-' : '+'}
        </text>
      )}
      
      {/* Label */}
      <text
        x={orientation === 'horizontal' ? 10 / 2 : -5}
        y={orientation === 'horizontal' ? -5 : 10 / 2}
        textAnchor={orientation === 'horizontal' ? 'middle' : 'end'}
        dominantBaseline={orientation === 'horizontal' ? 'alphabetic' : 'middle'}
        fontSize={12}
        transform={orientation === 'horizontal' ? 'rotate(-45)' : ''}
      >
        {"Hello"}
      </text>
      
      {/* Connection lines to children */}
      {isExpanded && node.children?.map((child: TreeNode, i: number) => (
        <line
          key={child.id}
          x1={10 / 2}
          y1={10}
          x2={orientation === 'horizontal' ? child.x - node.x + 10 / 2 : 10 / 2}
          y2={orientation === 'vertical' ? child.y - node.y : 10 + 20}
          stroke="#9ca3af"
          strokeWidth={1}
        />
      ))}
    </g>
  );
};