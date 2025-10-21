import React, { useState, useEffect, useContext, useRef } from 'react';
import {
    Box,
    TextField,
    CircularProgress,
    IconButton,
    Typography,
    Paper,
    Divider,
    InputAdornment,
} from '@mui/material';
import UnifiedTooltip from '@/app/lib/ui/UnifiedTooltip';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import SettingsGlobalContext from '@/app/lib/settings/settings-context';
import { pollForMatchingStatus, pollForMatcherStatus, getValueMatches, getValueBins, getTargetOntology, getCachedResults, getUserOperationHistory } from '@/app/lib/heatmap/heatmap-helper';
import { agentStream } from '@/app/lib/langchain/agent-helper';

interface ChatMessage {
    id: string;
    type: 'user' | 'agent' | 'tool';
    content: string;
    timestamp: Date;
    agentState?: AgentState;
    files?: File[];
    node?: string;
}

interface OntologySearchPopupProps {
    selectedCandidate?: Candidate;
    callback: (candidates: Candidate[]) => void;
    ontologyCallback: (targetOntology: Ontology[]) => void;
    uniqueValuesCallback: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
    userOperationHistoryCallback: (userOperations: UserOperation[]) => void;
}

const OntologySearchPopup: React.FC<OntologySearchPopupProps> = ({
    selectedCandidate,
    callback,
    ontologyCallback,
    uniqueValuesCallback,
    valueMatchesCallback,
    userOperationHistoryCallback,
}) => {
    const [query, setQuery] = useState<string>('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const { ontologySearchPopupOpen, setOntologySearchPopupOpen } = useContext(
        SettingsGlobalContext
    );
    const { setIsLoadingGlobal, setTaskStateFor } = useContext(SettingsGlobalContext);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatHistory]);

    // Append agent delta message
    const appendAgentDelta = (text: string, node?: string) => {
        const msg: ChatMessage = {
            id: `${Date.now()}-${Math.random()}`,
            type: 'agent',
            content: text,
            timestamp: new Date(),
            node,
        };
        setChatHistory(prev => [...prev, msg]);
    };

    // Append tool event as foldable-ish line
    const appendToolEvent = (payload: any, node?: string) => {
        const pretty = (() => {
            try {
                return JSON.stringify(payload, null, 2);
            } catch {
                return String(payload);
            }
        })();
        const msg: ChatMessage = {
            id: `${Date.now()}-${Math.random()}`,
            type: 'tool',
            content: pretty,
            timestamp: new Date(),
            node,
        };
        setChatHistory(prev => [...prev, msg]);
    };

    const handleSearch = async () => {
        if (!query.trim() && selectedFiles.length === 0) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            type: 'user',
            content: query,
            timestamp: new Date(),
            files: selectedFiles.length > 0 ? [...selectedFiles] : undefined,
        };

        setChatHistory(prev => [...prev, userMessage]);
        setLoading(true);
        setQuery('');
        setSelectedFiles([]);

        // Start streaming
        let es: EventSource | null = null;
        try {
            es = agentStream(
                query,
                {
                    sourceColumn: selectedCandidate?.sourceColumn,
                    targetColumn: selectedCandidate?.targetColumn,
                },
                {
                    onDelta: (text, node) => appendAgentDelta(text, node),
                    onTool: (payload, node) => appendToolEvent(payload, node),
                    onFinal: (state: any) => {
                        try {
                            const agentState = state as AgentState;
                            const message: ChatMessage = {
                                id: `${Date.now()}-final`,
                                type: 'agent',
                                content: agentState?.message || 'Completed.',
                                timestamp: new Date(),
                                agentState,
                            };
                            setChatHistory(prev => [...prev, message]);
                            getCachedResults({ callback });
                            getUserOperationHistory({ callback: userOperationHistoryCallback });
                            if ((agentState as any)?.task_id) {
                                setIsLoadingGlobal(true);
                                pollForMatchingStatus({
                                    taskId: (agentState as any).task_id,
                                    onResult: () => {
                                        getTargetOntology({ callback: ontologyCallback });
                                        getValueBins({ callback: uniqueValuesCallback });
                                        getValueMatches({ callback: valueMatchesCallback });
                                        setIsLoadingGlobal(false);
                                    },
                                    onError: () => setIsLoadingGlobal(false),
                                    taskStateCallback: (ts) => setTaskStateFor('matching', ts),
                                });
                            } else if ((agentState as any)?.matcher_task_id) {
                                setIsLoadingGlobal(true);
                                pollForMatcherStatus({
                                    taskId: (agentState as any).matcher_task_id,
                                    onResult: () => {
                                        getTargetOntology({ callback: ontologyCallback });
                                        getValueBins({ callback: uniqueValuesCallback });
                                        getValueMatches({ callback: valueMatchesCallback });
                                        setIsLoadingGlobal(false);
                                    },
                                    onError: () => setIsLoadingGlobal(false),
                                    taskStateCallback: (ts) => setTaskStateFor('new_matcher', ts),
                                });
                            }
                        } catch (e) {
                            // noop
                        }
                    },
                    onError: () => {
                        const errorMessage: ChatMessage = {
                            id: `${Date.now()}-err`,
                            type: 'agent',
                            content: 'Sorry, there was an error processing your request.',
                            timestamp: new Date(),
                        };
                        setChatHistory(prev => [...prev, errorMessage]);
                    },
                    onDone: () => {
                        setLoading(false);
                    },
                }
            );
        } catch (error) {
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                type: 'agent',
                content: 'Sorry, there was an error processing your request.',
                timestamp: new Date(),
            };
            setChatHistory(prev => [...prev, errorMessage]);
            setLoading(false);
            if (es) es.close();
        }
    };

    const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSearch();
        }
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        setSelectedFiles(prev => [...prev, ...files]);
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const renderCandidates = (candidates: Candidate[], title: string, color: string) => (
        <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ color, fontWeight: 'bold' }}>
                {title} ({candidates.length})
            </Typography>
            {candidates.map((candidate, index) => (
                <Paper
                    key={index}
                    sx={{
                        p: 1,
                        mt: 0.5,
                        borderLeft: `3px solid ${color}`,
                        backgroundColor: color === '#006600' ? '#f0fff0' : '#fffaf0',
                    }}
                >
                    <Typography variant="caption" component="div">
                        <strong>Source:</strong> {candidate.sourceColumn}
                    </Typography>
                    <Typography variant="caption" component="div">
                        <strong>Target:</strong> {candidate.targetColumn}
                    </Typography>
                    <Typography variant="caption" component="div">
                        <strong>Score:</strong> {candidate.score?.toFixed(2) || 'N/A'}
                    </Typography>
                </Paper>
            ))}
        </Box>
    );

    const renderMessage = (message: ChatMessage) => (
        <Box key={message.id} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                {message.type === 'user' ? (
                    <PersonIcon sx={{ fontSize: 16, mr: 0.5, color: '#1976d2' }} />
                ) : message.type === 'tool' ? (
                    <SmartToyIcon sx={{ fontSize: 16, mr: 0.5, color: '#ff9800' }} />
                ) : (
                    <SmartToyIcon sx={{ fontSize: 16, mr: 0.5, color: '#9c27b0' }} />
                )}
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {message.timestamp.toLocaleTimeString()} {message.node ? `· ${message.node}` : ''}
                </Typography>
            </Box>
            
            <Paper
                sx={{
                    p: 1.5,
                    backgroundColor: message.type === 'user' ? '#e3f2fd' : message.type === 'tool' ? '#fff8e1' : '#f3e5f5',
                    ml: 2,
                }}
            >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {message.content}
                </Typography>
                
                {message.files && message.files.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                        {message.files.map((file, index) => (
                            <Typography key={index} variant="caption" sx={{ 
                                display: 'block',
                                color: 'text.secondary',
                                fontStyle: 'italic'
                            }}>
                                📎 {file.name}
                            </Typography>
                        ))}
                    </Box>
                )}

                {message.agentState && (
                    <Box sx={{ mt: 1 }}>
                        {message.agentState.candidates && message.agentState.candidates.length > 0 && 
                            renderCandidates(message.agentState.candidates, 'Candidates Found', '#006600')
                        }
                        {message.agentState.candidates_to_append && message.agentState.candidates_to_append.length > 0 && 
                            renderCandidates(message.agentState.candidates_to_append, 'Candidates To Append', '#cc6600')
                        }
                    </Box>
                )}
            </Paper>
        </Box>
    );

    if (!ontologySearchPopupOpen) return null;

    return (
        <Box
            sx={{
                position: 'fixed',
                right: 0,
                top: 0,
                width: '350px',
                height: '100vh',
                backgroundColor: 'background.paper',
                borderLeft: 1,
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 1300,
                boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
            }}
        >
            {/* Header */}
            <Box
                sx={{
                    p: 2,
                    borderBottom: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 500 }}>
                    Harmonization Assistant
                </Typography>
                <IconButton
                    size="small"
                    onClick={() => setOntologySearchPopupOpen(false)}
                >
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>

            {/* Chat History */}
            <Box
                sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    p: 1,
                    '&::-webkit-scrollbar': {
                        width: '4px',
                    },
                    '&::-webkit-scrollbar-track': {
                        background: '#f1f1f1',
                    },
                    '&::-webkit-scrollbar-thumb': {
                        background: '#c1c1c1',
                        borderRadius: '2px',
                    },
                }}
            >
                {chatHistory.length === 0 ? (
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'text.secondary',
                            textAlign: 'center',
                            p: 2,
                        }}
                    >
                        <SmartToyIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                        <Typography variant="body2" sx={{ mb: 1 }}>
                            Welcome to the Harmonization Assistant
                        </Typography>
                        <Typography variant="caption">
                            Ask me about ontologies, schemas, or upload files for harmonization.
                        </Typography>
                    </Box>
                ) : (
                    <>
                        {chatHistory.map(renderMessage)}
                        {loading && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                                <CircularProgress size={20} />
                            </Box>
                        )}
                        <div ref={chatEndRef} />
                    </>
                )}
            </Box>

            {/* Selected Files Display */}
            {selectedFiles.length > 0 && (
                <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
                    {selectedFiles.map((file, index) => (
                        <Box
                            key={index}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                p: 0.5,
                                backgroundColor: 'action.hover',
                                borderRadius: 1,
                                mb: 0.5,
                            }}
                        >
                            <Typography variant="caption" noWrap sx={{ flex: 1 }}>
                                📎 {file.name}
                            </Typography>
                            <IconButton size="small" onClick={() => removeFile(index)}>
                                <CloseIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Box>
                    ))}
                </Box>
            )}

            <Divider />

            {/* Input Area */}
            <Box sx={{ p: 1.5 }}>
                <TextField
                    multiline
                    maxRows={4}
                    fullWidth
                    variant="outlined"
                    placeholder="Ask about ontologies or schemas..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyPress}
                    disabled={loading}
                    size="small"
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    <UnifiedTooltip title="Attach file">
                                        <IconButton
                                            size="small"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={loading}
                                        >
                                            <AttachFileIcon fontSize="small" />
                                        </IconButton>
                                    </UnifiedTooltip>
                                    <UnifiedTooltip title="Send message">
                                        <IconButton
                                            size="small"
                                            onClick={handleSearch}
                                            disabled={loading || (!query.trim() && selectedFiles.length === 0)}
                                            color="primary"
                                        >
                                            <SendIcon fontSize="small" />
                                        </IconButton>
                                    </UnifiedTooltip>
                                </Box>
                            </InputAdornment>
                        ),
                        style: { fontSize: '0.875rem' }
                    }}
                />
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    multiple
                    accept=".csv,.json,.txt,.xml"
                />
            </Box>
        </Box>
    );
};

export default OntologySearchPopup;