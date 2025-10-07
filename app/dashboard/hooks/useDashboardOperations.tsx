import { useState, useCallback, useContext } from 'react';
import type { Candidate } from '../types';
import { exportToJson, exportCsv } from '../components/utils/exportJson';
import { toastify } from "@/app/lib/toastify/toastify-helper";
import { applyUserOperation, undoUserOperation, redoUserOperation, getCandidatesResult } from "@/app/lib/heatmap/heatmap-helper";
import { candidateExplanationRequest, agentGetRelatedSources } from "@/app/lib/langchain/agent-helper";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";

type DashboardOperationProps = {
    candidates: Candidate[];
    selectedCandidate: Candidate | undefined;
    isMatch: boolean | undefined;
    selectedExplanations?: Explanation[];
    candidateThreshold: number;
    onCandidateUpdate: (candidates: Candidate[]) => void;
    onCandidateSelect: (candidate: Candidate | undefined) => void;
    onExplanation?: (candidate: Candidate, explanation: CandidateExplanation | undefined) => void;
    onUserOperationsUpdate: (userOperations: UserOperation[]) => void;
    onRelatedOuterSources?: (relatedOuterSources: RelatedSource[]) => void;
    onCandidateThresholdUpdate?: (threshold: number) => void;
}

type DashboardOperationState = {
    isExplaining: boolean;
    acceptMatch: () => Promise<void>;
    rejectMatch: () => void;
    discardColumn: () => void;
    undo: () => void;
    redo: () => void;
    explain: (candidate?: Candidate) => void;
    // filterExactMatches: () => void;
    exportMatchingResults: (format: string) => void;
}

export type { DashboardOperationState };

