import { useMemo } from "react";
import { Stack, Box, Typography, useTheme } from "@mui/material";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { SectionHeader } from "../../layout/components";

interface MatcherViewProps {
  matcherAnalysis: MatcherAnalysis[];
}

// Generate distinct colors for matchers
const generateColors = (count: number): string[] => {
  const colors = [
    "#4dabf5", // Blue
    "#66bb6a", // Green
    "#ff9800", // Orange
    "#ab47bc", // Purple
    "#ef5350", // Red
    "#26c6da", // Cyan
    "#ffca28", // Yellow
    "#78909c", // Blue Grey
    "#ec407a", // Pink
    "#5c6bc0", // Indigo
  ];
  return colors.slice(0, count);
};

const MatcherView = ({ matcherAnalysis }: MatcherViewProps) => {
  const theme = useTheme();

  // Generate colors once for all matchers
  const matcherSeries = useMemo(() => {
    const colors = generateColors(matcherAnalysis.length);
    return matcherAnalysis.map((matcher, index) => ({
      name: matcher.name,
      color: colors[index],
      dataKey: matcher.name,
    }));
  }, [matcherAnalysis]);

  // Transform data for radar chart
  const radarData = useMemo(() => {
    if (matcherAnalysis.length === 0) return [];

    const metrics = ["MRR", "F1 Score", "Recall"];
    return metrics.map((metric) => {
      const dataPoint: any = { metric };
      matcherAnalysis.forEach((matcher) => {
        let value = 0;
        switch (metric) {
          case "MRR":
            value = matcher.mrr;
            break;
          case "F1 Score":
            value = matcher.f1Score;
            break;
          case "Recall":
            value = matcher.recallGt;
            break;
        }
        dataPoint[matcher.name] = value;
      });
      return dataPoint;
    });
  }, [matcherAnalysis]);

  if (matcherAnalysis.length === 0) {
    return (
      <Stack spacing={0}>
        <SectionHeader>Matcher Analytics</SectionHeader>
        <Box
          sx={{
            p: 2,
            textAlign: "center",
            backgroundColor: "#1a2332",
            borderRadius: 1,
          }}
        >
          <Typography variant="body2" sx={{ color: "#ffffff" }}>
            No matcher analysis available
          </Typography>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={1}>
      <SectionHeader>Matcher Analytics</SectionHeader>
      <Box
        sx={{
          width: "100%",
          height: 400,
          p: 2,
          backgroundColor: "#1a2332",
          borderRadius: 1,
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            data={radarData}
            margin={{ top: 20, right: 30, bottom: 20, left: 20 }}
          >
            <PolarGrid stroke="#2d3a4f" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{
                fill: "#ffffff",
                fontSize: 12,
                fontWeight: 500,
              }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 1]}
              tick={{
                fill: "#b0b8c4",
                fontSize: 10,
              }}
              tickCount={6}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1a2332",
                border: "1px solid #2d3a4f",
                borderRadius: "4px",
                color: "#ffffff",
              }}
              formatter={(value: number, name: string) => [
                value.toFixed(3),
                name,
              ]}
            />
            {matcherSeries.map((series) => (
              <Radar
                key={series.name}
                name={series.name}
                dataKey={series.dataKey}
                stroke={series.color}
                fill={series.color}
                fillOpacity={0.3}
                strokeWidth={2}
              />
            ))}
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="line"
              formatter={(value) => (
                <span
                  style={{
                    color: "#ffffff",
                    fontSize: "12px",
                  }}
                >
                  {value}
                </span>
              )}
            />
          </RadarChart>
        </ResponsiveContainer>
      </Box>
    </Stack>
  );
};

export default MatcherView;
