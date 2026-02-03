import { useState, useEffect, useMemo, useRef } from 'react';
import { cachedExplanationSummariesRequest } from '@/app/lib/langchain/agent-helper';

type matcherAnalysisState = {
    matcherMetrics: MatcherAnalysis[];
}

type matcherAnalysisProps = {
    candidates: Candidate[];
    matchers: Matcher[];
    enabled?: boolean;
}

export const useMatcherAnalysis = ({
    candidates,
    matchers,
    enabled = true,
}: matcherAnalysisProps): matcherAnalysisState => {
    const [groundTruth, setGroundTruth] = useState<Candidate[]>([]);
    const [matcherMetrics, setMatcherMetrics] = useState<MatcherAnalysis[]>([]);
    const explanationRequestIdRef = useRef(0);
    const enabledMatchers = useMemo(
        () => matchers.filter((matcher) => matcher.enabled ?? true),
        [matchers]
    );

    // Effect to update ground truth when candidates change
    useEffect(() => {
        if (!enabled) return;
        
        const truth = candidates.filter((candidate) => candidate.status === "accepted")
            .reduce((acc: Candidate[], candidate) => {
                // Check if we already have a candidate with the same sourceColumn and targetColumn
                const existingIndex = acc.findIndex(c => 
                    c.sourceColumn === candidate.sourceColumn && 
                    c.targetColumn === candidate.targetColumn
                );
                
                // If not found, add it to the accumulator
                if (existingIndex === -1) {
                    acc.push(candidate);
                }
                
                return acc;
            }, []);
        
        setGroundTruth(truth);
    }, [candidates, enabled]);

    // Effect to calculate metrics when dependencies change
    useEffect(() => {
        if (!enabled) return;
        
        if (!enabledMatchers.length || !candidates.length || !groundTruth.length) {
            setMatcherMetrics([]);
            return;
        }
        
        const metrics: MatcherAnalysis[] = enabledMatchers.map((matcher) => {
            // Calculate metrics using candidates if available
            const {mrr, recall, f1, falsePositives, falseNegatives} = calculateMetrics(matcher.name, candidates, groundTruth);
            return {
                name: matcher.name,
                description: "",
                mrr: mrr,
                recallGt: recall,
                f1Score: f1,
                falsePositives: falsePositives,
                falseNegatives: falseNegatives,
                params: matcher.params,
                code: matcher.code,
            };
        });
        
        setMatcherMetrics(metrics);

        const requestId = (explanationRequestIdRef.current += 1);

        (async () => {
            const explanationBreakdowns = await calculateExplanationBreakdowns({
                candidates,
                matchers: enabledMatchers,
                groundTruth,
            });

            if (explanationRequestIdRef.current !== requestId) return;

            setMatcherMetrics((prev) =>
                prev.map((metric) => ({
                    ...metric,
                    explanationBreakdown: explanationBreakdowns[metric.name],
                }))
            );
        })();
    }, [candidates, groundTruth, enabledMatchers, enabled]);

    return { matcherMetrics };
}

const EXPLANATION_TYPES: ExplanationType[] = [
    "name",
    "token",
    "value",
    "semantic",
    "pattern",
    "history",
    "knowledge",
    "other",
];

const pairKey = (sourceColumn: string, targetColumn: string) =>
    JSON.stringify([sourceColumn, targetColumn]);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

type CalculateBreakdownsProps = {
    candidates: Candidate[];
    matchers: Matcher[];
    groundTruth: Candidate[];
};

