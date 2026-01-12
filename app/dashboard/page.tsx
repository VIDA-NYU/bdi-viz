'use client';
import { useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Box, Typography, Switch } from "@mui/material";
import { toastify } from "@/app/lib/toastify/toastify-helper";
import { getSessionName } from "@/app/lib/settings/session";

import SearchMenu from "./components/search/searchMenu";
import SessionMenu from "./components/session-menu/sessionMenu";
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
import {
    createCandidate,
    deleteCandidate,
    getCachedResults,
    deleteMatcher,
    updateMatchers,
} from '@/app/lib/heatmap/heatmap-helper';

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
    const DEFAULT_RIGHT_PANEL_WIDTH = 300;
    const RIGHT_PANEL_WIDTH_KEY_PREFIX = "bdiviz_right_panel_width_";
    const [rightPanelWidth, setRightPanelWidth] = useState<number>(DEFAULT_RIGHT_PANEL_WIDTH);
    const rightPanelWidthRef = useRef<number>(rightPanelWidth);
    const {
        isLoadingGlobal,
        setIsLoadingGlobal,
        developerMode,
        setDeveloperMode,
        hoverMode,
        setHoverMode,
        taskStates,
    } = useContext(SettingsGlobalContext);

    const {
        pageSize,
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
        metaData,
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
    } = useDashboardFilters();

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
        isMatch,
        selectedExplanations,
        candidateThreshold,
        onCandidateUpdate: handleFileUpload,
        onCandidateSelect: setSelectedCandidate,
        onExplanation: generateExplanations,
        onUserOperationsUpdate: handleUserOperationsUpdate,
        onRelatedOuterSources: setRelatedOuterSources,
        onSourceColumnsUpdate: updateSourceColumns,
        onCandidateThresholdUpdate: updateCandidateThreshold,
        onValueMatchesUpdate: handleValueMatches,
    });


    const { matcherMetrics } = useMatcherAnalysis({ candidates, matchers });

    const {
        groupedSourceColumns,
        weightedAggregatedCandidates,
        filteredSourceColumns,
    } = useDashboardInterfaces({
        candidates,
        matchers,
        sourceClusters,
        filters: {
            selectedCandidate,
            sourceColumns,
            candidateType,
            candidateThreshold,
            status,
        },
        setSourceColumns: updateSourceColumns,
        setCandidateThreshold: updateCandidateThreshold,
    });

    const {
        highlightedSourceColumns,
        highlightedTargetColumns,
        updateHighlightedSourceColumns,
        updateHighlightedTargetColumns
    } = useDashboardHighlight({candidates, searchResults});

    const clampRightPanelWidth = useCallback((width: number) => {
        const min = 260;
        const max = typeof window !== 'undefined'
            ? Math.max(
                min,
                Math.min(900, Math.floor(window.innerWidth - 300 - 520 - 48))
            )
            : 900;
        return Math.min(max, Math.max(min, width));
    }, []);

    useEffect(() => {
        rightPanelWidthRef.current = rightPanelWidth;
    }, [rightPanelWidth]);

    useEffect(() => {
        try {
            const session = (typeof window !== 'undefined' ? getSessionName() : undefined) || 'default';
            const raw = typeof window !== 'undefined'
                ? window.localStorage.getItem(`${RIGHT_PANEL_WIDTH_KEY_PREFIX}${session}`)
                : null;
            if (!raw) return;
            const parsed = parseInt(raw, 10);
            if (Number.isNaN(parsed)) return;
            const clamped = clampRightPanelWidth(parsed);
            setRightPanelWidth(clamped);
            rightPanelWidthRef.current = clamped;
        } catch {
            // ignore storage errors
        }
    }, [clampRightPanelWidth]);

    const onRightPanelResizeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();

        const startX = e.clientX;
        const startWidth = rightPanelWidthRef.current;

        const onMove = (ev: MouseEvent) => {
            const delta = startX - ev.clientX; // dragging left increases width
            const next = clampRightPanelWidth(startWidth + delta);
            rightPanelWidthRef.current = next;
            setRightPanelWidth(next);
        };

        const onUp = () => {
            try {
                const session = (typeof window !== 'undefined' ? getSessionName() : undefined) || 'default';
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(
                        `${RIGHT_PANEL_WIDTH_KEY_PREFIX}${session}`,
                        String(rightPanelWidthRef.current)
                    );
                }
            } catch {
                // ignore storage errors
            }
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            try {
                document.body.style.cursor = '';
                (document.body.style as any).userSelect = '';
            } catch {}
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        try {
            document.body.style.cursor = 'col-resize';
            (document.body.style as any).userSelect = 'none';
        } catch {}
    }, [clampRightPanelWidth]);

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

        if (!(candidate as AggregatedCandidate).matchers.includes("candidate_quadrants") && !(candidate as AggregatedCandidate).matchers.includes("groundtruth")) {
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


    // const handleUpdateSourceColumns = useCallback((columns: string[]) => {
    //     setSelectedCandidate(undefined);

    //     const sourceColumns = groupedSourceColumns.filter(col => columns.includes(col.name));
    //     if (sourceColumns.length > 0) {
    //         const minMaxScore = Math.min(...sourceColumns.map(sc => sc.maxScore));
    //         if (candidateThreshold > minMaxScore) {
    //             updateCandidateThreshold(minMaxScore);
    //         }
    //     }
    //     updateSourceColumns(columns);
    // }, [setSelectedCandidate, groupedSourceColumns, candidateThreshold, updateCandidateThreshold, updateSourceColumns]);

    const setSourceColumn = useCallback((column: string) => {
        if (sourceColumns.includes(column)) {
            updateSourceColumns(sourceColumns.filter(c => c !== column));
        } else {
            updateSourceColumns([...sourceColumns, column]);
        }
    }, [updateSourceColumns]);

    const handleSearchResults = useCallback((results: Candidate[]) => {
        console.log("Search Results: ", results);
        updateSearchResults(results);
    }, [updateSearchResults]);

    const handleNewMatchingTask = useCallback((newCandidates: Candidate[]) => {
        console.log("New Matching Task: ", newCandidates);
        handleFileUpload(newCandidates);
        setSelectedCandidate(undefined);
        updateSourceColumns([]);
        updateCandidateType("all");
        updateCandidateThreshold(0.5);
    }, [handleFileUpload, setSelectedCandidate, updateSourceColumns, updateCandidateType, updateCandidateThreshold]);
    
    const handleNewMatcherSubmit = useCallback((matchers: Matcher[]) => {
        console.log("New Matchers: ", matchers);
        handleMatchers(matchers);
        toastify("success", <p>New matchers created successfully!</p>);
        getCachedResults({ callback: handleFileUpload });
    }, [handleMatchers, handleFileUpload]);

    const matchersSelectHandler = useCallback((matchers: Matcher[]) => {
        handleMatchers(matchers);
    }, [handleMatchers]);

    const defaultMatchersUpdateHandler = useCallback((nextMatchers: Matcher[]) => {
        handleMatchers(nextMatchers);
        updateMatchers({
            matchers: nextMatchers,
            callback: handleMatchers,
        }).catch((error) => {
            console.error("Failed to update default matchers:", error);
        });
    }, [handleMatchers]);

    const deleteMatcherHandler = useCallback(async (matcherName: string) => {
        try {
            await deleteMatcher({
                name: matcherName,
                callback: handleMatchers,
            });
            toastify("success", <p>Matcher deleted successfully!</p>);
            getCachedResults({ callback: handleFileUpload });
        } catch (error) {
            console.error("Failed to delete matcher:", error);
            toastify("error", <p>Failed to delete matcher.</p>);
            throw error;
        }
    }, [handleMatchers, handleFileUpload]);

    const handleCreateCandidate = useCallback((candidate: Candidate) => {
        createCandidate({
            candidate,
            callback: handleFileUpload,
            valueMatchesCallback: handleValueMatches,
            userOperationHistoryCallback: handleUserOperationsUpdate,
        });
        toastify("success", <p>Candidate created successfully!</p>);
    }, [createCandidate]);

    const handleDeleteCandidate = useCallback((candidate: Candidate | AggregatedCandidate) => {
        let aggregatedCandidate: AggregatedCandidate;
        if ('matcher' in candidate) {
            aggregatedCandidate = {
                sourceColumn: candidate.sourceColumn,
                targetColumn: candidate.targetColumn,
                matchers: candidate.matcher ? [candidate.matcher] : [],
                score: candidate.score,
                status: candidate.status || "idle",
            }
        } else {
            aggregatedCandidate = candidate as AggregatedCandidate;
        }
        setSelectedCandidate(undefined);
        deleteCandidate({
            candidate: aggregatedCandidate,
            callback: handleFileUpload,
            valueMatchesCallback: handleValueMatches,
            userOperationHistoryCallback: handleUserOperationsUpdate,
        });
        toastify("success", <p>Candidate deleted successfully!</p>);
    }, [deleteCandidate, setSelectedCandidate]);

    const headerContent = useMemo(() => (
        <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} alignItems="center">
            <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
                <SessionMenu 
                    callback={handleFileUpload}
                    sourceOntologyCallback={handleSourceOntology}
                    targetOntologyCallback={handleTargetOntology}
                    uniqueValuesCallback={handleUniqueValues}
                    valueMatchesCallback={handleValueMatches}
                    userOperationHistoryCallback={handleUserOperationsUpdate}
                />
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
                zIndex: 2000,
            }}>
                <Box sx={{ 
                    pointerEvents: 'auto',
                    mb: 2,
                    ml: 2,
                    boxShadow: 3,
                    borderRadius: 2,
                    overflow: 'hidden'
                }}>
                    <LoadingPopup taskStates={taskStates} />
                </Box>
            </Box>
        );
    }, [isLoadingGlobal, taskStates]);

    return (
        <RootContainer>
            <Header>
                {headerContent}
            </Header>

            <MainContent sx={{ gridTemplateColumns: `300px minmax(0, 2fr) ${rightPanelWidth}px` }}>
                <LeftPanel
                    containerStyle={{ marginBottom: 0, flexGrow: 0 }}
                    sourceColumns={groupedSourceColumns}
                    matchers={matchers}
                    onSourceColumnSelect={updateSourceColumns}
                    onCandidateTypeSelect={updateCandidateType}
                    onCandidateThresholdSelect={updateCandidateThreshold}
                    acceptMatch={acceptMatch}
                    rejectMatch={rejectMatch}
                    discardColumn={discardColumn}
                    undo={undo}
                    redo={redo}
                    exportMatchingResults={exportMatchingResults}
                    onMatchersSelect={matchersSelectHandler}
                    onMatcherDelete={deleteMatcherHandler}
                    state={{ sourceColumns, candidateType, candidateThreshold }}
                    userOperations={userOperations}
                    handleFileUpload={handleNewMatchingTask}
                    handleTargetOntology={handleTargetOntology}
                    handleSourceOntology={handleSourceOntology}
                    handleUniqueValues={handleUniqueValues}
                    handleValueMatches={handleValueMatches}
                    handleUserOperationsUpdate={handleUserOperationsUpdate}
                    setOpenNewMatcherDialog={setOpenNewMatcherDialog}
                    onDefaultMatchersUpdate={defaultMatchersUpdateHandler}
                />

                {/* Middle Column - Main Visualizations */}
                <MainColumn>
                    <UpperTabs
                        weightedAggregatedCandidates={weightedAggregatedCandidates}
                        setSourceColumns={updateSourceColumns}
                        sourceColumns={filteredSourceColumns}
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
                        metaData={metaData}
                        createCandidate={handleCreateCandidate}
                        deleteCandidate={handleDeleteCandidate}
                    />
                    {/* Show Paginator when sourceColumn is "all" */}
                    <Paginator setSelectedCandidate={setSelectedCandidate} isShow={sourceColumns.length > pageSize || sourceColumns.length === 0} />
                    <LowerTabs
                        weightedAggregatedCandidates={weightedAggregatedCandidates}
                        matchers={matchers}
                        selectedCandidate={selectedCandidate}
                        setSelectedCandidate={setSelectedCandidateByTargetColumnCallback}
                        handleValueMatches={handleValueMatches}
                        handleUserOperationsUpdate={handleUserOperationsUpdate}
                        valueMatches={valueMatches}
                        metaData={metaData}
                    />
                    <Box sx={{ position: 'absolute', right: rightPanelWidth + 20, display: 'flex', alignItems: 'center' }}>
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
                    onResizeMouseDown={onRightPanelResizeMouseDown}
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
