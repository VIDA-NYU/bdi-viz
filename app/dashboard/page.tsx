'use client';
import { useContext, useState, useCallback, useMemo } from "react";
import { Box, Typography, Switch } from "@mui/material";
import { toastify } from "@/app/lib/toastify/toastify-helper";

import SearchMenu from "./components/search/searchMenu";
import LeftPanel from "./leftpanel";
import UpperTabs from "./components/upperTabs";
import LowerTabs from "./components/lowerTabs";
import RightPanel from "./rightpanel";
import Paginator from "./components/control-inputs/paginator";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import PaginationGlobalContext from "../lib/pagination/pagination-context";
import LoadingPopup from "./components/loading-popup/loadingPopup";
import NewMatcherDialog from "./components/matcher-card/newMatcher";
import OntologySearchPopup from "./components/ontology-search/ontologySearchPopup";
import { getCachedResults } from '@/app/lib/heatmap/heatmap-helper';

import { useSchemaExplanations } from "./components/explanation/useSchemaExplanations";
import { useDashboardCandidates } from "./hooks/useDashboardCandidates";
import { useDashboardFilters } from "./hooks/useDashboardFilters";
import { useDashboardOperations } from "./hooks/useDashboardOperations";
import { useDashboardInterfaces } from "./hooks/useDashboardInterfaces";

import {
    RootContainer,
    Header,
    MainContent,
    MainColumn,
} from "./layout/components";
import { useDashboardHighlight } from "./hooks/useDashboardHighlight";
import { useMatcherAnalysis } from "./hooks/useMatcherAnalysis";

