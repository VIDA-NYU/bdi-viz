"use client";

import { useState, createContext, ReactNode } from 'react';
import HighlightGlobalContext from './highlight-context';

const HighlightGlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [globalValueSelection, setGlobalValueSelection] = useState<string | undefined>("T0");
    const [globalValueConnections, setGlobalValueConnections] = useState<[number, number][]>([]);
    const [globalCandidateHighlight, setGlobalCandidateHighlight] = useState<AggregatedCandidate | undefined>(undefined);

    const value = {
        globalValueSelection,
        setGlobalValueSelection,
        globalValueConnections,
        setGlobalValueConnections,
        globalCandidateHighlight,
        setGlobalCandidateHighlight,
    }

    return (
        <HighlightGlobalContext.Provider value={value}>
            {children}
        </HighlightGlobalContext.Provider>
    );
}

export default HighlightGlobalProvider;

