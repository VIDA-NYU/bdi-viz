import { useContext, useState, useLayoutEffect, useRef, useCallback } from "react";
import { useTheme } from "@mui/material";

import { StyledText } from "@/app/dashboard/layout/components";
import HighlightGlobalContext from "@/app/lib/highlight/highlight-context";
import { useTooltip } from "../hooks/useTooltip";

interface YAxisProps {
  y: any; // (scale) function with domain() and range() methods
  getHeight: (d: Candidate) => number;
  sourceColumn: string;
  sourceColumns: SourceColumn[];
  hideTooltip: () => void;
}

interface LabelProps {
  value: string;
  yPos: number;
  isSelected: boolean;
  getHeight: (d: Candidate) => number;
  globalQuery: string;
  theme: any;
  status?: string;
}

const highlightText = (
  text: string,
  globalQuery: string,
  theme: any,
  status?: string
): React.ReactNode => {
  let parts = [text];
  if (globalQuery) {
    // Split and highlight matching parts
    parts = text.split(new RegExp(`(${globalQuery})`, "gi"));
  }

  return (
    <>
      {status && status === "complete" && (
        <tspan
          style={{
            fill: theme.palette.success.main,
            fontWeight: "1000",
          }}
        >
          ✓
        </tspan>
      )}
      {parts.map((part, index) =>
        part.toLowerCase() === globalQuery.toLowerCase() ? (
          <tspan
            key={index}
            style={{
              fontWeight: "800",
              paintOrder: "stroke",
              fill: theme.palette.primary.main,
              stroke: theme.palette.common.white,
              strokeWidth: 2,
            }}
          >
            {part}
          </tspan>
        ) : (
          part
        )
      )}
    </>
  );
};

const AxisLabel = ({
  value,
  yPos,
  isSelected,
  getHeight,
  globalQuery,
  theme,
  status
}: LabelProps) => {
  const [hovered, setHovered] = useState(false);
  const [textWidth, setTextWidth] = useState(0);
  const textRef = useRef<SVGTextElement>(null);

  // Show full text on hover, or truncated when not hovered.
  const displayedText = hovered || value.length <= 15 ? value : value.slice(0, 12) + "...";

  // Update text width whenever text changes.
  useLayoutEffect(() => {
    if (textRef.current) {
      const { width } = textRef.current.getBBox();
      setTextWidth(width);
    }
  }, [displayedText]);

  return (
    <g
      transform={`translate(-5, ${yPos})`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <rect
        x={-textWidth}
        y={-8}
        width={textWidth}
        height={16}
        fill={theme.palette.grey[200]}
        stroke={theme.palette.grey[500]}
        strokeWidth={isSelected ? 2 : 0}
        rx={3}
        ry={3}
      />
      <StyledText
        ref={textRef}
        dy=".35em"
        textAnchor="end"
        style={{
          fill: theme.palette.grey[600],
          fontSize: "0.8em",
          fontWeight: "600",
          cursor: "pointer",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {highlightText(displayedText, globalQuery, theme, status)}
      </StyledText>
    </g>
  );
};

const YAxis = ({ y, getHeight, sourceColumn, sourceColumns, hideTooltip }: YAxisProps) => {
  const theme = useTheme();
  const { globalQuery } = useContext(HighlightGlobalContext);

  return (
    <g onMouseMove={hideTooltip}>
      {/* Title */}
      {/* <g>
        <StyledText
          transform={`translate(-110, ${y.range()[1] / 2 + 10}) rotate(-90)`}
          textAnchor="middle"
          style={{ fontSize: "1em", fontWeight: "600" }}
        >
          Source Attributes
        </StyledText>
      </g> */}

      {/* Arrow marker definition */}
      <defs>
        <marker
          id="arrowUp"
          markerWidth="10"
          markerHeight="10"
          refX="5"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path
            transform="translate(0, -2) rotate(-90 5 5)"
            d="M0,10 L3,0 L6,10"
            fill={theme.palette.grey[500]}
          />
        </marker>
      </defs>

      {/* Vertical line with arrow */}
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={y.range()[1]}
        stroke={theme.palette.grey[500]}
        strokeWidth={2}
        markerStart="url(#arrowUp)"
      />

      <StyledText
        x={5}
        y={0}
        textAnchor="start"
        style={{
          fontSize: "0.8em",
          fill: theme.palette.grey[500],
        }}
      >
        less similar
      </StyledText>

      {/* Axis labels */}
      {y.domain().map((value: string) => {
        const status = sourceColumns.find(
          (col) => col.name === value
        )?.status;

        const isSelected = value === sourceColumn;
        const yPos = (y(value) as number) + getHeight({ sourceColumn: value } as Candidate) / 2;
        return (
          <AxisLabel
            key={value}
            value={value}
            yPos={yPos}
            isSelected={isSelected}
            getHeight={getHeight}
            globalQuery={globalQuery || ""}
            theme={theme}
            status={status}
          />
        );
      })}
    </g>
  );
};

export { YAxis };