export default function Dashboard() {
    const [openNewMatcherDialog, setOpenNewMatcherDialog] = useState(false);
    const {
        isLoadingGlobal,
        setIsLoadingGlobal,
        developerMode,
        setDeveloperMode,
        hoverMode,
        setHoverMode,
        taskState,
        setTaskState,
    } = useContext(SettingsGlobalContext);

    const {
        pageNumber,
        pageSize,
        setTotalPages,
    } = useContext(PaginationGlobalContext);

    const {
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
        handleFileUpload,
        handleMatchers,
        setSelectedCandidate,
        handleUserOperationsUpdate: setUserOperations,
        handleUniqueValues,
        handleValueMatches,
        setGdcAttribute,
        handleTargetOntology,
        handleSourceOntology,
    } = useDashboardCandidates();

    const {
        sourceColumn,
        candidateType,
        similarSources,
        candidateThreshold,
        searchResults,
        status,
        updateSourceColumn,
        updateCandidateType,
        updateSimilarSources,
        updateCandidateThreshold,
        updateSearchResults,
        updateStatus,
    } = useDashboardFilters({ candidates, sourceClusters, matchers });

    const {
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
    } = useSchemaExplanations();

    const {
        acceptMatch,
        rejectMatch,
        discardColumn,
        undo,
        redo,
        explain,
        exportMatchingResults,
        isExplaining,
    } = useDashboardOperations({
        candidates,
        selectedCandidate,
        selectedExplanations,
        onCandidateUpdate: handleFileUpload,
        onMatchersUpdate: handleMatchers,
        onCandidateSelect: setSelectedCandidate,
        onExplanation: generateExplanations,
        onUserOperationsUpdate: handleUserOperationsUpdate,
        onRelatedOuterSources: setRelatedOuterSources,
    });


    const { matcherMetrics } = useMatcherAnalysis({ candidates, matchers, enabled: developerMode });

    const {
        filteredSourceCluster,
        filteredCandidateCluster,
        weightedAggregatedCandidates,
        filteredSourceColumns,
    } = useDashboardInterfaces({
        candidates,
        sourceClusters,
        matchers,
        filters: {
            selectedCandidate,
            sourceColumn,
            candidateType,
            similarSources,
            candidateThreshold,
            status,
        },
        pageNumber,
        pageSize,
        setTotalPages,
    });

    const {
        highlightedSourceColumns,
        highlightedTargetColumns,
        updateHighlightedSourceColumns,
        updateHighlightedTargetColumns
    } = useDashboardHighlight({candidates, searchResults});

    function handleUserOperationsUpdate(userOperations: UserOperation[]) {
        setUserOperations(userOperations);
        generateExplanations();
    }

    const setSelectedCandidateCallback = useCallback((candidate: Candidate | undefined) => {
        if (!candidate) {
            setSelectedCandidate(undefined);
            generateExplanations();
            setGdcAttribute(undefined);
            return;
        }
        toastify("default", <p><strong>Source: </strong>{candidate.sourceColumn}, <strong>Target: </strong>{candidate.targetColumn}</p>, { autoClose: 200 });
        setSelectedCandidate(candidate);

        if (!(candidate as AggregatedCandidate).matchers.includes("candidate_quadrants")) {
            explain(candidate);
        } else {
            setIsMatch(true);
        }
    }, [setSelectedCandidate, generateExplanations, setGdcAttribute, explain, setIsMatch]);

    const setSelectedCandidateByTargetColumnCallback = useCallback((sourceColumn: string, targetColumn: string) => {
        console.log("Selected Candidate: ", sourceColumn, targetColumn);
        const candidate = weightedAggregatedCandidates.find((c) => c.sourceColumn === sourceColumn && c.targetColumn === targetColumn);
        if (candidate) {
            setSelectedCandidateCallback(candidate);
        }
    }, [weightedAggregatedCandidates, setSelectedCandidateCallback]);

    const onGenerateExplanation = useCallback(() => {
        if (selectedCandidate) {
            toastify("default", `Generating explanations for ${selectedCandidate.sourceColumn}...`, { autoClose: 200 });
            explain(selectedCandidate);
        }
    }, [selectedCandidate, explain]);


    const handleUpdateSourceColumn = useCallback((column: string) => {
        setSelectedCandidate(undefined);

        const filteredSourceColumn = filteredSourceColumns.find((sc) => sc.name === column);
        if (filteredSourceColumn) {
            if (filteredSourceColumn.status !== "complete") {
                updateStatus(["accepted", "rejected", "discarded", "idle"]);
            }
            
            if (candidateThreshold > filteredSourceColumn.maxScore) {
                updateCandidateThreshold(filteredSourceColumn.maxScore);
            }
        }
        
        updateSourceColumn(column);
    }, [setSelectedCandidate, filteredSourceColumns, updateStatus, candidateThreshold, updateCandidateThreshold, updateSourceColumn]);

    const handleSearchResults = useCallback((results: Candidate[]) => {
        console.log("Search Results: ", results);
        updateSearchResults(results);
    }, [updateSearchResults]);

    const handleNewMatchingTask = useCallback((newCandidates: Candidate[], newSourceClusters?: SourceCluster[]) => {
        console.log("New Matching Task: ", newCandidates, newSourceClusters);
        handleFileUpload(newCandidates, newSourceClusters);
        setSelectedCandidate(undefined);
        updateSourceColumn("all");
        updateCandidateType("all");
        updateSimilarSources(1);
        updateCandidateThreshold(0.5);
    }, [handleFileUpload, setSelectedCandidate, updateSourceColumn, updateCandidateType, updateSimilarSources, updateCandidateThreshold]);
    
    const handleNewMatcherSubmit = useCallback((matchers: Matcher[]) => {
        console.log("New Matchers: ", matchers);
        handleMatchers(matchers);
        toastify("success", <p>New matchers created successfully!</p>);
        getCachedResults({ callback: handleFileUpload });
    }, [handleMatchers, handleFileUpload]);

    const matchersSelectHandler = useCallback((matchers: Matcher[]) => {
        handleMatchers(matchers);
    }, [handleMatchers]);

    const headerContent = useMemo(() => (
        <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} alignItems="center">
            <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
                <Typography sx={{ fontSize: "1.2rem", fontWeight: "200" }}>BDIViz</Typography>
                <Box display="flex" alignItems="center">
                    <SearchMenu
                        agentSearchResultCallback={handleSearchResults}
                        rematchCallback={handleNewMatchingTask}
                        ontologyCallback={handleTargetOntology}
                        uniqueValuesCallback={handleUniqueValues}
                        valueMatchesCallback={handleValueMatches}
                    />
                </Box>
                <Box display="flex" alignItems="center">
                    <Typography sx={{ fontSize: "1rem", fontWeight: "300", marginRight: 0 }}>Developer Mode</Typography>
                    <Switch
                        checked={developerMode}
                        onChange={(e) => setDeveloperMode(e.target.checked)}
                        color="default"
                    />
                </Box>
            </Box>
        </Box>
    ), [developerMode, setDeveloperMode]);

    const loadingOverlay = useMemo(() => {
        if (!isLoadingGlobal) return null;
        
        return (
            <Box sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                width: '400px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-start',
                pointerEvents: 'none',
                zIndex: 1200,
            }}>
                <Box sx={{ 
                    pointerEvents: 'auto',
                    mb: 2,
                    ml: 2,
                    boxShadow: 3,
                    borderRadius: 2,
                    overflow: 'hidden'
                }}>
                    <LoadingPopup taskState={taskState} />
                </Box>
            </Box>
        );
    }, [isLoadingGlobal, taskState]);

    return (
        <RootContainer>
            <Header>
                {headerContent}
            </Header>

            <MainContent>
                <LeftPanel
                    containerStyle={{ marginBottom: 0, flexGrow: 0 }}
                    sourceColumns={filteredSourceColumns}
                    matchers={matchers}
                    onSourceColumnSelect={handleUpdateSourceColumn}
                    onCandidateTypeSelect={updateCandidateType}
                    onSimilarSourcesSelect={updateSimilarSources}
                    onCandidateThresholdSelect={updateCandidateThreshold}
                    acceptMatch={acceptMatch}
                    rejectMatch={rejectMatch}
                    discardColumn={discardColumn}
                    undo={undo}
                    redo={redo}
                    exportMatchingResults={exportMatchingResults}
                    onMatchersSelect={matchersSelectHandler}
                    state={{ sourceColumn, candidateType, similarSources, candidateThreshold }}
                    userOperations={userOperations}
                    handleFileUpload={handleNewMatchingTask}
                    handleTargetOntology={handleTargetOntology}
                    handleSourceOntology={handleSourceOntology}
                    handleUniqueValues={handleUniqueValues}
                    handleValueMatches={handleValueMatches}
                    setOpenNewMatcherDialog={setOpenNewMatcherDialog}
                />

                {/* Middle Column - Main Visualizations */}
                <MainColumn>
                    <UpperTabs
                        weightedAggregatedCandidates={weightedAggregatedCandidates}
                        sourceColumn={sourceColumn}
                        setSourceColumn={handleUpdateSourceColumn}
                        sourceColumns={filteredSourceColumns}
                        sourceCluster={filteredSourceCluster}
                        targetOntologies={targetOntologies}
                        sourceOntologies={sourceOntologies}
                        selectedCandidate={selectedCandidate}
                        setSelectedCandidate={setSelectedCandidateCallback}
                        sourceUniqueValues={sourceUniqueValues}
                        targetUniqueValues={targetUniqueValues}
                        highlightSourceColumns={highlightedSourceColumns}
                        highlightTargetColumns={highlightedTargetColumns}
                        status={status}
                        updateStatus={updateStatus}
                    />
                    {/* Show Paginator when sourceColumn is "all" */}
                    <Paginator setSelectedCandidate={setSelectedCandidate} isShow={sourceColumn === "all"} />
                    <LowerTabs
                        weightedAggregatedCandidates={weightedAggregatedCandidates}
                        matchers={matchers}
                        selectedCandidate={selectedCandidate}
                        setSelectedCandidate={setSelectedCandidateByTargetColumnCallback}
                        selectedSourceColumn={sourceColumn}
                        handleValueMatches={handleValueMatches}
                        valueMatches={valueMatches}
                    />
                    <Box sx={{ position: 'absolute', right: 320, display: 'flex', alignItems: 'center' }}>
                        <Typography sx={{ fontSize: "0.7rem", fontWeight: "300", marginRight: 0 }}>Expand On Hover</Typography>
                        <Switch
                            checked={hoverMode}
                            onChange={(e) => setHoverMode(e.target.checked)}
                            color="info"
                            sx={{ 
                                '& .MuiSwitch-thumb': { borderRadius: 1 },
                                '& .MuiSwitch-track': { borderRadius: 1 }
                            }}
                        />
                    </Box>
                </MainColumn>

                {/* Right Column - Auxiliary Visualizations */}
                <RightPanel
                    isMatch={isMatch}
                    currentExplanations={currentExplanations}
                    selectedExplanations={selectedExplanations}
                    thumbUpExplanations={thumbUpExplanations}
                    thumbDownExplanations={thumbDownExplanations}
                    relevantKnowledge={relevantKnowledge}
                    isLoading={isExplaining}
                    setSelectExplanations={setSelectedExplanations}
                    setThumbUpExplanations={setThumbUpExplanations}
                    setThumbDownExplanations={setThumbDownExplanations}
                    selectedCandidate={selectedCandidate}
                    onGenerateExplanation={onGenerateExplanation}
                    gdcAttribute={gdcAttribute}
                    relatedOuterSources={relatedOuterSources}
                    matcherAnalysis={matcherMetrics}
                />
            </MainContent>

            {/* Loading Overlay */}
            {loadingOverlay}

            {/* Popups */}
            <OntologySearchPopup
                selectedCandidate={selectedCandidate || undefined}
                callback={handleFileUpload}
                ontologyCallback={handleTargetOntology}
                uniqueValuesCallback={handleUniqueValues}
                valueMatchesCallback={handleValueMatches}
                userOperationHistoryCallback={handleUserOperationsUpdate}
            />

            <NewMatcherDialog
                open={openNewMatcherDialog}
                onClose={() => setOpenNewMatcherDialog(false)}
                onSubmit={handleNewMatcherSubmit}
                matchersCallback={handleNewMatcherSubmit}
            />
        </RootContainer>
    );
}
