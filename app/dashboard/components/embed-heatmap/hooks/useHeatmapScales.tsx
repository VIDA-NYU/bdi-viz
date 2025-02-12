// hooks/useHeatmapScales.ts
import { useMemo } from 'react';
import * as d3 from 'd3';
import { HeatMapConfig } from '../types';
import { getColorInterpolator } from '../utils/color';
interface ScaleParams {
    data: Candidate[];
    sourceCluster?: string[];
    width: number;
    height: number;
    margin: { top: number; right: number; bottom: number; left: number };
    config: HeatMapConfig;
    selectedCandidate?: Candidate;
}
  
const useHeatmapScales = ({ data, sourceCluster, width, height, margin, config, selectedCandidate }: ScaleParams) => {
      
  
    return useMemo(() => {
        console.log("sdasdada", data);
        const xColumns = [...new Set(data.map(d => d.targetColumn))];
        const yColumns = sourceCluster ?? [...new Set(data.map(d => d.sourceColumn))];

        const numColumnsX = xColumns.length;
        const numColumnsY = yColumns.length;
        
        
        const totalWidth = width - margin.left - margin.right;
        const totalHeight = height - margin.top - margin.bottom;
          
        
        // Dynamic cell sizing
        const baseWidth = totalWidth / numColumnsX;
        const baseHeight = totalHeight / numColumnsY;
        const expandedWidth = Math.min(baseWidth * 6, width - margin.left - margin.right);
        const expandedHeight = Math.min(baseHeight * 2, height - margin.top - margin.bottom);
          
        const shrunkWidth = numColumnsX > 1 ? (width - margin.left - margin.right - expandedWidth) / (numColumnsX - 1) : 0;
        const shrunkHeight = numColumnsY > 1 ? (height - margin.top - margin.bottom - expandedHeight) / (numColumnsY - 1) : 0;

          // Scale functions with expansion logic
        const getWidth = (cell: Candidate) => {
                if (!selectedCandidate) return baseWidth;
                if (cell.targetColumn === selectedCandidate.targetColumn) {
                    return expandedWidth;
                }
                return shrunkWidth;
          };
  
          const getHeight = (cell: Candidate) => {
                if (!selectedCandidate) return baseHeight;
                if (cell.sourceColumn === selectedCandidate.sourceColumn) return expandedHeight;
                return shrunkHeight;
          };
          

          // Modified scales with expansion
        


        // Similar getXPosition and getYPosition functions but using respective shrink ratios
        const getXPosition = (column: string) => {
            const index = xColumns.findIndex(d => d === column);
            const expandedIndex = selectedCandidate ? 
                data.findIndex(d => d.targetColumn === selectedCandidate?.targetColumn) : -1;
            if (!selectedCandidate) return baseWidth * index;
            if (index <= expandedIndex) return shrunkWidth * index;
            if (index > expandedIndex) return shrunkWidth * (index-1) + expandedWidth + 1; // 1 is stroke width
        };
         
        const getYPosition = (column: string) => {
            const index = yColumns.findIndex(d => d === column);
            const expandedIndex = selectedCandidate ? 
                yColumns.findIndex(c => c === selectedCandidate?.sourceColumn) : -1;
            if (!selectedCandidate) return baseHeight * index;
            if (index <= expandedIndex) return shrunkHeight * index;
            if (index > expandedIndex) return shrunkHeight * (index-1) + expandedHeight + 1;
         };

         
        const x = (column: string) => getXPosition(column);
        x.domain = () => xColumns;
        x.range = () => [0, width - margin.left - margin.right];
        
        const y = (column: string) => getYPosition(column);
        y.domain = () => yColumns;
        y.range = () => [0, height - margin.top - margin.bottom];

        //   const y = d3.scalePoint()
        //       .range([0, height - margin.top - margin.bottom])
        //       .domain(data.map(d => d.sourceColumn))
        //       .padding(0.1);
  
          // Color scale remains unchanged
          const minScore = d3.min(data, d => d.score) ?? 0;
          const maxScore = d3.max(data, d => d.score) ?? 1;
          const padding = ((maxScore - minScore) * config.colorScalePadding) / 100;
          const color = d3.scaleSequential()
              .interpolator(getColorInterpolator(config.colorScheme))
              .domain([minScore - padding, maxScore + padding]);
  
          return {
                x,
                y,
                color,
                getWidth,
                getHeight,
                dataRange: { min: minScore, max: maxScore }
          };
      }, [data, sourceCluster, width, height, margin, config, selectedCandidate]);
  };
  

  export { useHeatmapScales };