async function calculateExplanationBreakdowns({
    candidates,
    matchers,
    groundTruth,
}: CalculateBreakdownsProps): Promise<Record<string, MatcherExplanationBreakdown>> {
    const easyPairs = new Set<string>();
    candidates.forEach((candidate) => {
        if (candidate.matcher === "candidate_quadrants") {
            easyPairs.add(pairKey(candidate.sourceColumn, candidate.targetColumn));
        }
    });

    const scoreByMatcherAndPair = new Map<string, number>();
    candidates.forEach((candidate) => {
        if (!candidate.matcher) return;
        const key = JSON.stringify([
            candidate.matcher,
            candidate.sourceColumn,
            candidate.targetColumn,
        ]);

        const prev = scoreByMatcherAndPair.get(key);
        if (prev == null || candidate.score > prev) {
            scoreByMatcherAndPair.set(key, candidate.score);
        }
    });

    const nonEasyGroundTruthPairs = groundTruth
        .map((candidate) => ({
            sourceColumn: candidate.sourceColumn,
            targetColumn: candidate.targetColumn,
        }))
        .filter(
            ({ sourceColumn, targetColumn }) =>
                !easyPairs.has(pairKey(sourceColumn, targetColumn))
        );

    const cachedSummariesList = await cachedExplanationSummariesRequest(
        nonEasyGroundTruthPairs
    );

    type PairExplanationWeights = {
        hasExplanations: boolean;
        supportByType: Partial<Record<ExplanationType, number>>;
        contradictByType: Partial<Record<ExplanationType, number>>;
    };

    const cachedWeightsByPair = new Map<string, PairExplanationWeights>();
    cachedSummariesList.forEach((item) => {
        if (!item?.sourceColumn || !item?.targetColumn) return;

        const supportByType: Partial<Record<ExplanationType, number>> = {};
        const contradictByType: Partial<Record<ExplanationType, number>> = {};
        EXPLANATION_TYPES.forEach((type) => {
            supportByType[type] = 0;
            contradictByType[type] = 0;
        });

        const explanationItems = Array.isArray(item.explanations)
            ? item.explanations
            : [];

        explanationItems.forEach((explanation) => {
            const rawType = explanation?.type;
            if (!rawType) return;

            const normalizedType = EXPLANATION_TYPES.includes(
                rawType as ExplanationType
            )
                ? (rawType as ExplanationType)
                : "other";

            const rawConfidence = Number(explanation?.confidence ?? 0);
            const confidence = Number.isFinite(rawConfidence)
                ? clamp01(rawConfidence)
                : 0;

            if (explanation?.isMatch) {
                supportByType[normalizedType] = Math.max(
                    supportByType[normalizedType] ?? 0,
                    confidence
                );
            } else {
                contradictByType[normalizedType] = Math.max(
                    contradictByType[normalizedType] ?? 0,
                    confidence
                );
            }
        });

        cachedWeightsByPair.set(pairKey(item.sourceColumn, item.targetColumn), {
            hasExplanations: explanationItems.length > 0,
            supportByType,
            contradictByType,
        });
    });

    const breakdowns: Record<string, MatcherExplanationBreakdown> = {};

    matchers.forEach((matcher) => {
        const explanationTypeSupportScores: Partial<Record<ExplanationType, number>> = {};
        const explanationTypeContradictScores: Partial<Record<ExplanationType, number>> = {};
        EXPLANATION_TYPES.forEach((type) => {
            explanationTypeSupportScores[type] = 0;
            explanationTypeContradictScores[type] = 0;
        });

        const breakdown: MatcherExplanationBreakdown = {
            exactMatchScore: 0,
            coveredGroundTruthScore: 0,
            coveredGroundTruthCount: 0,
            explainedGroundTruthCount: 0,
            missingExplanationCount: 0,
            explanationTypeSupportScores,
            explanationTypeContradictScores,
        };

        groundTruth.forEach((gtCandidate) => {
            const matcherScoreKey = JSON.stringify([
                matcher.name,
                gtCandidate.sourceColumn,
                gtCandidate.targetColumn,
            ]);
            const matcherScore = scoreByMatcherAndPair.get(matcherScoreKey);
            if (matcherScore == null) return;

            breakdown.coveredGroundTruthCount += 1;
            breakdown.coveredGroundTruthScore += matcherScore;

            const gtPairKey = pairKey(
                gtCandidate.sourceColumn,
                gtCandidate.targetColumn
            );
            if (easyPairs.has(gtPairKey)) {
                breakdown.exactMatchScore += matcherScore;
                return;
            }

            const weights = cachedWeightsByPair.get(gtPairKey);
            if (!weights || !weights.hasExplanations) {
                breakdown.missingExplanationCount += 1;
                return;
            }

            breakdown.explainedGroundTruthCount += 1;

            EXPLANATION_TYPES.forEach((type) => {
                const support = weights.supportByType[type] ?? 0;
                const contradict = weights.contradictByType[type] ?? 0;

                breakdown.explanationTypeSupportScores[type] =
                    (breakdown.explanationTypeSupportScores[type] ?? 0) +
                    matcherScore * support;
                breakdown.explanationTypeContradictScores[type] =
                    (breakdown.explanationTypeContradictScores[type] ?? 0) +
                    matcherScore * contradict;
            });
        });

        breakdowns[matcher.name] = breakdown;
    });

    return breakdowns;
}

