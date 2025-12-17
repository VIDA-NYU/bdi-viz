"use client";

import { AuxColumn } from "./layout/components";
import CombinedView from "./components/explanation/CombinedView";
import MatcherView from "./components/matcher-card/matcherView";
import SettingsGlobalContext from "../lib/settings/settings-context";
import { useContext } from "react";
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
}: RightPanelProps) => {
  const { developerMode } = useContext(SettingsGlobalContext);

  return (
    <AuxColumn>
      {developerMode && <MatcherView matcherAnalysis={matcherAnalysis} />}
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
    </AuxColumn>
  );
};
export default RightPanel;
