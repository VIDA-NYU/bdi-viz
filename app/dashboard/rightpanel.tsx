"use client";

import { AuxColumn } from "./layout/components";
import CombinedView from "./components/explanation/CombinedView";
import MatcherView from "./components/matcher-card/matcherView";
import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
interface RightPanelProps {
  // CombinedView
  isMatch: boolean | undefined;
  currentExplanations: Explanation[];
  selectedExplanations: Explanation[];
  thumbUpExplanations: string[];
  thumbDownExplanations: string[];
  setSelectExplanations: (explanations: Explanation[]) => void;
  setThumbUpExplanations: (id: string[]) => void;
  setThumbDownExplanations: (id: string[]) => void;
  onGenerateExplanation: () => void;
  relevantKnowledge: RelevantKnowledge[];
  isLoading: boolean;
  selectedCandidate?: Candidate;
  gdcAttribute?: GDCAttribute;
  relatedOuterSources: RelatedSource[];
  matcherAnalysis: MatcherAnalysis[];
  onResizeMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const RightPanel = ({
  // CombinedView
  isMatch,
  currentExplanations,
  selectedExplanations,
  thumbUpExplanations,
  thumbDownExplanations,
  setSelectExplanations,
  setThumbUpExplanations,
  setThumbDownExplanations,
  onGenerateExplanation,
  relevantKnowledge,
  isLoading,
  selectedCandidate,
  gdcAttribute,
  relatedOuterSources,
  matcherAnalysis,
  onResizeMouseDown,
}: RightPanelProps) => {
  const [activeTab, setActiveTab] = useState<"explanations" | "matcher">(
    "explanations"
  );

  return (
    <AuxColumn
      sx={{
        height: "100%",
        position: "relative",
        gap: 0,
        overflowX: "hidden",
        overflowY: "hidden",
        backgroundColor: "background.paper",
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        boxShadow: 1,
      }}
    >
      {/* Resize handle */}
      <Box
        onMouseDown={onResizeMouseDown}
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: "col-resize",
          zIndex: 5,
          background: "transparent",
          "&::after": {
            content: '""',
            position: "absolute",
            left: 1,
            top: "50%",
            transform: "translateY(-50%)",
            width: 4,
            height: 36,
            borderRadius: 2,
            backgroundColor: "divider",
            opacity: 0.6,
          },
          "&:hover": {
            backgroundColor: "action.hover",
            "&::after": { opacity: 1 },
          },
        }}
      />

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", backgroundColor: "background.paper" }}>
        <Tabs
          value={activeTab}
          onChange={(_, value) =>
            setActiveTab(value as "explanations" | "matcher")
          }
          variant="fullWidth"
          aria-label="Right panel tabs"
        >
          <Tab label="Explanations" value="explanations" />
          <Tab label="Matcher Analysis" value="matcher" />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {activeTab === "matcher" ? (
          <Box sx={{ p: 1, height: "100%", overflowY: "auto" }}>
            <MatcherView matcherAnalysis={matcherAnalysis} />
          </Box>
        ) : (
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <CombinedView
              isMatch={isMatch}
              currentExplanations={currentExplanations}
              selectedExplanations={selectedExplanations}
              thumbUpExplanations={thumbUpExplanations}
              thumbDownExplanations={thumbDownExplanations}
              setSelectExplanations={setSelectExplanations}
              setThumbUpExplanations={setThumbUpExplanations}
              setThumbDownExplanations={setThumbDownExplanations}
              onGenerateExplanation={onGenerateExplanation}
              relevantKnowledge={relevantKnowledge}
              isLoading={isLoading}
              selectedCandidate={selectedCandidate}
              gdcAttribute={gdcAttribute}
              relatedOuterSources={relatedOuterSources}
            />
          </Box>
        )}
      </Box>
    </AuxColumn>
  );
};
export default RightPanel;