type Metrics = {
    mrr: number;
    recall: number;
    f1: number;
    falsePositives: Candidate[];
    falseNegatives: Candidate[];
}

function calculateMetrics(matcherName: string, candidates: Candidate[], groundTruth: Candidate[]): Metrics {
    // Implement MRR calculation
    const matcherCandidates = candidates.filter((candidate) => candidate.matcher === matcherName)
        .sort((a, b) => b.score - a.score); // Sort in descending order by score
    
    const gtSourceColumns = [...new Set(groundTruth.map((candidate) => candidate.sourceColumn))];
    
    const metrics: Metrics = {
        mrr: 0,
        recall: 0,
        f1: 0,
        falsePositives: [],
        falseNegatives: [],
    };

    let totalCorrectPredictions = 0;

    gtSourceColumns.forEach((gtSourceColumn) => {
        const gtCandidates = groundTruth.filter((candidate) => candidate.sourceColumn === gtSourceColumn);
        if (gtCandidates.length === 0) {
            return;
        }
        
        const predictCandidates = matcherCandidates.filter((candidate) => candidate.sourceColumn === gtSourceColumn);

        let gtCovered = false;
        let gtRank = -1;
        
        // Find the first correct prediction and its rank
        for (let i = 0; i < predictCandidates.length; i++) {
            const candidate = predictCandidates[i];
            if (gtCandidates.some((gtCandidate) => gtCandidate.targetColumn === candidate.targetColumn)) {
                gtCovered = true;
                gtRank = i;
                break;
            }
        }

        // Collect false negatives
        predictCandidates.forEach(candidate => {
            if (!gtCandidates.some(gtCandidate => gtCandidate.targetColumn === candidate.targetColumn)) {
                metrics.falseNegatives.push(candidate);
            }
        });

        // Collect false positives
        gtCandidates.forEach(gtCandidate => {
            if (!predictCandidates.some(candidate => candidate.targetColumn === gtCandidate.targetColumn)) {
                metrics.falsePositives.push(gtCandidate);
            }
        });

        if (gtCovered) {
            totalCorrectPredictions++;
            metrics.mrr += 1 / (gtRank + 1);
        }
    });

    // Calculate recall
    metrics.recall = totalCorrectPredictions / gtSourceColumns.length;
    
    // Calculate precision
    const precision = totalCorrectPredictions / (totalCorrectPredictions + metrics.falsePositives.length);
    
    // Calculate F1 score
    metrics.f1 = (precision + metrics.recall) > 0 
        ? (2 * precision * metrics.recall) / (precision + metrics.recall) 
        : 0;
    
    // Calculate MRR
    metrics.mrr /= gtSourceColumns.length || 1; // Avoid division by zero
    
    return metrics;
}
