import { useMemo, useCallback } from "react";
import {
  Stack,
  Box,
  Typography,
  useTheme,
  Paper,
  Divider,
} from "@mui/material";
import { alpha, lighten } from "@mui/material/styles";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { SectionHeader } from "../../layout/components";

interface MatcherViewProps {
  matcherAnalysis: MatcherAnalysis[];
}

const getMatcherColors = (theme: any, count: number): string[] => {
  const base = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.info.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
  ];

  const colors: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const baseColor = base[i % base.length];
    const cycle = Math.floor(i / base.length);
    const lift = Math.min(0.14 * cycle, 0.42);
    colors.push(cycle === 0 ? baseColor : lighten(baseColor, lift));
  }
  return colors;
};

const truncate = (text: string, maxLen: number) => {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const precisionFromRecallAndF1 = (recall: number, f1: number) => {
  const denom = 2 * recall - f1;
  if (denom <= 0) return 0;
  return clamp01((f1 * recall) / denom);
};

const MatcherView = ({ matcherAnalysis }: MatcherViewProps) => {
  const theme = useTheme();
  const CARD_BG = "#1a2332";
  const TICK_COLOR = alpha("#ffffff", 0.92);

  // Generate colors once for all matchers
  const matcherSeries = useMemo(() => {
    const colors = getMatcherColors(theme, matcherAnalysis.length);
    return matcherAnalysis.map((matcher, index) => ({
      name: matcher.name,
      color: colors[index],
      dataKey: matcher.name,
    }));
  }, [matcherAnalysis, theme]);

  const metricColors = useMemo(() => {
    // Yellow -> Green -> Blue-ish, as requested.
    return {
      mrr: theme.palette.warning.main,
      precision: theme.palette.success.main,
      f1: theme.palette.info.main,
    };
  }, [
    theme.palette.info.main,
    theme.palette.success.main,
    theme.palette.warning.main,
  ]);

  const renderRotatedYAxisTick = useCallback((props: any) => {
    const x = Number(props?.x ?? 0);
    const y = Number(props?.y ?? 0);
    const value = props?.payload?.value != null ? String(props.payload.value) : "";
    const label = truncate(value, 18);

    return (
      <g transform={`translate(${x},${y}) rotate(-45)`}>
        <text
          x={0}
          y={0}
          dy={3}
          textAnchor="end"
          fill={TICK_COLOR}
          fontSize={11}
        >
          {label}
        </text>
      </g>
    );
  }, [TICK_COLOR]);

  // Transform data for radar chart
  const radarData = useMemo(() => {
    if (matcherAnalysis.length === 0) return [];

    const metrics = ["MRR", "Precision", "F1 Score"];
    return metrics.map((metric) => {
      const dataPoint: any = { metric };
      matcherAnalysis.forEach((matcher) => {
        const recall = Number(matcher.recallGt ?? 0);
        const f1 = Number(matcher.f1Score ?? 0);
        const mrr = Number(matcher.mrr ?? 0);
        let value = 0;
        switch (metric) {
          case "MRR":
            value = clamp01(mrr);
            break;
          case "Precision":
            value = precisionFromRecallAndF1(recall, f1);
            break;
          case "F1 Score":
            value = clamp01(f1);
            break;
        }
        dataPoint[matcher.name] = value;
      });
      return dataPoint;
    });
  }, [matcherAnalysis]);

  const rankedMetricData = useMemo(() => {
    return matcherAnalysis
      .map((m) => {
        const recall = Number(m.recallGt ?? 0);
        const f1 = Number(m.f1Score ?? 0);
        const mrr = Number(m.mrr ?? 0);
        const precision = precisionFromRecallAndF1(recall, f1);
        return {
          matcher: m.name,
          label: m.name,
          mrr: clamp01(mrr),
          precision,
          f1: clamp01(f1),
          total: clamp01(mrr) + precision + clamp01(f1),
        };
      })
      .sort((a, b) => {
        if (b.f1 !== a.f1) return b.f1 - a.f1;
        if (b.precision !== a.precision) return b.precision - a.precision;
        return b.mrr - a.mrr;
      });
  }, [matcherAnalysis]);

  const rankedMetricDataWithRank = useMemo(() => {
    return rankedMetricData.map((row, idx) => ({
      ...row,
      label: `${idx + 1}. ${row.matcher}`,
      rank: idx + 1,
    }));
  }, [rankedMetricData]);

  const metricBarHeight = useMemo(() => {
    const rowHeight = 34;
    const headerAndPadding = 60;
    return Math.min(
      820,
      Math.max(
        260,
        rankedMetricDataWithRank.length * rowHeight + headerAndPadding
      )
    );
  }, [rankedMetricDataWithRank.length]);

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
      <Paper
        elevation={0}
        sx={{
          backgroundColor: CARD_BG,
          borderRadius: 2,
          border: `1px solid ${alpha("#ffffff", 0.1)}`,
          boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
          p: 2,
        }}
      >
        <Stack spacing={1.25}>
          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Typography
              sx={{ fontSize: 13, fontWeight: 650, color: "#ffffff" }}
            >
              Matcher Analytics
            </Typography>
          </Box>

          <Box sx={{ width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                data={radarData}
                margin={{ top: 10, right: 20, bottom: 10, left: 20 }}
              >
                <PolarGrid stroke={alpha("#ffffff", 0.14)} />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{
                    fill: alpha("#ffffff", 0.92),
                    fontSize: 12,
                    fontWeight: 650,
                  }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 1]}
                  tick={{
                    fill: alpha("#ffffff", 0.7),
                    fontSize: 10,
                  }}
                  tickCount={6}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: CARD_BG,
                    border: `1px solid ${alpha("#ffffff", 0.12)}`,
                    borderRadius: "2px",
                    color: "#ffffff",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
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
                    fillOpacity={0}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </Box>

          {/* Custom legend pills to reduce clutter */}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: -0.5 }}>
            {matcherSeries.map((series) => (
              <Box
                key={`legend-${series.name}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  px: 1,
                  py: 0.5,
                  borderRadius: 999,
                  border: `1px solid ${alpha("#ffffff", 0.12)}`,
                  backgroundColor: alpha(series.color, 0.14),
                  maxWidth: "100%",
                }}
                title={series.name}
              >
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: series.color,
                    boxShadow: `0 0 0 3px ${alpha(series.color, 0.22)}`,
                    flex: "0 0 auto",
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    color: alpha("#ffffff", 0.92),
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {series.name}
                </Typography>
              </Box>
            ))}
          </Box>

          <Divider sx={{ borderColor: alpha("#ffffff", 0.1) }} />

          <Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 1,
                mb: 0.75,
              }}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: alpha("#ffffff", 0.92),
                }}
              >
                Ranked Breakdown (MRR + Precision + F1)
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: alpha("#ffffff", 0.65) }}
              >
                Range 0–3
              </Typography>
            </Box>

            <Box sx={{ width: "100%", height: metricBarHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rankedMetricDataWithRank}
                  layout="vertical"
                  margin={{ top: 10, right: 16, bottom: 10, left: 0 }}
                  barCategoryGap={6}
                >
                  <CartesianGrid
                    stroke={alpha("#ffffff", 0.1)}
                    strokeDasharray="4 4"
                  />
                  <XAxis
                    type="number"
                    domain={[0, 3]}
                    tick={{ fill: alpha("#ffffff", 0.7), fontSize: 10 }}
                    tickFormatter={(v) => Number(v).toFixed(1)}
                    axisLine={{ stroke: alpha("#ffffff", 0.18) }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={110}
                    axisLine={false}
                    tickLine={false}
                    tick={renderRotatedYAxisTick}
                    tickMargin={6}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: CARD_BG,
                      border: `1px solid ${alpha("#ffffff", 0.12)}`,
                      borderRadius: "2px",
                      color: "#ffffff",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                    }}
                    formatter={(value: number, name: string) => [
                      value.toFixed(3),
                      name,
                    ]}
                  />
                  <Bar
                    dataKey="mrr"
                    stackId="metrics"
                    name="MRR"
                    fill={metricColors.mrr}
                    fillOpacity={0.9}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="precision"
                    stackId="metrics"
                    name="Precision"
                    fill={metricColors.precision}
                    fillOpacity={0.9}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="f1"
                    stackId="metrics"
                    name="F1"
                    fill={metricColors.f1}
                    fillOpacity={0.9}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, pt: 0.5 }}>
              {[
                { label: "MRR", color: metricColors.mrr },
                { label: "Precision", color: metricColors.precision },
                { label: "F1", color: metricColors.f1 },
              ].map((item) => (
                <Box
                  key={`metric-${item.label}`}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1,
                    py: 0.5,
                    borderRadius: 999,
                    border: `1px solid ${alpha("#ffffff", 0.12)}`,
                    backgroundColor: alpha(item.color, 0.16),
                  }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: item.color,
                      boxShadow: `0 0 0 3px ${alpha(item.color, 0.22)}`,
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{ color: alpha("#ffffff", 0.92) }}
                  >
                    {item.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
};

export default MatcherView;
