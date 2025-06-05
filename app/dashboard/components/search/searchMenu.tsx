'use client';

import React, { useState, useCallback, useContext } from 'react';
import { 
    Box, 
    TextField, 
    IconButton, 
    InputAdornment, 
    Button, 
    Chip, 
    Typography, 
    Tooltip,
    Divider,
    Badge
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import RefreshIcon from '@mui/icons-material/Refresh';
import { agentSearchRequest } from '@/app/lib/langchain/agent-helper';
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';
import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import { runRematchTask, getCachedResults, getTargetOntology, getValueBins, getValueMatches } from "@/app/lib/heatmap/heatmap-helper";

interface SearchMenuProps {
    agentSearchResultCallback: (candidates: Candidate[]) => void;
    rematchCallback: (candidates: Candidate[], sourceCluster: SourceCluster[]) => void;
    ontologyCallback: (targetOntology: TargetOntology[]) => void;
    uniqueValuesCallback: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
}

const SearchMenu: React.FC<SearchMenuProps> = ({
    agentSearchResultCallback,
    rematchCallback,
    ontologyCallback,
    uniqueValuesCallback,
    valueMatchesCallback
}) => {
    const [query, setQuery] = useState<string>('');
    const [agentActivated, setAgentActivated] = useState<boolean>(false);
    
    const { setGlobalQuery, selectedNodes } = useContext(HighlightGlobalContext);
    const { setIsLoadingGlobal, setTaskState } = useContext(SettingsGlobalContext);

    const handleKeyPress = async (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter') {
            await handleSearch();
        }
    };

    const handleSearch = useCallback(async () => {
        if (agentActivated) {
            const candidates = await agentSearchRequest(query);
            if (candidates) {
                console.log("Candidates: ", candidates);
                agentSearchResultCallback(candidates);
            }
        } else {
            console.log("Global query: ", query);
            setGlobalQuery(query);
        }
    }, [query, agentActivated, agentSearchResultCallback, setGlobalQuery]);

    const handleClearSearch = () => {
        setQuery('');
        setGlobalQuery(undefined);
        agentSearchResultCallback([]);
    };

    const handleRematch = () => {
        console.log("Rematch task start with nodes: ", selectedNodes);
        try {
            setIsLoadingGlobal(true);
            runRematchTask({
                nodes: selectedNodes,
                onResult: (result) => {
                    console.log("Matching task completed with result:", result);
                    getCachedResults({ callback: rematchCallback });
                    getTargetOntology({ callback: ontologyCallback });
                    getValueBins({ callback: uniqueValuesCallback });
                    getValueMatches({ callback: valueMatchesCallback });
                    setIsLoadingGlobal(false);
                },
                onError: (error) => {
                    console.error("Matching task failed with error:", error);
                    setIsLoadingGlobal(false);
                },
                taskStateCallback: (taskState) => {
                    console.log("Task state:", taskState);
                    setTaskState(taskState);
                }
            });
        } catch (error) {
            console.error("Error running rematch task:", error);
            setIsLoadingGlobal(false);
        }
    };

    const selectedNodesCount = selectedNodes?.length || 0;
    const hasSelectedNodes = selectedNodesCount > 0;

    return (
        <Box 
            sx={{ 
                backgroundColor: '#1976d2',
                borderRadius: 2,
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                width: '100%',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
        >
            {/* Search Bar */}
            <Box sx={{ flexGrow: 1, maxWidth: 300 }}>
                <TextField
                    variant="outlined"
                    placeholder="Search or ask AI..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (!agentActivated) {
                            setGlobalQuery(e.target.value);
                        }
                    }}
                    onKeyDown={handleKeyPress}
                    size="small"
                    sx={{ 
                        width: '100%',
                        '& .MuiOutlinedInput-root': {
                            backgroundColor: 'white',
                            fontSize: '0.8rem',
                            height: 36,
                            '& fieldset': {
                                border: 'none',
                            },
                            '&:hover fieldset': {
                                border: 'none',
                            },
                            '&.Mui-focused fieldset': {
                                border: '2px solid #ffffff',
                            },
                        },
                        '& .MuiInputBase-input': {
                            padding: '8px 12px',
                        }
                    }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: 'action.active', fontSize: 18 }} />
                            </InputAdornment>
                        ),
                        endAdornment: (
                            <InputAdornment position="end">
                                {query && (
                                    <Tooltip title="Clear search">
                                        <IconButton
                                            onClick={handleClearSearch}
                                            size="small"
                                            sx={{ 
                                                p: 0.5,
                                                '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' }
                                            }}
                                        >
                                            <ClearIcon sx={{ fontSize: 16 }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                                <Tooltip title={agentActivated ? 'Deactivate AI agent' : 'Activate AI agent'}>
                                    <IconButton
                                        onClick={() => setAgentActivated(!agentActivated)}
                                        size="small"
                                        sx={{ 
                                            backgroundColor: agentActivated ? '#4caf50' : '#e0e0e0',
                                            color: agentActivated ? 'white' : '#666',
                                            borderRadius: 1,
                                            width: 28,
                                            height: 28,
                                            ml: 0.5,
                                            '&:hover': {
                                                backgroundColor: agentActivated ? '#45a049' : '#d0d0d0',
                                            }
                                        }}
                                    >
                                        <SmartToyIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </Tooltip>
                            </InputAdornment>
                        ),
                    }}
                />
            </Box>

            {/* Vertical Divider */}
            <Divider 
                orientation="vertical" 
                flexItem 
                sx={{ 
                    backgroundColor: 'rgba(255,255,255,0.3)',
                    height: 32,
                    alignSelf: 'center'
                }} 
            />

            {/* Selected Nodes Section */}
            <Box display="flex" alignItems="center" gap={1}>
                <Typography 
                    variant="caption" 
                    sx={{ 
                        color: 'white', 
                        fontWeight: 500,
                        fontSize: '0.75rem',
                        whiteSpace: 'nowrap'
                    }}
                >
                    Nodes:
                </Typography>
                
                {hasSelectedNodes ? (
                    <Badge 
                        badgeContent={selectedNodesCount} 
                        color="secondary"
                        sx={{
                            '& .MuiBadge-badge': {
                                fontSize: '0.65rem',
                                height: 16,
                                minWidth: 16,
                            }
                        }}
                    >
                        <Chip
                            label="Selected"
                            size="small"
                            sx={{ 
                                backgroundColor: 'rgba(255,255,255,0.9)',
                                color: '#1976d2',
                                fontSize: '0.7rem',
                                height: 24,
                                fontWeight: 500,
                            }}
                        />
                    </Badge>
                ) : (
                    <Chip
                        label="None"
                        size="small"
                        variant="outlined"
                        sx={{ 
                            borderColor: 'rgba(255,255,255,0.5)',
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '0.7rem',
                            height: 24,
                        }}
                    />
                )}
            </Box>

            {/* Re-match Button */}
            <Button
                variant="contained"
                size="small"
                startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
                onClick={handleRematch}
                // disabled={!hasSelectedNodes}
                sx={{ 
                    backgroundColor: 'white',
                    color: '#1976d2',
                    fontSize: "0.7rem",
                    textTransform: "none",
                    borderRadius: 1.5,
                    minWidth: 'auto',
                    px: 1.5,
                    py: 0.5,
                    height: 32,
                    fontWeight: 600,
                    '&:hover': {
                        backgroundColor: '#f5f5f5',
                    },
                    '&:disabled': {
                        backgroundColor: 'rgba(255,255,255,0.3)',
                        color: 'rgba(255,255,255,0.5)',
                    }
                }}
            >
                Re-match
            </Button>

            {/* AI Status Indicator */}
            {agentActivated && (
                <Box 
                    sx={{ 
                        backgroundColor: 'rgba(76, 175, 80, 0.9)',
                        color: 'white',
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        fontSize: '0.65rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        whiteSpace: 'nowrap',
                    }}
                >
                    <SmartToyIcon sx={{ fontSize: 12 }} />
                    <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.65rem' }}>
                        AI Active
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

export default SearchMenu;
