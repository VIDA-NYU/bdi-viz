import { useState, useEffect, useMemo, useContext } from 'react';
import * as d3 from "d3";
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';

type DashboardInterfacesState = {
    filteredSourceCluster: string[];
    weightedAggregatedCandidates: AggregatedCandidate[];
    filteredSourceColumns: SourceColumn[];
}

type DashboardInterfacesProps = {
    candidates: Candidate[];
    matchers: Matcher[];
    sourceClusters: Map<string, string[]>;
    filters: {
        selectedCandidate?: Candidate;
        sourceColumn: string;
        candidateType: string;
        candidateThreshold: number;
        selectedMatcher?: Matcher;
        status: string[];
    };
    pageNumber: number;
    pageSize: number;
    setTotalPages: (totalPages: number) => void;
}

export type { DashboardInterfacesState };

export const {
    useDashboardInterfaces
} = {
    useDashboardInterfaces: ({
        candidates,
        matchers,
        sourceClusters,
        filters,
        pageNumber,
        pageSize,
        setTotalPages,
    }: DashboardInterfacesProps): DashboardInterfacesState => {

        const { selectedTargetNodes, selectedSourceNodes } = useContext(HighlightGlobalContext);

        const columnsBySourceCluster = useMemo(() => {
            if (selectedSourceNodes.length > 0 && sourceClusters.size > 0) {
                const columnsBySourceCluster: string[] = [];
                selectedSourceNodes.forEach(node => {
                    sourceClusters.get(node.node)?.forEach(column => {
                        columnsBySourceCluster.push(column);
                    })
                });
                return columnsBySourceCluster;
            }
            return [];
        }, [sourceClusters, selectedSourceNodes]);

        // useWhatChanged([filters.sourceColumn, filters.selectedMatchers, filters.similarSources, filters.candidateThreshold, filters.candidateType]);

        const weightedCandidates = useMemo(() => {
            const aggregatedCandidates = Array.from(d3.group(candidates, d => d.sourceColumn + d.targetColumn), ([_, items]) => {
                const score = d3.sum(items, d => d.score * (matchers.find(m => m.name === d.matcher)?.weight ?? 1));
                return {
                    sourceColumn: items[0].sourceColumn,
                    targetColumn: items[0].targetColumn,
                    matchers: items.map(d => d.matcher).filter((m): m is string => m !== undefined),
                    score: score > 1 ? 1 : score,
                    status: items.some(item => item.status === 'accepted') ? 'accepted' : items.some(item => item.status === 'rejected') ? 'rejected' : (items.every(item => item.status === 'discarded') ? 'discarded' : 'idle'),
                };
            }).flat().sort((a, b) => b.score - a.score);

            return aggregatedCandidates;
        }, [candidates, matchers]);

        const filteredSourceColumns = useMemo(() => {
            const groupedSourceColumns = Array.from(d3.group(weightedCandidates, d => d.sourceColumn), ([name, items]: [string, Candidate[]]) => {
                return {
                    name,
                    status: items.some(item => item.status === 'accepted') ? 'complete' : (items.every(item => item.status === 'discarded') ? 'ignored' : 'incomplete'),
                    maxScore: Math.floor(((d3.max(items, d => d.score) ?? 0) / 0.1)) * 0.1,
                } as SourceColumn;
            });

            return groupedSourceColumns;
        }, [weightedCandidates]);


        useEffect(() => {
            setTotalPages(Math.ceil(filteredSourceColumns.length / pageSize));
        }, [filteredSourceColumns, pageSize, setTotalPages]);


        const filteredSourceCluster = useMemo(() => {
            if (filters?.sourceColumn) {
                if (filters.sourceColumn === 'all') {
                    const pageStart = (pageNumber - 1) * pageSize;
                    const pageEnd = pageStart + pageSize;

                    const pageSources = filteredSourceColumns.map(d => d.name).slice(pageStart, pageEnd);
                    return pageSources;
                } else if (columnsBySourceCluster.length > 0) {
                    return columnsBySourceCluster;
                } else {
                    return [filters.sourceColumn];
                }
            }
            return filteredSourceColumns.map(d => d.name);
        }, [filters.sourceColumn, pageNumber, pageSize, filteredSourceColumns, selectedSourceNodes, columnsBySourceCluster]);

        const weightedAggregatedCandidates = useMemo(() => {

            let filteredData = [...weightedCandidates];
            if (filteredSourceCluster && filteredSourceCluster.length > 0) {
                filteredData = filteredData.filter((d) => filteredSourceCluster.includes(d.sourceColumn));
            }

            if (filters?.candidateThreshold) {
                filteredData = filteredData.filter((d) => d.score >= filters.candidateThreshold);
            }

            if (filters.status.length > 0) {
                filteredData = filteredData.filter((d) => filters.status.includes(d.status));
            }

            if (selectedTargetNodes.length > 0) {
                const columns = selectedTargetNodes.map(node => node.columns).flat();
                filteredData = filteredData.filter((d) => columns.includes(d.targetColumn));
            }

            if (columnsBySourceCluster.length > 0) {
                filteredData = filteredData.filter((d) => columnsBySourceCluster.includes(d.sourceColumn));
            }
            
            return filteredData;
        }, [weightedCandidates, filteredSourceCluster, filters.candidateThreshold, filters.status, selectedTargetNodes, selectedSourceNodes]);

        return {
            filteredSourceCluster,
            weightedAggregatedCandidates,
            filteredSourceColumns,
        };
    }
}