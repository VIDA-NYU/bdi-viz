"use client";

import { useEffect, useState, createContext, ReactNode } from 'react';
import HighlightGlobalContext from './highlight-context';

const HighlightGlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [globalValueSelection, setGlobalValueSelection] = useState<string | undefined>();
    const [globalValueConnections, setGlobalValueConnections] = useState<[number, number][]>([]);
    const [globalCandidateHighlight, setGlobalCandidateHighlight] = useState<AggregatedCandidate | undefined>(undefined);
    const [globalQuery, setGlobalQuery] = useState<string | undefined>();
    const [selectedTargetNodes, setSelectedTargetNodes] = useState<SelectedNode[]>([]);
    const [selectedSourceNodes, setSelectedSourceNodes] = useState<SelectedNode[]>([]);

    // Clear highlight/selections on session change
    useEffect(() => {
        if (typeof window === "undefined") return;

        const clearOnSessionChange = () => {
            setGlobalValueSelection(undefined);
            setGlobalValueConnections([]);
            setGlobalCandidateHighlight(undefined);
            setGlobalQuery(undefined);
            setSelectedTargetNodes([]);
            setSelectedSourceNodes([]);
        };

        const onStorage = (e: StorageEvent) => {
            if (e.key === "bdiviz_session_name") clearOnSessionChange();
        };

        window.addEventListener("bdiviz:session", clearOnSessionChange);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener("bdiviz:session", clearOnSessionChange);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    const value = {
        globalValueSelection,
        setGlobalValueSelection,
        globalValueConnections,
        setGlobalValueConnections,
        globalCandidateHighlight,
        setGlobalCandidateHighlight,
        globalQuery,
        setGlobalQuery,
        selectedTargetNodes,
        setSelectedTargetNodes,
        selectedSourceNodes,
        setSelectedSourceNodes,
    }

    return (
        <HighlightGlobalContext.Provider value={value}>
            {children}
        </HighlightGlobalContext.Provider>
    );
}

export default HighlightGlobalProvider;

