'use client';

import { Box, CircularProgress, Typography, Switch } from "@mui/material";
import { AuxColumn } from "./layout/components";
import CombinedView from "./components/explanation/CombinedView";
import { SectionHeader } from "./layout/components";
import MatcherView from "./components/matcher-card/matcherView";

interface RightPanelProps {
    // CombinedView
    isMatch: boolean;
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
    
    return (
        <AuxColumn>
            <MatcherView matcherAnalysis={matcherAnalysis} />
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
}
export default RightPanel;