export const {
    useDashboardOperations
} = {
    useDashboardOperations: ({
        candidates,
        selectedCandidate,
        isMatch,
        selectedExplanations,
        candidateThreshold,
        onCandidateUpdate,
        onCandidateSelect,
        onExplanation,
        onUserOperationsUpdate,
        onRelatedOuterSources,
        onCandidateThresholdUpdate,
    }: DashboardOperationProps): DashboardOperationState => {
        const [isExplaining, setIsExplaining] = useState<boolean>(false);
        const { setIsLoadingGlobal, isLoadingGlobal } = useContext(SettingsGlobalContext);

        const acceptMatch = useCallback(async () => {
            if (!selectedCandidate) return;
            if (isLoadingGlobal) return;

            setIsLoadingGlobal(true);

            const references: Candidate[] = candidates.filter((candidate) => candidate.sourceColumn === selectedCandidate.sourceColumn);
            const userOperation: UserOperation = {
                operation: 'accept',
                candidate: selectedCandidate,
                references,
                isMatchToAgent: isMatch
            };

            onCandidateSelect(undefined);

            toastify("success", <p>Match accepted: <strong>{selectedCandidate.sourceColumn}</strong> - <strong>{selectedCandidate.targetColumn}</strong></p>);
            
            applyUserOperation({
                userOperations: [userOperation],
                cachedResultsCallback: (candidates: Candidate[]) => {
                    onCandidateUpdate(candidates);
                },
                userOperationHistoryCallback(userOperations: UserOperation[]) {
                    onUserOperationsUpdate(userOperations);
                }
            });

            setIsLoadingGlobal(false);
            
        }, [candidates, selectedCandidate, isMatch, selectedExplanations, onCandidateUpdate, onCandidateSelect, isLoadingGlobal, setIsLoadingGlobal]);

        const rejectMatch = useCallback(async () => {
            if (!selectedCandidate) return;
            if (isLoadingGlobal) return;

            setIsLoadingGlobal(true);

            const references: Candidate[] = candidates.filter((candidate) => candidate.sourceColumn === selectedCandidate.sourceColumn);
            const userOperation: UserOperation = {
                operation: 'reject',
                candidate: selectedCandidate,
                references,
                isMatchToAgent: isMatch
            };

            onCandidateSelect(undefined);
            
            toastify("success", <p>Match rejected: <strong>{selectedCandidate.sourceColumn}</strong> - <strong>{selectedCandidate.targetColumn}</strong></p>);

            applyUserOperation({
                userOperations: [userOperation],
                cachedResultsCallback: (candidates: Candidate[]) => {
                    onCandidateUpdate(candidates);
                },
                userOperationHistoryCallback(userOperations: UserOperation[]) {
                    onUserOperationsUpdate(userOperations);
                }
            });

            setIsLoadingGlobal(false);

        }, [candidates, selectedCandidate, isMatch, onCandidateUpdate, onCandidateSelect]);

        const discardColumn = useCallback(async () => {
            if (!selectedCandidate) return;
            if (isLoadingGlobal) return;

            setIsLoadingGlobal(true);

            const references: Candidate[] = candidates.filter((candidate) => candidate.sourceColumn === selectedCandidate.sourceColumn);

            onCandidateSelect(undefined);

            const userOperation: UserOperation = {
                operation: 'discard',
                candidate: selectedCandidate,
                references,
            };

            toastify("success", <p>Column discarded: <strong>{selectedCandidate.sourceColumn}</strong></p>);

            applyUserOperation({
                userOperations: [userOperation],
                cachedResultsCallback: (candidates: Candidate[]) => {
                    onCandidateUpdate(candidates);
                },
                userOperationHistoryCallback(userOperations: UserOperation[]) {
                    onUserOperationsUpdate(userOperations);
                }
            });

            setIsLoadingGlobal(false);
        }, [candidates, selectedCandidate, onCandidateUpdate, onCandidateSelect]);

        const undo = useCallback(() => {
            undoUserOperation({
                userOperationCallback: (userOperation: UserOperation) => {
                    toastify("info", <p>Operation undone: <strong>{userOperation.operation}</strong> - <strong>{userOperation.candidate.sourceColumn}</strong> - <strong>{userOperation.candidate.targetColumn}</strong></p>);
                    if (userOperation.operation === "accept" || userOperation.operation === "reject") {
                        if (userOperation.candidate.score < candidateThreshold) {
                            onCandidateThresholdUpdate?.(userOperation.candidate.score);
                        }
                        onCandidateSelect(userOperation.candidate);
                    } else {
                        onCandidateSelect(undefined);
                    }
                },
                cachedResultsCallback: (candidates: Candidate[]) => {
                    onCandidateUpdate(candidates);
                },
                userOperationHistoryCallback(userOperations: UserOperation[]) {
                    onUserOperationsUpdate(userOperations);
                },
            });
            
        }, [candidates, onCandidateUpdate, onCandidateSelect, candidateThreshold, onCandidateThresholdUpdate]);

        const redo = useCallback(() => {
            redoUserOperation({
                userOperationCallback: (userOperation: UserOperation) => {
                    toastify("info", <p>Operation redone: <strong>{userOperation.operation}</strong> - <strong>{userOperation.candidate.sourceColumn}</strong> - <strong>{userOperation.candidate.targetColumn}</strong></p>);
                    if (userOperation.operation === "accept" || userOperation.operation === "reject") {
                        if (userOperation.candidate.score < candidateThreshold) {
                            onCandidateThresholdUpdate?.(userOperation.candidate.score);
                        }
                        onCandidateSelect(userOperation.candidate);
                    } else {
                        onCandidateSelect(undefined);
                    }
                },
                cachedResultsCallback: (candidates: Candidate[]) => {
                    onCandidateUpdate(candidates);
                },
                userOperationHistoryCallback(userOperations: UserOperation[]) {
                    onUserOperationsUpdate(userOperations);
                },
            });
        }, [candidates, onCandidateUpdate, onCandidateSelect, candidateThreshold, onCandidateThresholdUpdate]);
            

        const explain = useCallback(async (candidate?: Candidate) => {
            const candidateToExplain = candidate || selectedCandidate;
            if (!candidateToExplain) return;
            if (isExplaining) {
                toastify("warning", <p>Previous explanation is still running. Please wait for it to finish...</p>);
                return;
            }

            setIsExplaining(true);

            if (onExplanation) {
                const explanation = await candidateExplanationRequest(candidateToExplain);
                if (explanation) {
                    onExplanation(candidateToExplain, explanation);
                }
            }

            setIsExplaining(false);

            if (onRelatedOuterSources) {
                const relatedOuterSources = await agentGetRelatedSources(candidateToExplain);
                if (relatedOuterSources) {
                    onRelatedOuterSources(relatedOuterSources);
                }
            }
        }, [selectedCandidate, onExplanation, isExplaining, setIsExplaining]);


        const exportMatchingResults = (format: string) => {
            console.log("Exporting Matching Results...");
            getCandidatesResult({
                format,
                callbackCsv: (candidates: string) => {
                    exportCsv(candidates);
                },
                callbackJson: (candidates: string) => {
                    exportToJson(candidates);
                }
            })
        };

        return {
            acceptMatch,
            rejectMatch,
            discardColumn,
            undo,
            redo,
            explain,
            // filterExactMatches,
            exportMatchingResults,
            isExplaining,
        };
    }
};