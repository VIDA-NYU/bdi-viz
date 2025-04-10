import React, { useMemo, useState } from 'react';
import { useTheme } from "@mui/material/styles";
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import InfoIcon from '@mui/icons-material/Info';
import { styled, Tooltip } from '@mui/material';
import { useResizedSVG, useResizedSVGRef } from '../hooks/resize-hooks';


// Define the connection type
interface ValueConnection {
  source: string;
  target: string;
  sourceX: number;
  targetX: number;
  frequency: number;
  sourceCount: number;
  targetCount: number;
}

interface ParallelCoordinatesProps {
  valueMatches: ValueMatch[];
  weightedAggregatedCandidates: AggregatedCandidate[];
  selectedCandidate?: Candidate;
  selectedSourceColumn: string;
}


const ContentContainer = styled("div")(
    {
        width: "100%",
        flexBasis: "300",
        flexGrow: 1
    }
)

const ParallelCoordinatesVisualization: React.FC<ParallelCoordinatesProps> = ({
  valueMatches,
  weightedAggregatedCandidates,
  selectedCandidate,
  selectedSourceColumn
}) => {
  const theme = useTheme();
  const [showAllConnections, setShowAllConnections] = useState(false);
  const [highlightedValue, setHighlightedValue] = useState<string | null>(null);

  // Get the active candidate data
  const candidateData = useMemo(() => {
    if (!selectedCandidate) return null;
    
    // Find relevant value match data
    const valueMatch = valueMatches.find(vm => 
      vm.sourceColumn === selectedCandidate.sourceColumn
    );
    
    if (!valueMatch) return null;
    
    // Find target match data
    const targetMatch = valueMatch.targets.find(target => 
      target.targetColumn === selectedCandidate.targetColumn
    );
    
    if (!targetMatch) return null;
    
    // Get source and target values
    return {
      sourceColumn: selectedCandidate.sourceColumn,
      targetColumn: selectedCandidate.targetColumn,
      sourceValues: valueMatch.sourceValues,
      targetValues: targetMatch.targetValues,
      score: selectedCandidate.score
    };
  }, [selectedCandidate, valueMatches]);

  // Get exact row mapping data (using your provided code approach)
  const rowData = useMemo(() => {
    if (!selectedCandidate) return [];
    
    const valueMatch = valueMatches.find(
      (valueMatch) => valueMatch.sourceColumn === selectedCandidate.sourceColumn
    );
    
    if (!valueMatch) return [];
    
    const targetColumns = weightedAggregatedCandidates
      .filter((aggCandidate) => aggCandidate.sourceColumn === selectedCandidate.sourceColumn)
      .map((aggCandidate) => aggCandidate.targetColumn);
    
    return valueMatch.sourceValues.map((sourceValue, index) => {
      const rowObj: Record<string, any> = {
        id: index,
        [`${valueMatch.sourceColumn}(source)`]: sourceValue,
      };
      
      const targetValueMatches = targetColumns
        .map((targetColumn) =>
          valueMatch.targets.find((target) => target.targetColumn === targetColumn)
        )
        .filter(target => target !== undefined);
      
      targetValueMatches.forEach((targetObj) => {
        const targetColumn = targetObj.targetColumn;
        const targetValue =
          targetObj.targetValues[index] !== undefined ? targetObj.targetValues[index] : "";
        rowObj[targetColumn] = targetValue;
      });
      
      return rowObj;
    });
  }, [valueMatches, weightedAggregatedCandidates, selectedCandidate, selectedSourceColumn]);

  // Extract direct value mappings from row data
  const directMappings = useMemo(() => {
    if (!candidateData || !rowData.length) return [];
    
    const mappings: { source: string, target: string }[] = [];
    
    rowData.forEach(row => {
      const sourceKey = `${candidateData.sourceColumn}(source)`;
      const sourceValue = row[sourceKey];
      const targetValue = row[candidateData.targetColumn];
      
      // Skip empty values
      if (!sourceValue || !targetValue) return;
      
      mappings.push({
        source: sourceValue,
        target: targetValue
      });
    });
    
    return mappings;
  }, [candidateData, rowData]);

  // Get source value frequencies
  const sourceValueCounts = useMemo(() => {
    if (!candidateData) return new Map<string, number>();
    
    // We'll build frequency counts from the valueMatches data
    const countMap = new Map<string, number>();
    const valueMatch = valueMatches.find(vm => vm.sourceColumn === candidateData.sourceColumn);
    
    if (!valueMatch) return countMap;
    
    // Count occurrences of each source value
    valueMatch.sourceValues.forEach(value => {
      if (!value) return;
      countMap.set(value, (countMap.get(value) || 0) + 1);
    });
    
    return countMap;
  }, [candidateData, valueMatches]);

  // Get total source count for percentage calculations
  const totalSourceCount = useMemo(() => {
    return Array.from(sourceValueCounts.values()).reduce((sum, count) => sum + count, 0);
  }, [sourceValueCounts]);

  // Get target value frequencies
  const targetValueCounts = useMemo(() => {
    if (!candidateData) return new Map<string, number>();
    
    const countMap = new Map<string, number>();
    const valueMatch = valueMatches.find(vm => vm.sourceColumn === candidateData.sourceColumn);
    
    if (!valueMatch) return countMap;
    
    // Find the target match
    const targetMatch = valueMatch.targets.find(t => t.targetColumn === candidateData.targetColumn);
    
    if (!targetMatch) return countMap;
    
    // Count occurrences of each target value
    targetMatch.targetValues.forEach(value => {
      if (!value) return;
      countMap.set(value, (countMap.get(value) || 0) + 1);
    });
    
    return countMap;
  }, [candidateData, valueMatches]);
  
  // Get total target count for percentage calculations
  const totalTargetCount = useMemo(() => {
    return Array.from(targetValueCounts.values()).reduce((sum, count) => sum + count, 0);
  }, [targetValueCounts]);

  // Compute the unique source and target values
  const uniqueValues = useMemo(() => {
    if (!candidateData) return { sourceValues: [], targetValues: [] };
    
    // Get unique source values
    const uniqueSourceValues = Array.from(new Set(candidateData.sourceValues))
      .filter(v => v !== undefined && v !== "");
      
    // Get unique target values
    const uniqueTargetValues = Array.from(new Set(candidateData.targetValues))
      .filter(v => v !== undefined && v !== "");
      
    return {
      sourceValues: uniqueSourceValues,
      targetValues: uniqueTargetValues
    };
  }, [candidateData]);

  

  // Setup responsive SVG sizing
  const {ref: svgRef, svgHeight, svgWidth} = useResizedSVGRef();
  const margin = {
    top: 0,
    right: 10,
    bottom: 20,
    left: 10
  };
  const width = svgWidth - margin.left - margin.right;
  const height = svgHeight - margin.top - margin.bottom;
  // Calculate the position for each value (horizontal layout)
  

  // Vertical positions of the axes (relative to available height)
  const sourceAxisY = Math.min(100, height * 0.15);
  const targetAxisY = Math.min(250, height * 0.7);
  
  // Horizontal margin for the axes (left and right padding)
  const axisMargin = Math.min(60, width * 0.05);
  const valuePositions = useMemo(() => {
    if (!candidateData) return { sourcePositions: new Map(), targetPositions: new Map() };
    
    // Sort by frequency to make most common values more prominent
    const sortedSourceValues = [...uniqueValues.sourceValues]
      .sort((a, b) => (sourceValueCounts.get(b) || 0) - (sourceValueCounts.get(a) || 0));
    
    const sortedTargetValues = [...uniqueValues.targetValues]
      .sort((a, b) => (targetValueCounts.get(b) || 0) - (targetValueCounts.get(a) || 0));
    
    // Position calculation for horizontal layout of values
    const sourcePositions = new Map<string, { x: number, width: number }>();
    const targetPositions = new Map<string, { x: number, width: number }>();
    
    // Width of the axis (horizontal space available for values)
    const axisWidth = width - axisMargin * 2;
    
    // Minimum width for small values so they're still visible
    const minWidth = 20;
    
    // Calculate positions for source values
    let currentX = 0;
    sortedSourceValues.forEach(value => {
      const count = sourceValueCounts.get(value) || 0;
      const percentage = count / totalSourceCount;
      // Ensure minimum width for visibility while maintaining proportions
      const width = Math.max(minWidth, axisWidth * percentage);
      
      sourcePositions.set(value, {
        x: currentX,
        width: width
      });
      
      currentX += width;
    });
    
    // Calculate positions for target values
    currentX = 0;
    sortedTargetValues.forEach(value => {
      const count = targetValueCounts.get(value) || 0;
      const percentage = count / totalTargetCount;
      // Ensure minimum width for visibility while maintaining proportions
      const width = Math.max(minWidth, axisWidth * percentage);
      
      targetPositions.set(value, {
        x: currentX,
        width: width
      });
      
      currentX += width;
    });
    
    return { sourcePositions, targetPositions };
  }, [
    width,
    axisMargin,
    candidateData, 
    uniqueValues, 
    sourceValueCounts, 
    targetValueCounts, 
    totalSourceCount, 
    totalTargetCount,
  ]);

  // Calculate value-to-value connections based on direct mappings
  const connections = useMemo<ValueConnection[]>(() => {
    if (!candidateData) return [];
    
    const links: ValueConnection[] = [];
    const { sourcePositions, targetPositions } = valuePositions;
    
    // Create a map to count frequency of connections
    const connectionFrequency = new Map<string, number>();
    
    // Count occurrences of each source-target pair
    directMappings.forEach(mapping => {
      const key = `${mapping.source}|${mapping.target}`;
      connectionFrequency.set(key, (connectionFrequency.get(key) || 0) + 1);
    });
    
    // Create unique connections with frequency count
    const uniqueConnections = new Map<string, { source: string, target: string, frequency: number }>();
    
    directMappings.forEach(mapping => {
      const key = `${mapping.source}|${mapping.target}`;
      if (!uniqueConnections.has(key)) {
        uniqueConnections.set(key, {
          source: mapping.source,
          target: mapping.target,
          frequency: connectionFrequency.get(key) || 1
        });
      }
    });
    
    // Generate connection objects
    uniqueConnections.forEach(connection => {
      const sourcePos = sourcePositions.get(connection.source);
      const targetPos = targetPositions.get(connection.target);
      
      if (sourcePos && targetPos) {
        links.push({
          source: connection.source,
          target: connection.target,
          // Center point of each rectangle
          sourceX: sourcePos.x + sourcePos.width / 2,
          targetX: targetPos.x + targetPos.width / 2,
          frequency: connection.frequency,
          sourceCount: sourceValueCounts.get(connection.source) || 0,
          targetCount: targetValueCounts.get(connection.target) || 0,
        });
      }
    });
    
    return links;
  }, [candidateData, valuePositions, sourceValueCounts, targetValueCounts, directMappings]);

  if (!candidateData) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6">
          Select a column pair to visualize value alignments
        </Typography>
      </Box>
    );
  }
  // Get the maximum frequency for scaling connection width
  const maxFrequency = Math.max(...connections.map(c => c.frequency));
  
  // Function to generate a path for area connections in Sankey style
  const generateAreaPath = (connection: ValueConnection) => {
    const sourcePos = valuePositions.sourcePositions.get(connection.source);
    const targetPos = valuePositions.targetPositions.get(connection.target);
    
    if (!sourcePos || !targetPos) return '';
    
    // Calculate the corners of the source and target rectangles
    const sourceLeft = sourcePos.x + axisMargin;
    const sourceRight = sourceLeft + sourcePos.width;
    const targetLeft = targetPos.x + axisMargin;
    const targetRight = targetLeft + targetPos.width;
    
    // Width factor based on connection frequency
    const widthFactor = connection.frequency / maxFrequency;
    // Scale the width by a factor for visual emphasis
    const effectiveSourceWidth = sourcePos.width * Math.max(0.2, widthFactor);
    const effectiveTargetWidth = targetPos.width * Math.max(0.2, widthFactor);
    
    // Calculate the middle point of the source and target rectangles
    const sourceMiddle = sourceLeft + sourcePos.width / 2;
    const targetMiddle = targetLeft + targetPos.width / 2;
    
    // Calculate the start and end points with adjusted widths
    const sourceLeftPoint = Math.max(sourceLeft, sourceMiddle - effectiveSourceWidth / 2);
    const sourceRightPoint = Math.min(sourceRight, sourceMiddle + effectiveSourceWidth / 2);
    const targetLeftPoint = Math.max(targetLeft, targetMiddle - effectiveTargetWidth / 2);
    const targetRightPoint = Math.min(targetRight, targetMiddle + effectiveTargetWidth / 2);
    
    // Create control points for smoother curves (Sankey-style)
    const sourceMidPoint = (sourceLeftPoint + sourceRightPoint) / 2;
    const targetMidPoint = (targetLeftPoint + targetRightPoint) / 2;
    
    // Adjusted control points for smoother flow
    const cp1x = sourceMidPoint;
    const cp1y = sourceAxisY + (targetAxisY - sourceAxisY) / 3;
    const cp2x = targetMidPoint;
    const cp2y = sourceAxisY + 2 * (targetAxisY - sourceAxisY) / 3;
    
    // Create the path for the area connection (Sankey-style)
    return `
      M ${sourceLeftPoint} ${sourceAxisY + 15}
      L ${sourceRightPoint} ${sourceAxisY + 15}
      C ${sourceRightPoint} ${cp1y}, ${targetRightPoint} ${cp2y}, ${targetRightPoint} ${targetAxisY - 15}
      L ${targetLeftPoint} ${targetAxisY - 15}
      C ${targetLeftPoint} ${cp2y}, ${sourceLeftPoint} ${cp1y}, ${sourceLeftPoint} ${sourceAxisY + 15}
      Z
    `;
  };
  
  // Get connection color
  const getConnectionColor = (connection: ValueConnection) => {
    // If no value is highlighted, connections stay grey
    if (highlightedValue === null) {
      // Vary opacity based on frequency for better visual hierarchy in default state
      const normalizedFrequency = connection.frequency / maxFrequency;
      const opacity = 0.15 + (normalizedFrequency * 0.25); // Scale from 0.15 to 0.4
      return alpha('#c0c0c0', opacity); // Light grey with variable opacity
    }
    
    // Base color similar to the example figure (pinkish/reddish)
    const baseColor = '#d85a7f';
    
    // If this connection is related to the highlighted value, use the color
    if (highlightedValue === connection.source || highlightedValue === connection.target) {
      return baseColor;
    }
    
    // Connections not related to the highlighted value stay grey but more faded
    return alpha('#e0e0e0', 0.1);
  };
  
  // Get value rect color
  const getValueRectColor = (value: string, isSource: boolean) => {
    // Base colors - match the connection color scheme for consistency
    const highlightedSourceColor = '#d85a7f'; // Pink for source
    const highlightedTargetColor = '#a0a0a0'; // Gray for target
    
    // Default state (no highlighting) - vary opacity by frequency
    if (highlightedValue === null) {
      const count = isSource 
        ? sourceValueCounts.get(value) || 0
        : targetValueCounts.get(value) || 0;
      const total = isSource ? totalSourceCount : totalTargetCount;
      const percentage = count / total;
      const opacity = 0.3 + (percentage * 0.4); // Scale from 0.3 to 0.7 based on frequency
      
      return alpha('#c0c0c0', opacity); // Light gray with variable opacity
    }
    
    // If this value is highlighted
    if (highlightedValue === value) {
      return isSource ? highlightedSourceColor : highlightedTargetColor;
    }
    
    // If this value is connected to the highlighted value
    const isConnected = connections.some(conn => 
      (conn.source === highlightedValue && conn.target === value) ||
      (conn.target === highlightedValue && conn.source === value)
    );
    
    if (isConnected) {
      return isSource ? highlightedSourceColor : highlightedTargetColor;
    }
    
    // Not related to the highlighted value - very faded
    return alpha('#e0e0e0', 0.2);
  };

  return (
    <Paper 
      elevation={1} 
      sx={{ 
        p: 2, 
        m: 2,
        backgroundColor: theme.palette.background.paper,
        overflow: 'hidden'
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Value Alignment Visualization
          <Tooltip title="This visualization shows how individual values map between the source and target columns. The width of each rectangle represents the frequency of that value.">
            <InfoIcon fontSize="small" sx={{ ml: 1, verticalAlign: 'middle', color: theme.palette.text.secondary }} />
          </Tooltip>
        </Typography>
        
        <FormControlLabel
          control={
            <Switch
              checked={showAllConnections}
              onChange={(e) => setShowAllConnections(e.target.checked)}
              color="primary"
            />
          }
          label="Show all connections"
        />
      </Box>
      
      <Box sx={{ display: "flex", flexDirection: "column",overflow: 'auto', maxWidth: '100%', height: "300px", paddingBottom: 0 }}>
        <ContentContainer>
        <svg width={"100%"} height={"100%"} ref={svgRef}>
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="1" dy="1" stdDeviation="2" floodOpacity="0.2" />
            </filter>
          </defs>
          
          {/* Connections between values */}
          <g>
            {/* Render all connections with proper sorting so highlighted ones are on top */}
            {connections
              .filter(conn => showAllConnections || conn.frequency > 1)
              .sort((a, b) => {
                // Sort so that highlighted connections are drawn on top
                if (highlightedValue === a.source || highlightedValue === a.target) return 1;
                if (highlightedValue === b.source || highlightedValue === b.target) return -1;
                return b.frequency - a.frequency; // Otherwise sort by frequency
              })
              .map((connection, index) => (
                <path
                  key={`connection-${index}`}
                  d={generateAreaPath(connection)}
                  fill={getConnectionColor(connection)}
                  stroke="none"
                  style={{
                    transition: 'fill 0.3s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={() => {
                    setHighlightedValue(connection.source);
                  }}
                  onMouseLeave={() => {
                    setHighlightedValue(null);
                  }}
                />
              ))}
          </g>
          
          {/* Axis labels */}
          <text 
            x={width / 2} 
            y={sourceAxisY - 30} 
            textAnchor="middle" 
            fontWeight="bold"
            fontSize="16"
            fill={theme.palette.text.primary}
          >
            {candidateData.sourceColumn}
          </text>
          
          {/* Target axis label positioned BELOW the axis */}
          <text 
            x={width / 2} 
            y={targetAxisY + 60} 
            textAnchor="middle" 
            fontWeight="bold"
            fontSize="16"
            fill={theme.palette.text.primary}
          >
            {candidateData.targetColumn}
          </text>
          
          {/* Source values */}
          <g>
            {uniqueValues.sourceValues.map((value) => {
              const posInfo = valuePositions.sourcePositions.get(value);
              if (!posInfo) return null;
              
              const { x, width } = posInfo;
              const count = sourceValueCounts.get(value) || 0;
              const percentage = ((count / totalSourceCount) * 100).toFixed(1);
              
              const isHighlighted = highlightedValue === value;
              const rectHeight = 25; // Reduced height
              const rectX = x + axisMargin;
              
              return (
                <g 
                  key={`source-${value}`}
                  onMouseEnter={() => setHighlightedValue(value)}
                  onMouseLeave={() => setHighlightedValue(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={rectX}
                    y={sourceAxisY - rectHeight / 2}
                    width={width}
                    height={rectHeight}
                    fill={getValueRectColor(value, true)}
                    rx={4}
                    ry={4}
                    filter={isHighlighted ? "url(#shadow)" : undefined}
                    style={{ transition: 'fill 0.3s, filter 0.3s' }}
                  />
                  
                  {/* Only show text if there's enough space */}
                  {width > 40 && (
                    <text
                      x={rectX + width / 2}
                      y={sourceAxisY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={theme.palette.getContrastText(getValueRectColor(value, true))}
                      style={{ 
                        fontSize: width > 80 ? '14px' : '12px',
                        fontWeight: isHighlighted ? 'bold' : 'normal',
                        transition: 'font-weight 0.3s'
                      }}
                    >
                      {value}
                    </text>
                  )}
                  
                  {/* Percentage label below - only show for wider rectangles */}
                  {width > 80 && (
                    <text
                      x={rectX + width / 2}
                      y={sourceAxisY + rectHeight / 2 + 15}
                      textAnchor="middle"
                      fontSize="10"
                      fill={theme.palette.text.secondary}
                    >
                      {percentage}%
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          
          {/* Target values */}
          <g>
            {uniqueValues.targetValues.map((value) => {
              const posInfo = valuePositions.targetPositions.get(value);
              if (!posInfo) return null;
              
              const { x, width } = posInfo;
              const count = targetValueCounts.get(value) || 0;
              const percentage = ((count / totalTargetCount) * 100).toFixed(1);
              
              const isHighlighted = highlightedValue === value;
              const rectHeight = 30;
              const rectX = x + axisMargin;
              
              return (
                <g 
                  key={`target-${value}`}
                  onMouseEnter={() => setHighlightedValue(value)}
                  onMouseLeave={() => setHighlightedValue(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={rectX}
                    y={targetAxisY - rectHeight / 2}
                    width={width}
                    height={rectHeight}
                    fill={getValueRectColor(value, false)}
                    rx={4}
                    ry={4}
                    filter={isHighlighted ? "url(#shadow)" : undefined}
                    style={{ transition: 'fill 0.3s, filter 0.3s' }}
                  />
                  
                  {/* Only show text if there's enough space */}
                  {width > 40 && (
                    <text
                      x={rectX + width / 2}
                      y={targetAxisY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={theme.palette.getContrastText(getValueRectColor(value, false))}
                      style={{ 
                        fontSize: width > 80 ? '14px' : '12px',
                        fontWeight: isHighlighted ? 'bold' : 'normal',
                        transition: 'font-weight 0.3s'
                      }}
                    >
                      {value}
                    </text>
                  )}
                  
                  {/* Percentage label below - only show for wider rectangles */}
                  {width > 80 && (
                    <text
                      x={rectX + width / 2}
                      y={targetAxisY + rectHeight / 2 + 15}
                      textAnchor="middle"
                      fontSize="10"
                      fill={theme.palette.text.secondary}
                    >
                      {percentage}%
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        </ContentContainer>
      </Box>
      
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">
          Column Match Score: {(candidateData.score * 100).toFixed(1)}%
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {connections.length} unique value connections
        </Typography>
      </Box>
    </Paper>
  );
};

export default ParallelCoordinatesVisualization;