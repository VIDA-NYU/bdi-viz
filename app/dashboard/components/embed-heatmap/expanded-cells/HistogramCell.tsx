// components/expanded-cells/HistogramCell.tsx
import React from 'react';
import * as d3 from 'd3';
import { ExpandedCellProps } from './types';
import { FC } from 'react';
import { useTheme, styled } from '@mui/material';

const HistogramCell: FC<ExpandedCellProps> = ({
  sourceUniqueValues,
  targetUniqueValues,
  width,
  height,
}) => {

  const theme = useTheme();
  const StyledText = styled('text')({
    fontFamily: `"Roboto", "Helvetica", "Arial", sans-serif`,
  });

  const Label = styled('text')({
    position: 'absolute',
    fill: theme.palette.grey[800],
    boxShadow: theme.shadows[1],
    fontWeight: '300',
    fontFamily: `"Roboto", "Helvetica", "Arial", sans-serif`,
    fontSize: '0.65rem',
    zIndex: 999,
  });

  const margin = { top: 20, right: 0, bottom: 0, left: 0 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = (height) / 2 - margin.top - margin.bottom;

  const compareValues = (a: string, b: string) => {
    const numA = parseFloat(a.split('-')[0]);
    const numB = parseFloat(b.split('-')[0]);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  };

  const sourceDomain = sourceUniqueValues.uniqueValues
    .map(d => d.value.toString())
    .sort((a, b) => compareValues(a, b));
  const sourceX = d3.scaleBand()
    .domain(sourceDomain)
    .range([0, chartWidth]);

  const targetDomain = targetUniqueValues.uniqueValues
    .map(d => d.value!.toString())
    .sort((a, b) => compareValues(a, b));
  const targetX = d3.scaleBand()
    .domain(targetDomain)
    .range([0, chartWidth]);

  const sourceY = d3.scaleLinear()
    .domain([0, sourceUniqueValues.uniqueValues.length > 0 ? sourceUniqueValues.uniqueValues.map(d => d.count).reduce((a, b) => Math.max(a, b)) : 0])
    .range([chartHeight, 0]);

  const targetY = d3.scaleLinear()
    .domain([0, targetUniqueValues.uniqueValues.length > 0 ? targetUniqueValues.uniqueValues.map(d => d.count).reduce((a, b) => Math.max(a, b)) : 0])
    .range([chartHeight, 0]);

  return (
      <svg width={width} height={height}>
        <Label x={chartWidth - 3} y={10} textAnchor="end" >{sourceUniqueValues.sourceColumn}</Label>
        <Label x={chartWidth - 3} y={chartHeight+margin.top+10} textAnchor="end" >{targetUniqueValues.targetColumn}</Label>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Source Histogram */}
          <g>
          {sourceUniqueValues.uniqueValues.length > 0 ? (
            sourceUniqueValues.uniqueValues.map((bin, i) => (
              <g key={i}>
                <rect
                  x={sourceX(bin.value!)}
                  y={sourceY(bin.count)}
                  width={sourceX.bandwidth()}
                  height={chartHeight - sourceY(bin.count)}
                  fill={theme.palette.primary.dark}
                  opacity={0.7}
                />
                <StyledText
                  x={sourceX(bin.value!)! + sourceX.bandwidth() / 2}
                  y={sourceY(bin.count) - 2}
                  textAnchor="middle"
                  fontSize={`${Math.min(sourceX.bandwidth() * 0.18, 9)}px`}
                  fontWeight={600}
                  fontStyle="normal"
                  fill={theme.palette.text.primary}
                >
                    {bin.value.length > Math.floor(targetX.bandwidth() / 5) ? `${bin.value.substring(0, Math.floor(targetX.bandwidth() / 5))}...` : bin.value}
                </StyledText>
              </g>
            ))
          ) : (
            <StyledText
              x={chartWidth / 2}
              y={chartHeight / 2}
              textAnchor="middle"
              fontStyle="italic"
              fontSize={`${chartWidth * 0.05}px`}
              fill={theme.palette.grey[500]}
            >
              no value in this source attribute
            </StyledText>
          )}
          </g>

          {/* Target Histogram */}
          <g transform={`translate(0,${chartHeight + margin.top})`}>
            {targetUniqueValues.uniqueValues.length > 0 ? (
              targetUniqueValues.uniqueValues.map((bin, i) => (
              <g key={i}>
                <rect
                x={targetX(bin.value!)}
                y={targetY(bin.count)}
                width={targetX.bandwidth()}
                height={chartHeight - targetY(bin.count)}
                fill={theme.palette.secondary.dark}
                opacity={0.7}
                />
                <StyledText
                x={targetX(bin.value!)! + targetX.bandwidth() / 2}
                y={targetY(bin.count) - 2}
                textAnchor="middle"
                fontSize={`${Math.min(sourceX.bandwidth() * 0.18, 9)}px`}
                fontWeight={600}
                fontStyle={'italic'}
                fill={theme.palette.common.black}
                >
                {bin.value.length > Math.floor(targetX.bandwidth() / 5) ? `${bin.value.substring(0, Math.floor(targetX.bandwidth() / 5))}...` : bin.value}
                </StyledText>
              </g>
              ))
            ) : (
                <StyledText
                x={chartWidth / 2}
                y={chartHeight / 2}
                textAnchor="middle"
                fontStyle="italic"
                fontSize={`${chartWidth * 0.05}px`}
                fill={theme.palette.grey[500]}
                >
                no value in this target attribute
                </StyledText>
            )}
          </g>

          {/* Axes */}
          <g transform={`translate(0,${chartHeight})`}>
            <line x1={0} x2={chartWidth} stroke={theme.palette.grey[500]} strokeWidth={1} />
          </g>
        </g>
      </svg>
  );
};

export { HistogramCell };
