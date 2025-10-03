import { useMemo, useContext, useEffect, useRef } from 'react';
import * as d3 from "d3";
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';

type DashboardInterfacesState = {
    groupedSourceColumns: SourceColumn[];
    weightedAggregatedCandidates: AggregatedCandidate[];
    filteredSourceColumns: SourceColumn[];
}

type DashboardInterfacesProps = {
    candidates: Candidate[];
    matchers: Matcher[];
    sourceClusters: Map<string, string[]>;
    filters: {
        selectedCandidate?: Candidate;
        sourceColumns: string[];
        candidateType: string;
        candidateThreshold: number;
        selectedMatcher?: Matcher;
        status: string[];
    };
    pageNumber: number;
    pageSize: number;
    setTotalPages: (totalPages: number) => void;
    setSourceColumns: (sourceColumns: string[]) => void;
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
        setSourceColumns,
    }: DashboardInterfacesProps): DashboardInterfacesState => {

        const { selectedTargetNodes, selectedSourceNodes, setSelectedSourceNodes } = useContext(HighlightGlobalContext);
        const programmaticSourceColumnsUpdate = useRef(false);
        const lastSourceColumnsSetProgrammatically = useRef(false);

        const columnsBySourceCluster = useMemo(() => {
            const columnsBySourceCluster: string[] = [];
            if (selectedSourceNodes.length > 0 && sourceClusters.size > 0) {
                selectedSourceNodes.forEach(node => {
                    sourceClusters.get(node.node)?.forEach(column => {
                        columnsBySourceCluster.push(column);
                    })
                });
            }
            return columnsBySourceCluster;
        }, [sourceClusters, selectedSourceNodes]);

        // When source cluster selection drives the sourceColumns, mark it as programmatic.
        // When the cluster selection is cleared (empty), also reset sourceColumns if they were programmatically set.
        useEffect(() => {
            if (columnsBySourceCluster.length > 0) {
                programmaticSourceColumnsUpdate.current = true;
                lastSourceColumnsSetProgrammatically.current = true;
                setSourceColumns(columnsBySourceCluster);
            } else if (lastSourceColumnsSetProgrammatically.current) {
                // User cleared source node selection → clear sourceColumns that were set via clusters
                setSourceColumns([]);
                lastSourceColumnsSetProgrammatically.current = false;
            }
        }, [columnsBySourceCluster, setSourceColumns]);

        useEffect(() => {
            // If filters.sourceColumns is updated manually, clear selectedSourceNodes
            if (filters.sourceColumns.length > 0) {
                if (programmaticSourceColumnsUpdate.current) {
                    // Skip clearing when update is triggered by source cluster selection
                    programmaticSourceColumnsUpdate.current = false;
                    // Keep lastSourceColumnsSetProgrammatically as true
                    return;
                }
                // Manual update: reflect that sourceColumns are not programmatic anymore
                lastSourceColumnsSetProgrammatically.current = false;
                setSelectedSourceNodes([]);
            }
        }, [filters.sourceColumns, setSelectedSourceNodes]);

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

        const groupedSourceColumns = useMemo(() => {
            return Array.from(
                d3.group(weightedCandidates, d => d.sourceColumn),
                ([name, items]: [string, Candidate[]]) => {
                    return { name, status: items.some(item => item.status === 'accepted') ? 'complete' : (items.every(item => item.status === 'discarded') ? 'ignored' : 'incomplete'), maxScore: Math.floor(((d3.max(items, d => d.score) ?? 0) / 0.1)) * 0.1 } as SourceColumn;
                }
            );
        }, [weightedCandidates]);

        const filteredSourceColumns = useMemo(() => {
            let filteredGroupedSourceColumns = groupedSourceColumns;

            // Determine the list of source column names to display, adapting previous filteredSourceCluster logic
            if (filters?.sourceColumns) {
                if (columnsBySourceCluster.length > 0) {
                    filteredGroupedSourceColumns = filteredGroupedSourceColumns.filter(col => columnsBySourceCluster.includes(col.name));
                } else if (filters.sourceColumns.length > 0) {
                    // Source cluster selection overrides manual list
                    filteredGroupedSourceColumns = filteredGroupedSourceColumns.filter(col => filters.sourceColumns.includes(col.name));
                }
            }

            // Total pages should reflect the total number of selected names
            const totalCount = filteredGroupedSourceColumns.length;
            setTotalPages(Math.ceil(totalCount / pageSize));

            if (totalCount > pageSize) {
                const pageStart = (pageNumber - 1) * pageSize;
                const pageEnd = pageStart + pageSize;
                filteredGroupedSourceColumns = filteredGroupedSourceColumns.slice(pageStart, pageEnd);
            }

            // Filter grouped columns by the paged selection
            return filteredGroupedSourceColumns;
        }, [groupedSourceColumns, filters?.sourceColumns, columnsBySourceCluster, pageNumber, pageSize, setTotalPages]);


        const weightedAggregatedCandidates = useMemo(() => {

            let filteredData = [...weightedCandidates];
            if (filteredSourceColumns && filteredSourceColumns.length > 0) {
                const allowed = new Set(filteredSourceColumns.map(c => c.name));
                filteredData = filteredData.filter((d) => allowed.has(d.sourceColumn));
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

            // columnsBySourceCluster effect is already reflected in filteredSourceColumns
            
            return filteredData;
        }, [weightedCandidates, filteredSourceColumns, filters.candidateThreshold, filters.status, selectedTargetNodes, selectedSourceNodes]);

        return {
            groupedSourceColumns,
            weightedAggregatedCandidates,
            filteredSourceColumns,
        };
    }
}