"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  IconButton,
  Stack,
  Slider,
  Typography,
  Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

interface Matcher {
  name: string;
  weight: number;
  enabled?: boolean;
  code?: string;
}

interface MatcherSelectionProps {
  matchers: Matcher[];
  onSlide: (matchers: Matcher[]) => void;
  onDefaultChange?: (matchers: Matcher[]) => void;
  onMatcherDelete?: (matcherName: string) => Promise<void>;
}

const DEFAULT_MATCHER_NAMES = new Set([
  "magneto_ft",
  "magneto_zs",
  "jaccard_distance",
]);

const MatcherSliders: React.FC<MatcherSelectionProps> = ({
  matchers,
  onSlide,
  onDefaultChange,
  onMatcherDelete,
}) => {
  const [sliderValues, setSliderValues] = useState<number[]>(
    matchers.map((matcher) => matcher.weight)
  );
  const lastEnabledWeightsRef = useRef<Map<string, number>>(new Map());
  const [deleteTarget, setDeleteTarget] = useState<Matcher | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const totalWeight = sliderValues.reduce((sum, value) => sum + value, 0);
  const enabledCount = matchers.filter(
    (matcher) => matcher.enabled ?? true
  ).length;
  const CARD_BG = "#1a2332";
  const ACCENT = "#5f9cff";

  const canDeleteMatcher = useMemo(() => {
    return (matcher: Matcher) =>
      Boolean(onMatcherDelete) &&
      Boolean(matcher.code) &&
      !DEFAULT_MATCHER_NAMES.has(matcher.name);
  }, [onMatcherDelete]);

  useEffect(() => {
    setSliderValues(matchers.map((matcher) => matcher.weight));
  }, [matchers]);

  const handleToggle = (name: string) => {
    const next = matchers.map((matcher) =>
      matcher.name === name
        ? (() => {
            const isEnabled = matcher.enabled ?? true;
            if (isEnabled) {
              lastEnabledWeightsRef.current.set(matcher.name, matcher.weight);
              return { ...matcher, enabled: false, weight: 0 };
            }
            const fallbackWeight =
              matcher.weight > 0 ? matcher.weight : 1 / Math.max(1, matchers.length);
            const restoredWeight =
              lastEnabledWeightsRef.current.get(matcher.name) ?? fallbackWeight;
            return { ...matcher, enabled: true, weight: restoredWeight };
          })()
        : matcher
    );
    if (onDefaultChange) {
      onDefaultChange(next);
      return;
    }
    onSlide(next);
  };

  const handleSliderChange = (index: number, value: number | number[]) => {
    const newValue = value as number;
    const oldValue = sliderValues[index];
    const diff = newValue - oldValue;

    // Calculate remaining weight to distribute
    const remainingIndices = [...Array(sliderValues.length).keys()].filter(
      (i) => i !== index
    );
    const totalRemainingWeight = remainingIndices.reduce(
      (sum, i) => sum + sliderValues[i],
      0
    );

    // Create new values array with proportional distribution
    const newValues = [...sliderValues];
    newValues[index] = newValue;

    if (totalRemainingWeight > 0) {
      remainingIndices.forEach((i) => {
        const proportion = sliderValues[i] / totalRemainingWeight;
        newValues[i] = Math.max(
          0,
          Math.min(1, sliderValues[i] - diff * proportion)
        );
      });
    }

    // Normalize to ensure sum is exactly 1
    const sum = newValues.reduce((a, b) => a + b, 0);

    // Guard against division by zero or invalid sums
    if (sum <= 0 || !Number.isFinite(sum)) {
      // Reset to equal distribution
      const equalWeight = 1 / newValues.length;
      const resetValues = newValues.map(() => equalWeight);
      setSliderValues(resetValues);
      const resetMatchers = matchers.map((matcher, i) => ({
        ...matcher,
        weight: resetValues[i],
      }));
      onSlide(resetMatchers);
      return;
    }

      const normalizedValues = newValues.map((v) => v / sum);

    setSliderValues(normalizedValues);
    const newMatchers = matchers.map((matcher, i) => ({
      ...matcher,
      weight: normalizedValues[i],
    }));
    onSlide(newMatchers);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !onMatcherDelete) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await onMatcherDelete(deleteTarget.name);
      lastEnabledWeightsRef.current.delete(deleteTarget.name);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        minWidth: 220,
        borderRadius: 2,
        border: `1px solid ${alpha("#ffffff", 0.1)}`,
        backgroundColor: CARD_BG,
        boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <FormControl fullWidth>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            px: 2,
            pt: 1.5,
            pb: 1,
            borderBottom: `1px solid ${alpha("#ffffff", 0.1)}`,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 650,
                color: alpha("#ffffff", 0.92),
              }}
            >
              Matcher Controls
            </Typography>
            <Typography
              sx={{ fontSize: "0.72rem", color: alpha("#ffffff", 0.65) }}
            >
              Manage defaults and tune matcher impact.
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 0.25,
            }}
          >
            <Typography
              sx={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: alpha("#ffffff", 0.9),
                backgroundColor: alpha(ACCENT, 0.16),
                border: `1px solid ${alpha(ACCENT, 0.4)}`,
                borderRadius: 999,
                px: 1,
                py: 0.25,
                whiteSpace: "nowrap",
              }}
            >
              {matchers.length > 0
                ? `${matchers.length} matchers`
                : "No matchers"}
            </Typography>
            <Typography
              sx={{ fontSize: "0.7rem", color: alpha("#ffffff", 0.6) }}
            >
              Total:{" "}
              {Number.isFinite(totalWeight) ? totalWeight.toFixed(2) : "0.00"}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ px: 2, pb: 1.5, pt: 1 }}>
          {matchers.length === 0 ? (
            <Typography
              sx={{ fontSize: "0.75rem", color: alpha("#ffffff", 0.75) }}
            >
              No matchers available yet.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 1,
                  }}
                >
                  <Typography
                    id="default-matchers-label"
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: alpha("#ffffff", 0.92),
                    }}
                  >
                    Default Matchers
                  </Typography>
                  <Typography
                    sx={{ fontSize: "0.7rem", color: alpha("#ffffff", 0.6) }}
                  >
                    {enabledCount}/{matchers.length} enabled
                  </Typography>
                </Box>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    color: alpha("#ffffff", 0.6),
                    mb: 0.75,
                  }}
                >
                  Choose which matchers start enabled for new tasks.
                </Typography>
                <Box
                  sx={{
                    maxHeight: 140,
                    overflowY: "auto",
                    pr: 0.5,
                    borderRadius: 1.5,
                    border: `1px solid ${alpha("#ffffff", 0.12)}`,
                    backgroundColor: alpha("#000000", 0.16),
                    "&::-webkit-scrollbar": {
                      width: 6,
                    },
                    "&::-webkit-scrollbar-thumb": {
                      backgroundColor: alpha("#ffffff", 0.2),
                      borderRadius: 6,
                    },
                  }}
                >
                  <FormGroup sx={{ width: "100%", py: 0.25 }}>
                    {matchers.map((matcher) => (
                      <FormControlLabel
                        key={matcher.name}
                        control={
                          <Checkbox
                            size="small"
                            checked={matcher.enabled ?? true}
                            onChange={() => handleToggle(matcher.name)}
                            sx={{
                              color: alpha("#ffffff", 0.45),
                              "&.Mui-checked": {
                                color: ACCENT,
                              },
                            }}
                          />
                        }
                        label={
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 1,
                              width: "100%",
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "0.75rem",
                                color: alpha("#ffffff", 0.86),
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: 160,
                              }}
                            >
                              {matcher.name}
                            </Typography>
                            {canDeleteMatcher(matcher) && (
                              <Tooltip title="Delete custom matcher">
                                <IconButton
                                  size="small"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                    setDeleteError("");
                                    setDeleteTarget(matcher);
                                  }}
                                  sx={{
                                    color: alpha("#ffffff", 0.55),
                                    "&:hover": {
                                      color: "#ff6b6b",
                                    },
                                  }}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        }
                        sx={{
                          marginRight: 0,
                          marginLeft: 0,
                          px: 0.5,
                          borderRadius: 1,
                          "&:hover": {
                            backgroundColor: alpha(ACCENT, 0.12),
                          },
                        }}
                      />
                    ))}
                  </FormGroup>
                </Box>
              </Box>

              <Divider sx={{ borderColor: alpha("#ffffff", 0.1) }} />

              <Box>
                <Typography
                  id="matcher-weights-label"
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: alpha("#ffffff", 0.92),
                  }}
                >
                  Matcher Weights
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    color: alpha("#ffffff", 0.6),
                    mb: 0.75,
                  }}
                >
                  Adjust how strongly each matcher influences ranking.
                </Typography>
                <Stack spacing={1}>
                  {matchers.map((matcher, index) => (
                    <Box
                      key={matcher.name}
                      sx={{
                        borderRadius: 1.5,
                        border: `1px solid ${alpha("#ffffff", 0.12)}`,
                        backgroundColor: alpha("#000000", 0.18),
                        px: 1,
                        py: 0.75,
                        "&:hover": {
                          backgroundColor: alpha("#000000", 0.28),
                        },
                      }}
                    >
                      <Stack
                        spacing={2}
                        direction="row"
                        alignItems="center"
                        sx={{ width: "100%" }}
                      >
                        <Typography
                          sx={{
                            fontSize: "0.75rem",
                            width: "120px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color: alpha("#ffffff", 0.75),
                          }}
                        >
                          {matcher.name}
                        </Typography>
                          <Slider
                            value={sliderValues[index]}
                            onChange={(e, value) =>
                              handleSliderChange(index, value)
                            }
                          disabled={!(matcher.enabled ?? true)}
                          aria-labelledby="matcher-weights-label"
                          valueLabelDisplay="auto"
                          step={0.01}
                          min={0}
                          max={1}
                          sx={{
                            padding: 0,
                            margin: 0,
                            flexGrow: 1,
                            color: ACCENT,
                            "& .MuiSlider-rail": {
                              height: 6,
                              opacity: 0.2,
                            },
                            "& .MuiSlider-track": {
                              height: 6,
                            },
                            "& .MuiSlider-thumb": {
                              width: 14,
                              height: 14,
                              boxShadow: `0 0 0 4px ${alpha(ACCENT, 0.18)}`,
                            },
                            "& .MuiSlider-valueLabel": {
                              fontSize: "0.7rem",
                              backgroundColor: alpha("#000000", 0.85),
                              color: alpha("#ffffff", 0.92),
                            },
                          }}
                        />
                        <Typography
                          sx={{
                            fontSize: "0.72rem",
                            width: "48px",
                            textAlign: "right",
                            fontWeight: 600,
                            color: alpha("#ffffff", 0.92),
                            backgroundColor: alpha(ACCENT, 0.14),
                            borderRadius: 1,
                            px: 0.75,
                            py: 0.25,
                          }}
                        >
                          {sliderValues[index]?.toFixed(2) ?? 0}
                        </Typography>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </Stack>
          )}
        </Box>
      </FormControl>
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (isDeleting) return;
          setDeleteTarget(null);
          setDeleteError("");
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ backgroundColor: CARD_BG, color: "#ffffff" }}>
          Delete Custom Matcher
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: CARD_BG, color: "#ffffff", pt: 2 }}>
          <Typography sx={{ fontSize: "0.85rem", color: alpha("#ffffff", 0.9) }}>
            This will remove the matcher{" "}
            <strong>{deleteTarget?.name}</strong> from the session and drop its
            cached candidates. This cannot be undone.
          </Typography>
          {deleteError ? (
            <Typography
              sx={{
                mt: 1.5,
                fontSize: "0.75rem",
                color: "#ff6b6b",
              }}
            >
              {deleteError}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ backgroundColor: CARD_BG }}>
          <Button
            onClick={() => {
              setDeleteTarget(null);
              setDeleteError("");
            }}
            disabled={isDeleting}
            sx={{ color: alpha("#ffffff", 0.8) }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
            sx={{
              color: "#ffffff",
              backgroundColor: "#ff6b6b",
              "&:hover": { backgroundColor: "#ff4d4d" },
            }}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MatcherSliders;
