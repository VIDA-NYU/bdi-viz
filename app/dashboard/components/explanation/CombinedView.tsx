// components/SchemaExplanation/CombinedView.tsx
import { Box, Divider, Stack, styled } from '@mui/material';
import SchemaExplanation from './SchemaExplanation';
import RelevantKnowledgeView from './RelevantKnowledgeView';
import { SectionHeader } from '../../layout/components';
import Split from '@uiw/react-split';


interface CombinedViewProps {
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
}

const CombinedView = ({
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
}: CombinedViewProps) => {

    return (
        // <Stack spacing={2}>
            <Split mode="vertical" 
                renderBar={({ onMouseDown, ...props }) => {
                    return (
                    <div {...props} style={{ boxShadow: 'none', background: 'transparent', zIndex: 2 }}>
                        <div onMouseDown={onMouseDown} style={{ boxShadow: '0 -2px 4px rgba(0, 0, 0, 0.2)', borderTop: '1px solid rgba(0, 0, 0, 0.2)' }} />
                    </div>
                    );
                }}
            >
            <Box sx={{ paddingLeft: 0, height: "400px", overflowY: 'scroll', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
                <SchemaExplanation
                    isMatch={isMatch}
                    currentExplanations={currentExplanations}
                    selectedExplanations={selectedExplanations}
                    thumbUpExplanations={thumbUpExplanations}
                    thumbDownExplanations={thumbDownExplanations}
                    setSelectExplanations={setSelectExplanations}
                    setThumbUpExplanations={setThumbUpExplanations}
                    setThumbDownExplanations={setThumbDownExplanations}
                    onGenerateExplanation={onGenerateExplanation}
                    selectedCandidate={selectedCandidate}
                    isLoading={isLoading}
                />
            </Box>
            <Box
                sx={{ overflowY: 'scroll', height: "100%", maxHeight: "800px", scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
            >
                {/* <SectionHeader>
                    Relevant Knowledge
                </SectionHeader> */}
                <RelevantKnowledgeView
                    relevantKnowledge={relevantKnowledge}
                    gdcAttribute={gdcAttribute}
                    isLoading={isLoading}
                    relatedOuterSources={relatedOuterSources}
                />
            </Box>
            </Split>
        // </Stack>
    );
}

export default CombinedView;