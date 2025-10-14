import { useState, useCallback, useEffect } from 'react';

type DashboardFilterState = {
    sourceColumns: string[];
    candidateType: string;
    candidateThreshold: number;
    searchResults: Candidate[];
    status: string[];
    updateSourceColumns: (columns: string[]) => void;
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
        const [sourceColumns, setSourceColumns] = useState<string[]>([]);
        const [candidateType, setCandidateType] = useState<string>('all');
        const [candidateThreshold, setCandidateThreshold] = useState<number>(0.7);
        const [searchResults, setSearchResults] = useState<Candidate[]>([]);
        const [status, setStatus] = useState<string[]>(['accepted', 'rejected', 'discarded', 'idle']); // 'accepted', 'rejected', 'discarded', 'idle'

        // Reset filters on session change
        useEffect(() => {
            if (typeof window === 'undefined') return;

            const reset = () => {
                setSourceColumns([]);
                setCandidateType('all');
                setCandidateThreshold(0.7);
                setSearchResults([]);
                setStatus(['accepted', 'rejected', 'discarded', 'idle']);
            };

            const onStorage = (e: StorageEvent) => {
                if (e.key === 'bdiviz_session_name') reset();
            };

            window.addEventListener('bdiviz:session', reset);
            window.addEventListener('storage', onStorage);
            return () => {
                window.removeEventListener('bdiviz:session', reset);
                window.removeEventListener('storage', onStorage);
            };
        }, []);

        const updateSourceColumns = useCallback((columns: string[]) => {
            setSourceColumns(columns);
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
            sourceColumns,
            candidateType,
            candidateThreshold,
            searchResults,
            status,
            updateSourceColumns,
            updateCandidateType,
            updateCandidateThreshold,
            updateSearchResults,
            updateStatus,
        };
    }
};