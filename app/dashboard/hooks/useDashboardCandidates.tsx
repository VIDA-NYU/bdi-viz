import React, { useState, useCallback, useEffect } from 'react';
import type { Candidate } from '../types';
import { getCachedResults, getValueBins, getValueMatches, getUserOperationHistory, getTargetOntology, getGDCAttribute } from '@/app/lib/heatmap/heatmap-helper';
import { getMockData } from '../components/utils/mock';


type DashboardCandidateState = {
    candidates: Candidate[];
    sourceClusters: SourceCluster[];
    matchers: Matcher[];
    selectedCandidate: Candidate | undefined;
    sourceUniqueValues: SourceUniqueValues[];
    targetUniqueValues: TargetUniqueValues[];
    valueMatches: ValueMatch[];
    userOperations: UserOperation[];
    targetOntologies: TargetOntology[];
    gdcAttribute: GDCAttribute | undefined;
    handleFileUpload: (newCandidates: Candidate[], newSourceClusters?: SourceCluster[], newMatchers?: Matcher[]) => void;
    handleChatUpdate: (candidates: Candidate[]) => void;
    setSelectedCandidate: (candidate: Candidate | undefined) => void;
    setMatchers: (matchers: Matcher[]) => void;
    handleUserOperationsUpdate: (newUserOperations: UserOperation[]) => void;
    handleValueMatches: (valueMatches: ValueMatch[]) => void;
    setGdcAttribute: (attribute: GDCAttribute | undefined) => void;
    handleTargetOntology: (targetOntologies: TargetOntology[]) => void;
}

export type { DashboardCandidateState };

export const {
    useDashboardCandidates
} = {
    useDashboardCandidates: (): DashboardCandidateState => {

        const [candidates, setCandidates] = useState<Candidate[]>(getMockData());
        const [sourceClusters, setSourceClusters] = useState<SourceCluster[]>([]);
        const [matchers, setMatchers] = useState<Matcher[]>([]);
        const [selectedCandidate, setSelectedCandidate] = useState<Candidate | undefined>(undefined);
        const [sourceUniqueValues, setSourceUniqueValues] = useState<SourceUniqueValues[]>([]);
        const [targetUniqueValues, setTargetUniqueValues] = useState<TargetUniqueValues[]>([]);
        const [valueMatches, setValueMatches] = useState<ValueMatch[]>([]);
        const [userOperations, setUserOperations] = useState<UserOperation[]>([]);
        const [targetOntologies, setTargetOntologies] = useState<TargetOntology[]>([]);
        const [gdcAttribute, setGdcAttribute] = useState<GDCAttribute | undefined>(undefined);

        const handleFileUpload = useCallback((newCandidates: Candidate[], newSourceClusters?: SourceCluster[], newMatchers?: Matcher[]) => {
            setCandidates(newCandidates.sort((a, b) => b.score - a.score));
            if (newSourceClusters && JSON.stringify(newSourceClusters) !== JSON.stringify(sourceClusters)) {
                setSourceClusters(newSourceClusters);
            }

            if (newMatchers && JSON.stringify(newMatchers) !== JSON.stringify(matchers)) {
                setMatchers(newMatchers);
            }
        }, [sourceClusters]);

        const handleUniqueValues = useCallback((sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => {
            setSourceUniqueValues(sourceUniqueValuesArray);
            setTargetUniqueValues(targetUniqueValuesArray);
        }, []);

        const handleChatUpdate = useCallback((newCandidates: Candidate[]) => {
            setCandidates(newCandidates);
            setSelectedCandidate(undefined);
        }, []);

        const handleSelectedCandidate = useCallback((candidate: Candidate | undefined) => {
            setSelectedCandidate(candidate);
        }, []);

        const handleValueMatches = useCallback((valueMatches: ValueMatch[]) => {
            setValueMatches(valueMatches);
        }, []);

        const handleUserOperationsUpdate = useCallback((newUserOperations: UserOperation[]) => {
            setUserOperations(newUserOperations);
        }, []);

        const handleTargetOntology = useCallback((targetOntologies: TargetOntology[]) => {
            setTargetOntologies(targetOntologies);
        }, []);

        useEffect(() => {
            if (!selectedCandidate) {
                return;
            }
            getGDCAttribute({
                targetColumn: selectedCandidate.targetColumn,
                callback: (attribute: GDCAttribute) => {
                    setGdcAttribute(attribute);
                }
            });
        }, [selectedCandidate]);


        useEffect(() => {
            getCachedResults({
                callback: handleFileUpload 
            });
            getValueBins({
                callback: handleUniqueValues
            });
            getValueMatches({
                callback: handleValueMatches
            });
            getUserOperationHistory({
                callback: handleUserOperationsUpdate
            });
            getTargetOntology({
                callback: handleTargetOntology
            });
        }, []);

        return {
            candidates,
            sourceClusters,
            matchers,
            selectedCandidate,
            sourceUniqueValues,
            targetUniqueValues,
            valueMatches,
            userOperations,
            targetOntologies,
            gdcAttribute,
            handleFileUpload,
            handleChatUpdate,
            setSelectedCandidate: handleSelectedCandidate,
            setMatchers,
            handleUserOperationsUpdate,
            handleValueMatches,
            setGdcAttribute,
            handleTargetOntology,
        };
    }
};