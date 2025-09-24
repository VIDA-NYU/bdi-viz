import { useState, useCallback } from 'react';

type DashboardFilterState = {
    sourceColumn: string;
    candidateType: string;
    candidateThreshold: number;
    searchResults: Candidate[];
    status: string[];
    updateSourceColumn: (column: string) => void;
    updateCandidateType: (type: string) => void;
    updateCandidateThreshold: (threshold: number) => void;
    updateSearchResults: (results: Candidate[]) => void;
    updateStatus: (status: string[]) => void;
}

export type { DashboardFilterState };

export const {
    useDashboardFilters
} = {
    useDashboardFilters: (): DashboardFilterState => {
        const [sourceColumn, setSourceColumn] = useState<string>('all');
        const [candidateType, setCandidateType] = useState<string>('all');
        const [candidateThreshold, setCandidateThreshold] = useState<number>(0.7);
        const [searchResults, setSearchResults] = useState<Candidate[]>([]);
        const [status, setStatus] = useState<string[]>(['accepted', 'rejected', 'discarded', 'idle']); // 'accepted', 'rejected', 'discarded', 'idle'

        const updateSourceColumn = useCallback((column: string) => {
            setSourceColumn(column);
        }, []);

        const updateCandidateType = useCallback((type: string) => {
            setCandidateType(type);
        }, []);

        const updateCandidateThreshold = useCallback((threshold: number) => {
            setCandidateThreshold(threshold);
        }, []);

        const updateSearchResults = useCallback((results: Candidate[]) => {
            setSearchResults(results);
        }, []);

        const updateStatus = useCallback((status: string[]) => {
            setStatus(status);
        }, []);

        return {
            sourceColumn,
            candidateType,
            candidateThreshold,
            searchResults,
            status,
            updateSourceColumn,
            updateCandidateType,
            updateCandidateThreshold,
            updateSearchResults,
            updateStatus,
        };
    }
};