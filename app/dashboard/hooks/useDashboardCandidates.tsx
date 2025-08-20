import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { Candidate } from '../types';
import {
    getCachedResults,
    getMatchers,
    getValueBins,
    getValueMatches,
    getUserOperationHistory,
    getTargetOntology,
    getGDCAttribute,
    getSourceOntology,
    getDatasetNames
} from '@/app/lib/heatmap/heatmap-helper';
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
    targetOntologies: Ontology[];
    sourceOntologies: Ontology[];
    gdcAttribute: GDCAttribute | undefined;
    metaData?: { sourceMeta: DatasetMeta, targetMeta: DatasetMeta };
    handleFileUpload: (newCandidates: Candidate[], newSourceClusters?: SourceCluster[]) => void;
    handleMatchers: (matchers: Matcher[]) => void;
    handleChatUpdate: (candidates: Candidate[]) => void;
    setSelectedCandidate: (candidate: Candidate | undefined) => void;
    handleUserOperationsUpdate: (newUserOperations: UserOperation[]) => void;
    handleUniqueValues: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
    handleValueMatches: (valueMatches: ValueMatch[]) => void;
    setGdcAttribute: (attribute: GDCAttribute | undefined) => void;
    handleTargetOntology: (targetOntologies: Ontology[]) => void;
    handleSourceOntology: (sourceOntologies: Ontology[]) => void;
}

export type { DashboardCandidateState };

export const useDashboardCandidates = (): DashboardCandidateState => {
    // Initialize state with memoized mock data to prevent unnecessary re-renders
    const initialMockData = useMemo(() => getMockData(), []);
    const [candidates, setCandidates] = useState<Candidate[]>(initialMockData);
    const [sourceClusters, setSourceClusters] = useState<SourceCluster[]>([]);
    const [matchers, setMatchers] = useState<Matcher[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | undefined>(undefined);
    const [sourceUniqueValues, setSourceUniqueValues] = useState<SourceUniqueValues[]>([]);
    const [targetUniqueValues, setTargetUniqueValues] = useState<TargetUniqueValues[]>([]);
    const [valueMatches, setValueMatches] = useState<ValueMatch[]>([]);
    const [userOperations, setUserOperations] = useState<UserOperation[]>([]);
    const [targetOntologies, setTargetOntologies] = useState<Ontology[]>([]);
    const [sourceOntologies, setSourceOntologies] = useState<Ontology[]>([]);
    const [gdcAttribute, setGdcAttribute] = useState<GDCAttribute | undefined>(undefined);
    const [metaData, setMetaData] = useState<{ sourceMeta: DatasetMeta, targetMeta: DatasetMeta } | undefined>();

    // Memoize handlers to prevent unnecessary re-renders
    const handleFileUpload = useCallback((newCandidates: Candidate[], newSourceClusters?: SourceCluster[]) => {
        const controller = new AbortController();

        setCandidates(prevCandidates => {
            const sortedCandidates = [...newCandidates].sort((a, b) => b.score - a.score);
            return JSON.stringify(prevCandidates) !== JSON.stringify(sortedCandidates) ? sortedCandidates : prevCandidates;
        });
        
        if (newSourceClusters) {
            setSourceClusters(prevClusters => 
                JSON.stringify(prevClusters) !== JSON.stringify(newSourceClusters) ? newSourceClusters : prevClusters
            );
        }

        getMatchers({
            callback: handleMatchers,
            signal: controller.signal
        });

        // Refresh dataset names after a new upload
        getDatasetNames({
            callback: (sourceMeta, targetMeta) => setMetaData({ sourceMeta, targetMeta }),
            signal: controller.signal,
        });
    }, []);

    const handleMatchers = useCallback((newMatchers: Matcher[]) => {
        if (newMatchers) {
            setMatchers(prevMatchers => 
                JSON.stringify(prevMatchers) !== JSON.stringify(newMatchers) ? newMatchers : prevMatchers
            );
        }
    }, []);

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

    const handleTargetOntology = useCallback((targetOntologies: Ontology[]) => {
        setTargetOntologies(targetOntologies);
    }, []);

    const handleSourceOntology = useCallback((sourceOntologies: Ontology[]) => {
        setSourceOntologies(sourceOntologies);
    }, []);

    // Fetch GDC attribute when selected candidate changes
    useEffect(() => {
        if (!selectedCandidate) return;
        
        const controller = new AbortController();
        
        getGDCAttribute({
            targetColumn: selectedCandidate.targetColumn,
            callback: (attribute: GDCAttribute) => {
                setGdcAttribute(attribute);
            },
            signal: controller.signal
        });
        
        return () => controller.abort();
    }, [selectedCandidate]);

    // Initial data loading
    useEffect(() => {
        const controller = new AbortController();
        
        // Load all data in parallel for better performance
        Promise.all([
            new Promise<void>(resolve => {
                getCachedResults({
                    callback: handleFileUpload,
                    signal: controller.signal
                });
                resolve();
            }),
            new Promise<void>(resolve => {
                getValueBins({
                    callback: handleUniqueValues,
                    signal: controller.signal
                });
                resolve();
            }),
            new Promise<void>(resolve => {
                getValueMatches({
                    callback: handleValueMatches,
                    signal: controller.signal
                });
                resolve();
            }),
            new Promise<void>(resolve => {
                getUserOperationHistory({
                    callback: handleUserOperationsUpdate,
                    signal: controller.signal
                });
                resolve();
            }),
            new Promise<void>(resolve => {
                getTargetOntology({
                    callback: handleTargetOntology,
                    signal: controller.signal
                });
                resolve();
            }),
            new Promise<void>(resolve => {
                getSourceOntology({
                    callback: handleSourceOntology,
                    signal: controller.signal
                });
                resolve();
            }),
            new Promise<void>(resolve => {
                getDatasetNames({
                    callback: (sourceMeta, targetMeta) => setMetaData({ sourceMeta, targetMeta }),
                    signal: controller.signal,
                });
                resolve();
            }),
        ]).catch(error => {
            if (error.name !== 'AbortError') {
                console.error('Error loading dashboard data:', error);
            }
        });
        
        return () => controller.abort();
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
        sourceOntologies,
        gdcAttribute,
        metaData,
        handleFileUpload,
        handleMatchers,
        handleChatUpdate,
        setSelectedCandidate: handleSelectedCandidate,
        handleUserOperationsUpdate,
        handleUniqueValues,
        handleValueMatches,
        setGdcAttribute,
        handleTargetOntology,
        handleSourceOntology,
    };
};