// hooks/useSchemaExplanations.ts
import { useState, useCallback } from 'react';

const useSchemaExplanations = () => {
    const [currentExplanations, setCurrentExplanations] = useState<Explanation[]>([]);
    const [thumbUpExplanations, setThumbUpExplanations] = useState<string[]>([]);
    const [thumbDownExplanations, setThumbDownExplanations] = useState<string[]>([]);
    const [selectedExplanations, setSelectedExplanations] = useState<Explanation[]>([]);
    const [isMatch, setIsMatch] = useState<boolean | undefined>(undefined);
    const [relevantKnowledge, setRelevantKnowledge] = useState<RelevantKnowledge[]>([]);
    const [relatedOuterSources, setRelatedOuterSources] = useState<RelatedSource[]>([]);
    
    // Mock function to generate explanations - replace with actual API call later
    const generateExplanations = useCallback((candidate?: Candidate, candidateExplanation?: CandidateExplanation) => {
        if (!candidateExplanation || !candidate) {
            setCurrentExplanations([]);
            setSelectedExplanations([]);
            setIsMatch(undefined);
            setRelevantKnowledge([]);
            return;
        }
        const explanations: Explanation[] = candidateExplanation?.explanations.map((explanation, index) => {
            return {
                id: explanation.id,
                isMatch: explanation.isMatch,
                type: explanation.type,
                reason: explanation.reason,
                reference: explanation.reference,
                confidence: explanation.confidence
            } as Explanation;
        });
        setIsMatch(candidateExplanation.isMatch);
        
        if (candidateExplanation.relevantKnowledge) {
            setRelevantKnowledge(candidateExplanation.relevantKnowledge);
        }
        setCurrentExplanations(explanations);
    }, []);

    return {
        isMatch,
        currentExplanations,
        selectedExplanations,
        thumbUpExplanations,
        thumbDownExplanations,
        relevantKnowledge,
        relatedOuterSources,
        setIsMatch,
        generateExplanations,
        setSelectedExplanations,
        setThumbUpExplanations,
        setThumbDownExplanations,
        setRelatedOuterSources,
    };
}

export {useSchemaExplanations};