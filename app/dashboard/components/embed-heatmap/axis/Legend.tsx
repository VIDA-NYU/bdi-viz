import React from "react";
import { Box, useTheme } from "@mui/material";
import { StyledText } from "@/app/dashboard/layout/components";

interface LegendProps {
  color: d3.ScaleSequential<string, never>;
}

const Legend: React.FC<LegendProps> = ({
  color,
}) => {
  const theme = useTheme();

  const legendWidth = 30;
  const legendHeight = 350;
  const legendOffset = -195;

  const colorRamp = color;
    

  return (
    <g>
      <rect
        transform={`translate(${legendOffset - 25}, 0)`}
        // style={{ filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.3))" }}
        width={legendWidth + 40}
        // height={y.range()[1]}
        height={legendHeight}
        fill={theme.palette.grey[200]}
        rx={3}
        ry={3}
      />
      <g transform={`translate(${legendOffset}, 15)`}>
        <StyledText
          x={-2}
          y={0}
          textAnchor="start"
          style={{
            fontSize: "0.7em",
            fontWeight: "600",
          }}
        >
          Score
        </StyledText>
        <g transform={`translate(0, 5)`}>
          {[0.2, 0.4, 0.6, 0.8, 1.0].map((d, i) => (
            <React.Fragment key={i}>
              <rect
                key={`colorlegend-${i}`}
                x={0}
                y={i * legendWidth}
                width={legendWidth}
                height={legendWidth}
                fill={colorRamp(d)}
                style={{ filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.3))" }}
                rx={3}
                ry={3}
              />
              <StyledText
                x={legendWidth - 50}
                y={i * legendWidth + 20}
                textAnchor="start"
                style={{ fontSize: "0.7em", fontWeight: "400" }}
              >
                {d.toFixed(1)}
              </StyledText>
            </React.Fragment>
          ))}
        </g>
      </g>

      {/* Accepted Legend */}
      <g transform={`translate(${legendOffset}, 190)`}>
        <StyledText
          x={-12}
          y={0}
          textAnchor="start"
          style={{
            fontSize: "0.7em",
            fontWeight: "600",
          }}
        >
          Accepted
        </StyledText>
        <rect
          x={0}
          y={5}
          width={legendWidth}
          height={legendWidth}
          rx={3}
          ry={3}
          fill={theme.palette.success.dark}
          style={{ filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.3))" }}
        />
      </g>

      {/* Rejected Legend */}
      <g transform={`translate(${legendOffset}, 245)`}>
        <StyledText
          x={-10}
          y={0}
          textAnchor="start"
          style={{
            fontSize: "0.7em",
            fontWeight: "600",
          }}
        >
          Rejected
        </StyledText>
        <rect
          x={0}
          y={5}
          width={legendWidth}
          height={legendWidth}
          rx={3}
          ry={3}
          fill={theme.palette.error.dark}
          style={{ filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.3))" }}
        />
      </g>

      {/* Searched Legend */}
      <g transform={`translate(${legendOffset}, 300)`}>
        <StyledText
          x={-11}
          y={0}
          textAnchor="start"
          style={{
            fontSize: "0.7em",
            fontWeight: "600",
          }}
        >
          Searched
        </StyledText>
        <rect
          x={1}
          y={5}
          width={legendWidth - 2}
          height={legendWidth - 2}
          rx={3}
          ry={3}
          fill={theme.palette.grey[200]}
          stroke={theme.palette.common.black}
          strokeWidth={3}
          style={{ filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.3))" }}
        />
      </g>
    </g>
  );
};

export { Legend };
