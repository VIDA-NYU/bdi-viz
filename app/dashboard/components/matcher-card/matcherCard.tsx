import { useState, useEffect } from "react";
import {
  ListItem,
  ListItemText,
  Box,
  Stack,
  Typography,
  Chip,
  IconButton,
  Collapse,
} from "@mui/material";
import UnifiedTooltip from "@/app/lib/ui/UnifiedTooltip";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

interface MatcherCardProps {
  matcher: MatcherAnalysis;
}

function MatcherCard({ matcher }: MatcherCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <ListItem
      disablePadding
      sx={{
        mb: 0.5,
        borderRadius: 1,
        border: 1,
        borderColor: "#2d3a4f",
        borderLeft: `4px solid #4dabf5`,
        position: "relative",
        overflow: "hidden",
        px: 0.5,
        paddingBottom: 0.3,
        backgroundColor: "#1a2332",
        color: "#ffffff",
        transition: "all 0.2s",
        "&:hover": {
          backgroundColor: "#243447",
          boxShadow: "0 0 10px rgba(77, 171, 245, 0.5)",
        },
        boxShadow: expanded
          ? "0 0 15px rgba(77, 171, 245, 0.6)"
          : "0 0 5px rgba(77, 171, 245, 0.3)",
        cursor: "pointer",
        "& .MuiTypography-root": {
          color: "#ffffff",
        },
        "& .MuiChip-root": {},
      }}
    >
      <ListItemText
        primary={
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Stack spacing={0.5} sx={{ width: "80%" }}>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: "0.9rem",
                  color: "#ffffff",
                }}
              >
                {matcher.name}
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  height: "30px",
                  width: "100%",
                  position: "relative",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <UnifiedTooltip title={`MRR: ${matcher.mrr.toFixed(2)}`}>
                    <Box
                      sx={{
                        height: "100%",
                        width: `${matcher.mrr * 33}%`,
                        backgroundColor: "rgba(77, 171, 245, 0.8)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: "0.7rem",
                        fontWeight: "bold",
                      }}
                    >
                      MRR
                    </Box>
                  </UnifiedTooltip>
                  <UnifiedTooltip title={`F1: ${matcher.f1Score.toFixed(2)}`}>
                    <Box
                      sx={{
                        height: "100%",
                        width: `${matcher.f1Score * 33}%`,
                        backgroundColor: "rgba(102, 187, 106, 0.8)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: "0.7rem",
                        fontWeight: "bold",
                      }}
                    >
                      F1
                    </Box>
                  </UnifiedTooltip>
                  <UnifiedTooltip
                    title={`Recall: ${matcher.recallGt.toFixed(2)}`}
                  >
                    <Box
                      sx={{
                        height: "100%",
                        width: `${matcher.recallGt * 33}%`,
                        backgroundColor: "rgba(255, 152, 0, 0.8)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: "0.7rem",
                        fontWeight: "bold",
                      }}
                    >
                      RCL
                    </Box>
                  </UnifiedTooltip>
                </Box>
              </Box>
            </Stack>

            <Box sx={{ display: "flex", alignItems: "center" }}>
              <UnifiedTooltip title={expanded ? "Collapse" : "Expand"}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(!expanded);
                  }}
                  sx={{
                    backgroundColor: "#1a2332",
                    color: "#ffffff",
                    "&:hover": {
                      backgroundColor: "#243447",
                    },
                  }}
                >
                  {expanded ? (
                    <ExpandLessIcon fontSize="small" />
                  ) : (
                    <ExpandMoreIcon fontSize="small" />
                  )}
                </IconButton>
              </UnifiedTooltip>
            </Box>
          </Box>
        }
        secondary={
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ mt: 1 }}>
              <Typography
                variant="body2"
                sx={{ fontSize: "0.8rem", color: "#ffffff" }}
              >
                {matcher.description}
              </Typography>
              <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
                <Chip
                  label={`MRR: ${matcher.mrr.toFixed(2)}`}
                  size="small"
                  sx={{
                    color: "white",
                    backgroundColor: "rgba(77, 171, 245, 0.5)",
                  }}
                />
                <Chip
                  label={`F1: ${matcher.f1Score.toFixed(2)}`}
                  size="small"
                  sx={{
                    color: "white",
                    backgroundColor: "rgba(102, 187, 106, 0.5)",
                  }}
                />
                <Chip
                  label={`Recall: ${matcher.recallGt.toFixed(2)}`}
                  size="small"
                  sx={{
                    color: "white",
                    backgroundColor: "rgba(255, 152, 0, 0.5)",
                  }}
                />
              </Box>
              {matcher.code && matcher.params && (
                <Box sx={{ mt: 2 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontSize: "0.85rem", fontWeight: "bold", mb: 1 }}
                  >
                    Matcher Configuration
                  </Typography>
                  <Box
                    sx={{
                      backgroundColor: "#0f172a",
                      p: 1.5,
                      borderRadius: 1,
                      maxHeight: "200px",
                      overflow: "auto",
                      border: "1px solid #2d3a4f",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        mb: 1,
                        fontWeight: "medium",
                        color: "#ffffff",
                      }}
                    >
                      Parameters:
                    </Typography>
                    <pre
                      style={{
                        margin: 0,
                        fontSize: "0.75rem",
                        overflow: "auto",
                        color: "#ffffff",
                      }}
                    >
                      {JSON.stringify(matcher.params, null, 2)}
                    </pre>

                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        mt: 2,
                        mb: 1,
                        fontWeight: "medium",
                        color: "#ffffff",
                      }}
                    >
                      Code:
                    </Typography>
                    <pre
                      style={{
                        margin: 0,
                        fontSize: "0.75rem",
                        overflow: "auto",
                        color: "#ffffff",
                      }}
                    >
                      {matcher.code}
                    </pre>
                  </Box>
                </Box>
              )}
            </Box>
          </Collapse>
        }
        sx={{
          margin: 0,
          padding: 0,
        }}
      />
    </ListItem>
  );
}

export default MatcherCard;
