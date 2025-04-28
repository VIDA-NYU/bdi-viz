import { useState, useEffect, useCallback } from 'react';

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
    enabled = true 
}: matcherAnalysisProps): matcherAnalysisState => {
    const [matcherNames, setMatcherNames] = useState<string[]>([]);
    const [groundTruth, setGroundTruth] = useState<Candidate[]>([]);
    const [matcherMetrics, setMatcherMetrics] = useState<MatcherAnalysis[]>([]);

    // Effect to update matcher names when matchers change
    useEffect(() => {
        if (!enabled) return;
        
        const names = matchers.map((matcher) => matcher.name);
        setMatcherNames(names);
    }, [matchers, enabled]);

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
        
        if (!matcherNames.length || !candidates.length || !groundTruth.length) {
            setMatcherMetrics([]);
            return;
        }
        
        const metrics = matcherNames.map((matcher) => {
            // Calculate metrics using candidates if available
            const {mrr, recall, f1, falsePositives, falseNegatives} = calculateMetrics(matcher, candidates, groundTruth);
            return {
                name: matcher,
                description: "",
                mrr: mrr,
                recallGt: recall,
                f1Score: f1,
                falsePositives: falsePositives,
                falseNegatives: falseNegatives,
            };
        });
        
        setMatcherMetrics(metrics);
    }, [candidates, matcherNames, groundTruth, enabled]);

    return { matcherMetrics };
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
