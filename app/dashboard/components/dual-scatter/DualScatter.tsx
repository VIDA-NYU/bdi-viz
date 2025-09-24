// components/SchemaViz/index.tsx
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useSchemaLayout, useScoreThreshold } from './useScatterLayout';
import { FeatureCircle } from './FeatureCircle';
import { ClusterSelector } from './ClusterSelector';
import { line, curveBasis } from 'd3';
import { ClusterBackground } from './ClusterBackground';
import { getClusterColors } from './colors';
import { Box, Container, Card, Typography } from '@mui/material';
import UnifiedTooltip from '@/app/lib/ui/UnifiedTooltip';
import { useLassoSelection } from './useLassoSelection';


interface SchemaVizProps {
    candidates: Candidate[];
    updateHighlightSourceColumns: (sourceColumns: Array<string>) => void;
    updateHighlightTargetColumns: (targetColumns: Array<string>) => void;
    width?: number;
    height?: number;
}

// components/SchemaViz/index.tsx

export const DualScatter: React.FC<SchemaVizProps> = ({
    candidates,
    updateHighlightSourceColumns,
    updateHighlightTargetColumns,
    width = 1200,
    height = 800
}) => {
    const { threshold, handleThresholdChange } = useScoreThreshold();

    const { sourceNodes, targetNodes, links, scoreRange } = useSchemaLayout(candidates, {
        threshold,
        normalizeScores: false
    });
    const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [manualClusters, setManualClusters] = useState<Array<{
        id: string,
        nodes: string[]
    }>>([]);

    const [manuallySelectedNodes, setManuallySelectedNodes] = useState<string[]>([]);

    
    const clusters = useMemo(() => [...new Set([
        ...sourceNodes.map(n => n.cluster),
        ...targetNodes.map(n => n.cluster)
    ])], [sourceNodes, targetNodes]);

    const clusterColorScale = useMemo(() => 
        getClusterColors(clusters), [clusters]);

    const {
        svgRef,
        isSelecting,
        selectionPath,
        selectedArea,
        startSelection,
        updateSelection,
        endSelection,
        isPointInSelection,
        clearSelection,
        getPathData
    } = useLassoSelection();

    

    const createClusterFromSelection = useCallback(() => {
        if (selectedArea.length < 3) return;

        const selectedTargetNodes = sourceNodes
            .concat(targetNodes)
            .filter(node => {
                const transformedPoint = {
                    x: node.coordinates.x + width/2,
                    y: node.coordinates.y + (
                        targetNodes.includes(node) ? height * 3/4 : height/4
                    )
                };
                return isPointInSelection(transformedPoint);
            })
            .map(node => node.name);
        
        if (selectedTargetNodes.length > 0) {
            setManualClusters(prev => [
                ...prev,
                {
                    id: `manual-cluster-${prev.length + 1}`,
                    nodes: selectedTargetNodes
                }
            ]);
        }

        clearSelection();
    }, [selectedArea, sourceNodes, targetNodes, width, height, isPointInSelection]);
    const selectedTargetNodes = sourceNodes
            .concat(targetNodes)
            .filter(node => {
                const transformedPoint = {
                    x: node.coordinates.x + width/2,
                    y: node.coordinates.y + (
                        targetNodes.includes(node) ? height * 3/4 : height/4
                    )
                };
                return isPointInSelection(transformedPoint);
            })
            .map(node => node.name);

    useEffect(() => {
        updateHighlightTargetColumns(
            selectedTargetNodes
        )
            }, [selectedTargetNodes])

    const createPath = line()
        .x(d => d[0])
        .y(d => d[1])
        .curve(curveBasis);

    // components/SchemaViz/index.tsx
const renderLinks = () => {
    // Sort links by score to render stronger links on top
    const sortedLinks = [...links].sort((a, b) => a.normalizedScore - b.normalizedScore);
    
    // Create curved paths with better control points
    const createCurvedPath = (source: {x: number, y: number}, target: {x: number, y: number}) => {
        const midY = (source.y + target.y) / 2;
        const controlPoint1Y = source.y + (midY - source.y) * 0.7;
        const controlPoint2Y = target.y - (target.y - midY) * 0.7;

        return `M ${source.x} ${source.y} 
                C ${source.x} ${controlPoint1Y} 
                  ${target.x} ${controlPoint2Y} 
                  ${target.x} ${target.y}`;
    };

    // Color scale for links based on score
    const getColor = (score: number) => {
        const alpha = 0.3 + score * 0.4; // Vary opacity based on score
        return `rgba(153, 153, 153, ${alpha})`;
    };

    return (
        <g className="links">
            {sortedLinks.map((link, i) => {
                const source = sourceNodes.find(n => n.name === link.sourceColumn);
                const target = targetNodes.find(n => n.name === link.targetColumn);
                
                if (!source || !target) return null;

                const sourcePoint = {
                    x: source.coordinates.x + width/4 + 70,
                    y: source.coordinates.y + height/4
                };
                const targetPoint = {
                    x: target.coordinates.x + width/4 + 70,
                    y: target.coordinates.y + height*3/4
                };

                const isHighlighted = hoveredNode === source.name || 
                                    hoveredNode === target.name;
                
                return (
                    <path
                        key={i}
                        d={createCurvedPath(sourcePoint, targetPoint)}
                        stroke={getColor(link.normalizedScore)}
                        strokeWidth={Math.max(2, link.normalizedScore * 2)}
                        fill="none"
                        opacity={isHighlighted ? 0.9 : 0.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            transition: 'opacity 0.2s ease',
                            filter: isHighlighted ? 'drop-shadow(0 0 2px rgba(0,0,0,0.2))' : 'none'
                        }}
                    />
                );
            })}
        </g>
    );
};

    return (
        <Container>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ClusterSelector
                    clusters={clusters}
                    selectedClusters={selectedClusters}
                    onClusterToggle={(cluster) => {
                        setSelectedClusters(prev =>
                            prev.includes(cluster)
                                ? prev.filter(c => c !== cluster)
                                : [...prev, cluster]
                        );
                    }}
                    threshold={threshold}
                    onThresholdChange={handleThresholdChange}
                    scoreRange={scoreRange}

                />
                <Card sx={{ position: 'relative', bgcolor: '#fefefe' }}>
                    {/* Source Schema Label */}
                    <Box sx={{
                        position: 'absolute',
                        top: height/4 + 6 ,
                        left: 34,
                        p: 1,
                        bgcolor: 'primary.main',
                        color: 'white',
                        borderRadius: '4px 4px 0 0',
                        transform: 'rotate(-90deg)',
                        transformOrigin: 'left bottom'
                    }}>
                        <Typography variant="subtitle2">Source Schema</Typography>
                    </Box>

                    {/* Target Schema Label */}
                    <Box sx={{
                        position: 'absolute',
                        top: 3*height/4 + 6 ,
                        left: 34,
                        p: 1,
                        bgcolor: 'secondary.main',
                        color: 'white',
                        borderRadius: '4px 4px 0 0',
                        transform: 'rotate(-90deg)',
                        transformOrigin: 'left bottom'
                    }}>
                        <Typography variant="subtitle2">Target Schema</Typography>
                    </Box>

                    {/* Divider */}
                    <Box sx={{
                        position: 'absolute',
                        top: '50%',
                        width: '100%',
                        height: '2px',
                        bgcolor: 'divider',
                        opacity: 0.5
                    }} />

                    <svg width={width} height={height}
                        onMouseDown={startSelection}
                        onMouseMove={updateSelection}
                        onMouseUp={endSelection}
                        onMouseLeave={endSelection}
                        ref={svgRef}
                    >
                        {/* Source Section */}
                        {isSelecting && selectionPath.length > 1 && (
                            <path
                                d={getPathData(selectionPath)}
                                fill="rgba(0, 0, 255, 0.1)"
                                stroke="blue"
                                strokeWidth={1}
                                strokeDasharray="5,5"
                            />
                        )}
                        
                        {/* Render final selection area */}
                        {selectedArea.length > 2 && (
                            <path
                                d={getPathData(selectedArea)}
                                fill="rgba(0, 0, 255, 0.1)"
                                stroke="blue"
                                strokeWidth={1}
                            />
                        )}

                        <g transform={`translate(${width/2}, ${height/4})`}>
                            {selectedClusters.map(cluster => (
                                <ClusterBackground
                                    key={cluster}
                                    nodes={sourceNodes}
                                    cluster={cluster}
                                    color={clusterColorScale(cluster)}
                                />
                            ))}
                            {sourceNodes.slice(0, 9).map((node, i) => (
                                <UnifiedTooltip key={i} title={node.name}>
                                    <g
                                        transform={`translate(${node.coordinates.x},${node.coordinates.y})`}
                                        onMouseEnter={() => setHoveredNode(node.name)}
                                        onMouseLeave={() => setHoveredNode(null)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <FeatureCircle
                                            features={node.features}
                                            size={40}
                                            selected={selectedClusters.includes(node.cluster)}
                                            degree={links.filter(l => l.sourceColumn === node.name).length || 0}
                                        />
                                    </g>
                                </UnifiedTooltip>
                            ))}
                        </g>

                        {/* Target Section */}
                        <g id={"target-background"} transform={`translate(${width/2}, ${height*3/4})`}>
                            {selectedClusters.map(cluster => (
                                <ClusterBackground
                                    key={cluster}
                                    nodes={targetNodes}
                                    cluster={cluster}
                                    color={clusterColorScale(cluster)}
                                />
                            ))}
                        </g>
                        <g transform={`translate(${width/2}, ${height*3/4})`}>
                            
                            {targetNodes.slice(0, 8).map((node, i) => (
                                <UnifiedTooltip key={i} title={node.name}>
                                    <g
                                        transform={`translate(${node.coordinates.x},${node.coordinates.y})`}
                                        onMouseEnter={() => setHoveredNode(node.name)}
                                        onMouseLeave={() => setHoveredNode(null)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <FeatureCircle
                                            degree={links.filter(l => l.targetColumn === node.name).length || 0}
                                            features={node.features}
                                            size={40}
                                            selected={selectedClusters.includes(node.cluster)}
                                        />
                                    </g>
                                </UnifiedTooltip>
                            ))}
                        </g>
                        
                        {renderLinks()}
                    </svg>
                </Card>
            </Box>
        </Container>
    );
};
