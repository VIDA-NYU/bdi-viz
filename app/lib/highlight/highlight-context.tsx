import {createContext} from 'react';

type HighlightGlobalState = {
    globalValueSelection?: string;
    setGlobalValueSelection: (value: string) => void;
    globalValueConnections: [number, number][];
    setGlobalValueConnections: (value: [number, number][]) => void;
    globalCandidateHighlight?: AggregatedCandidate;
    setGlobalCandidateHighlight: (value: AggregatedCandidate | undefined) => void;
    globalQuery?: string;
    setGlobalQuery: (value: string | undefined) => void;
    selectedNodes: string[];
    setSelectedNodes: (nodes: string[]) => void;
}

const HighlightGlobalContext = createContext<HighlightGlobalState>({
    globalValueSelection: "T0",
    setGlobalValueSelection: () => {},
    globalValueConnections: [],
    setGlobalValueConnections: () => {},
    globalCandidateHighlight: undefined,
    setGlobalCandidateHighlight: () => {},
    globalQuery: "",
    setGlobalQuery: () => {},
    selectedNodes: [],
    setSelectedNodes: () => {},
});


export default HighlightGlobalContext;
