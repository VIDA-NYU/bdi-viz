// hooks/useHeatmapScales.ts
import { useMemo } from 'react';
import * as d3 from 'd3';
import { HeatMapConfig } from '../types';
import { getColorInterpolator } from '../utils/color';
interface ScaleParams {
    data: Candidate[];
    width: number;
    height: number;
    margin: { top: number; right: number; bottom: number; left: number };
    config: HeatMapConfig;
    selectedCandidate?: Candidate;
}
  
const useHeatmapScales = ({ data, width, height, margin, config, selectedCandidate }: ScaleParams) => {
      
  
    return useMemo(() => {
        const xColumns = [...new Set(data.map(d => d.targetColumn))];
        const yColumns = [...new Set(data.map(d => d.sourceColumn))].reverse();
        

        const numColumnsX = xColumns.length;
        const numColumnsY = yColumns.length;
        
        
        const totalWidth = width - margin.left - margin.right;
        const totalHeight = height - margin.top - margin.bottom;
          
        
        // Dynamic cell sizing
        const baseWidth = totalWidth / numColumnsX;
        const baseHeight = totalHeight / numColumnsY;
        const expandMultiplierY = Math.max(numColumnsY / 4, 1);
        const expandMultiplierX = Math.max(numColumnsX / 3, 1);
        const expandedWidth = Math.min(baseWidth * 2 * expandMultiplierX, width - margin.left - margin.right);
        const expandedHeight = Math.min(baseHeight * 2 * expandMultiplierY, height - margin.top - margin.bottom);
          
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
                xColumns.findIndex(d => d === selectedCandidate?.targetColumn) : -1;
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

        // Reverse lookup: given an x pixel position (inside inner chart group), return target column name
        const getXColumn = (xPixel: number) => {
            if (xPixel == null || Number.isNaN(xPixel)) return undefined;
            const x = xPixel - margin.left - 316;
            for (let i = 0; i < xColumns.length; i += 1) {
                const col = xColumns[i];
                const start = getXPosition(col) ?? 0;
                const width = getWidth({ targetColumn: col } as Candidate);
                const end = start + width;
                if (x >= start && x <= end) return col;
            }
            return undefined;
        };

        // Reverse lookup: given a y pixel position (inside inner chart group), return source column name
        const getYColumn = (yPixel: number) => {
            if (yPixel == null || Number.isNaN(yPixel)) return undefined;
            const y = yPixel - margin.top - 140;
            for (let i = 0; i < yColumns.length; i += 1) {
                const col = yColumns[i];
                const start = getYPosition(col) ?? 0;
                const height = getHeight({ sourceColumn: col } as Candidate);
                const end = start + height;
                if (y >= start && y <= end) return col;
            }
            return undefined;
        };

        //   const y = d3.scalePoint()
        //       .range([0, height - margin.top - margin.bottom])
        //       .domain(data.map(d => d.sourceColumn))
        //       .padding(0.1);
  
        // Color scale remains unchanged
        
        //   const minScore = d3.min(data, d => d.score) ?? 0;
        //   const maxScore = Math.min(d3.max(data, d => d.score) ?? 1, 1);
        const minScore = 0;
        const maxScore = 1;

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
                getXColumn,
                getYColumn,
                dataRange: { min: minScore, max: maxScore }
          };
      }, [data, width, height, margin, config, selectedCandidate]);
  };
  

  export { useHeatmapScales };
