import { 
    Box, 
    Card, 
    List, 
    Typography,
    Stack,
    Chip,
    CircularProgress
} from '@mui/material';
import { useMemo, useCallback } from 'react';
import ExplanationItem from './ExplanationItem';
import { BasicChip, SectionHeader } from '../../layout/components';
import { agentThumbRequest } from '@/app/lib/langchain/agent-helper';
import GenerateExplanationButton from './GenerateExplanationButton';
import { handleCopy } from '../../utils/clipboard';
import { toastify } from '@/app/lib/toastify/toastify-helper';

interface SchemaExplanationProps {
    isMatch: boolean;
    currentExplanations: Explanation[];
    selectedExplanations: Explanation[];
    thumbUpExplanations: string[];
    thumbDownExplanations: string[];
    setSelectExplanations: (explanations: Explanation[]) => void;
    setThumbUpExplanations: (id: string[]) => void;
    setThumbDownExplanations: (id: string[]) => void;
    onGenerateExplanation: () => void;
    selectedCandidate?: Candidate;
    isLoading: boolean;
}

const SchemaExplanation = ({
    isMatch,
    currentExplanations,
    selectedExplanations,
    thumbUpExplanations,
    thumbDownExplanations,
    setSelectExplanations,
    setThumbUpExplanations,
    setThumbDownExplanations,
    onGenerateExplanation,
    selectedCandidate,
    isLoading
}: SchemaExplanationProps) => {

    const handleSelect = useCallback((explanation: Explanation) => {
        if (selectedExplanations.some(e => e.id === explanation.id)) {
            setSelectExplanations(selectedExplanations.filter(e => e.id !== explanation.id));
        } else {
            setSelectExplanations([...selectedExplanations, explanation]);
        }
    }, [selectedExplanations, setSelectExplanations]);

    const createUserOperation = useCallback((explanation: Explanation, isThumbUp: boolean) => {
        return {
            operation: (explanation.isMatch === isThumbUp) ? "accept" : "reject",
            candidate: {
                sourceColumn: selectedCandidate?.sourceColumn ?? "",
                targetColumn: selectedCandidate?.targetColumn ?? "",
                score: explanation.confidence,
            },
            references: [],
        };
    }, [selectedCandidate]);

    const handleThumbUp = useCallback((id: string) => {
        const explanation = currentExplanations.find(e => e.id === id);
        if (explanation) {
            const userOperation = createUserOperation(explanation, true);
            agentThumbRequest(explanation, userOperation);
            
            const message = explanation.isMatch
                ? <p>BDI-Viz has learned your feedback on why this candidate is a match. We will pay more attention to this in the future.</p>
                : <p>BDI-Viz has noticed your feedback on why this candidate is not a match. We will pay more attention to this in the future.</p>;
            
            toastify(explanation.isMatch ? "success" : "warning", message);
        }
        
        setThumbUpExplanations(
            thumbUpExplanations.includes(id)
                ? thumbUpExplanations.filter(e => e !== id)
                : [...thumbUpExplanations, id]
        );
    }, [currentExplanations, thumbUpExplanations, setThumbUpExplanations, createUserOperation]);

    const handleThumbDown = useCallback((id: string) => {
        const explanation = currentExplanations.find(e => e.id === id);
        if (explanation) {
            const userOperation = createUserOperation(explanation, false);
            agentThumbRequest(explanation, userOperation);
            
            const message = explanation.isMatch
                ? <p>BDI-Viz has learned your feedback on this kind of explanation. We will pay more attention to this in the future.</p>
                : <p>BDI-Viz has noticed your feedback on why this candidate is a match. We will pay more attention to this in the future.</p>;
            
            toastify(explanation.isMatch ? "warning" : "success", message);
        }
        
        setThumbDownExplanations(
            thumbDownExplanations.includes(id)
                ? thumbDownExplanations.filter(e => e !== id)
                : [...thumbDownExplanations, id]
        );
    }, [currentExplanations, thumbDownExplanations, setThumbDownExplanations, createUserOperation]);

    const candidateDisplay = useMemo(() => {
        if (!selectedCandidate) return null;
        
        return (
            <Box>
                <SectionHeader>
                    Current Selection
                </SectionHeader>
                <Stack direction="row" spacing={1} alignItems="center">
                    <BasicChip 
                        size="small" 
                        label={selectedCandidate.sourceColumn} 
                        color="primary" 
                        sx={{ fontSize: '0.7rem', fontWeight: "600" }} 
                        onClick={() => handleCopy(selectedCandidate.sourceColumn)}
                    />
                    <Typography>→</Typography>
                    <BasicChip
                        size="small" 
                        label={selectedCandidate.targetColumn} 
                        color="secondary" 
                        sx={{ fontSize: '0.7rem', fontWeight: "600" }} 
                        onClick={() => handleCopy(selectedCandidate.targetColumn)}
                    />
                </Stack>
            </Box>
        );
    }, [selectedCandidate]);

    const explanationsList = useMemo(() => {
        if (currentExplanations.length === 0) return null;
        
        return (
            <Box>
                <List sx={{ margin: 0.5, zIndex: 1 }}>
                    {currentExplanations.map(explanation => (
                        <ExplanationItem
                            key={explanation.id}
                            explanation={explanation}
                            selected={selectedExplanations.some(e => e.id === explanation.id)}
                            thumbUp={thumbUpExplanations.includes(explanation.id)}
                            thumbDown={thumbDownExplanations.includes(explanation.id)}
                            onSelect={handleSelect}
                            onThumbUpClick={handleThumbUp}
                            onThumbDownClick={handleThumbDown}
                        />
                    ))}
                </List>
            </Box>
        );
    }, [currentExplanations, selectedExplanations, thumbUpExplanations, thumbDownExplanations, handleSelect, handleThumbUp, handleThumbDown]);

    if (isLoading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Stack spacing={0}>
            {candidateDisplay}

            {currentExplanations.length === 0 && isMatch === true && (
                <GenerateExplanationButton 
                    selectedCandidate={selectedCandidate as AggregatedCandidate}
                    onClick={onGenerateExplanation}
                />
            )}
            
            {selectedCandidate && isMatch !== undefined && (
                <>
                    <SectionHeader>
                        Match Explanations
                    </SectionHeader>
                    <Box>
                        <Chip
                            size="small"
                            label={isMatch ? "Our agent thinks this is a match." : "Our agent thinks this is not a match."} 
                            sx={{ backgroundColor: isMatch ? 'green' : 'red', color: 'white', fontSize: '0.75rem' }} 
                        />
                    </Box>
                </>
            )}
            
            {explanationsList}
        </Stack>
    );
};

export default SchemaExplanation;