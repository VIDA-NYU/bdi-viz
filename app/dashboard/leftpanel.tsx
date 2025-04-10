"use client";

import { LeftColumn } from "./layout/components";
import ControlPanel from "./components/controlpanel";
import DecisionPanel from "./components/decisionpanel";
import ShortcutPanel from "./components/shortcutpanel";
import Timeline from "./components/timeline/timeline";

interface LeftPanelProps {
    // ControlPanel Props
    sourceColumns: SourceColumn[];
    matchers: Matcher[];
    isFloating?: boolean;
    width?: string | number;
    containerStyle?: React.CSSProperties;

    onSourceColumnSelect: (column: string) => void;
    onCandidateTypeSelect: (dataType: string) => void;
    onSimilarSourcesSelect: (num: number) => void;
    onCandidateThresholdSelect: (num: number) => void;
    onMatchersSelect: (matchers: Matcher[]) => void;

    state: {
        sourceColumn: string;
        candidateType: string;
        similarSources: number;
        candidateThreshold: number;
    };

    // DecisionPanel Props
    acceptMatch: () => void;
    rejectMatch: () => void;
    discardColumn: () => void;
    undo: () => void;
    redo: () => void;
    // filterEasyCases: () => void;
    exportMatchingResults: (format: string) => void;

    // Timeline Props
    userOperations: UserOperation[];

    // File Uploading Props
    handleFileUpload: (newCandidates: Candidate[], newSourceClusters?: SourceCluster[], newMatchers?: Matcher[]) => void;
    handleTargetOntology: (targetOntologies: TargetOntology[]) => void;
    handleUniqueValues: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
    handleValueMatches: (valueMatches: ValueMatch[]) => void;
}

const LeftPanel = ({
    // ControlPanel Props
    sourceColumns,
    matchers,
    isFloating = false,
    width,
    containerStyle = {},
    onSourceColumnSelect,
    onCandidateTypeSelect,
    onSimilarSourcesSelect,
    onCandidateThresholdSelect,
    onMatchersSelect,
    state,
    // DecisionPanel Props
    acceptMatch,
    rejectMatch,
    discardColumn,
    undo,
    redo,
    exportMatchingResults,
    // Timeline Props
    userOperations,
    // File Uploading Props
    handleFileUpload,
    handleTargetOntology,
    handleUniqueValues,
    handleValueMatches,
}: LeftPanelProps) => {

    return (
        <LeftColumn>
            <ShortcutPanel
                handleFileUpload={handleFileUpload}
                handleTargetOntology={handleTargetOntology}
                handleUniqueValues={handleUniqueValues}
                handleValueMatches={handleValueMatches}
                acceptMatch={acceptMatch}
                rejectMatch={rejectMatch}
                discardColumn={discardColumn}
                undo={undo}
                redo={redo}
                exportMatchingResults={exportMatchingResults}
            />
            <ControlPanel
                sourceColumns={sourceColumns}
                matchers={matchers}
                isFloating={isFloating}
                width={width}
                containerStyle={containerStyle}
                onSourceColumnSelect={onSourceColumnSelect}
                onCandidateTypeSelect={onCandidateTypeSelect}
                onSimilarSourcesSelect={onSimilarSourcesSelect}
                onCandidateThresholdSelect={onCandidateThresholdSelect}
                onMatchersSelect={onMatchersSelect}
                state={state}
            />
            {/* <DecisionPanel
                acceptMatch={acceptMatch}
                rejectMatch={rejectMatch}
                discardColumn={discardColumn}
            /> */}

            
            <Timeline userOperations={userOperations} />
        </LeftColumn>
    );
}

export default LeftPanel;