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
    Button,
} from '@mui/material';
import axios from 'axios';
import UnifiedTooltip from '@/app/lib/ui/UnifiedTooltip';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SettingsGlobalContext from '@/app/lib/settings/settings-context';
import { getSessionName } from '@/app/lib/settings/session';
import { pollForMatchingStatus, pollForMatcherStatus, getValueMatches, getValueBins, getTargetOntology, getCachedResults, getUserOperationHistory } from '@/app/lib/heatmap/heatmap-helper';
import { agentStream } from '@/app/lib/langchain/agent-helper';

interface ChatMessage {
    id: string;
    type: 'user' | 'agent' | 'tool' | 'thinking';
    content: string;
    timestamp: Date;
    agentState?: AgentState;
    files?: File[];
    node?: string;
    tool?: {
        phase: 'call' | 'result';
        calls?: Array<{ name?: string; args?: any }>;
        name?: string;
        content?: string;
        is_error?: boolean;
    };
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
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const { ontologySearchPopupOpen, setOntologySearchPopupOpen } = useContext(
        SettingsGlobalContext
    );
    const { setIsLoadingGlobal, setTaskStateFor } = useContext(SettingsGlobalContext);
    const [panelWidth, setPanelWidth] = useState<number>(350);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatHistory]);

    // Persist chat history per session in localStorage
    const STORAGE_KEY_PREFIX = 'bdiviz_chat_history_';
    const WIDTH_KEY_PREFIX = 'bdiviz_chat_width_';

    const loadChatHistoryForSession = () => {
        try {
            const session = (typeof window !== 'undefined' ? getSessionName() : undefined) || 'default';
            const raw = typeof window !== 'undefined' ? window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${session}`) : null;
            if (!raw) {
                setChatHistory([]);
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const restored: ChatMessage[] = parsed.map((m: any) => {
                    const ts = m?.timestamp ? new Date(m.timestamp) : new Date();
                    // Do not attempt to restore File objects; omit files on restore
                    const { files: _ignored, ...rest } = m || {};
                    return { ...rest, timestamp: ts } as ChatMessage;
                });
                setChatHistory(restored);
            } else {
                setChatHistory([]);
            }
        } catch {
            // ignore corrupt storage
            setChatHistory([]);
        }
    };

    const handleClearChat = async () => {
        try {
            const session = (typeof window !== 'undefined' ? getSessionName() : undefined) || 'default';
            // Clear local persisted chat for this session
            if (typeof window !== 'undefined') {
                window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${session}`);
            }
            setChatHistory([]);
            // Reset backend agent conversation summary/state
            await axios.post('/api/agent/reset', { session_name: session });
        } catch (e) {
            // noop on error; local clear already applied
            console.error('Failed to reset agent state:', e);
        }
    };

    useEffect(() => {
        // Initial load
        loadChatHistoryForSession();
        // Load saved width
        try {
            const session = (typeof window !== 'undefined' ? getSessionName() : undefined) || 'default';
            const raw = typeof window !== 'undefined' ? window.localStorage.getItem(`${WIDTH_KEY_PREFIX}${session}`) : null;
            const clampWidth = (w: number) => {
                const min = 260;
                const max = typeof window !== 'undefined' ? Math.min(900, Math.floor(window.innerWidth * 0.9)) : 900;
                return Math.min(max, Math.max(min, w));
            };
            if (raw) {
                const num = parseInt(raw, 10);
                if (!Number.isNaN(num)) setPanelWidth(clampWidth(num));
            }
        } catch {}
        // Reload on session change
        const onSessionChange = () => loadChatHistoryForSession();
        if (typeof window !== 'undefined') {
            window.addEventListener('bdiviz:session', onSessionChange);
        }
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('bdiviz:session', onSessionChange);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        try {
            const session = (typeof window !== 'undefined' ? getSessionName() : undefined) || 'default';
            const serializable = chatHistory.map(({ timestamp, files, ...rest }) => ({
                ...rest,
                // store ISO string for timestamp
                timestamp: (timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString()),
            }));
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${session}`, JSON.stringify(serializable));
            }
        } catch {
            // ignore write errors
        }
    }, [chatHistory]);

    // Drag-to-resize handlers
    const onResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        try {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = panelWidth;
            const clampWidth = (w: number) => {
                const min = 260;
                const max = typeof window !== 'undefined' ? Math.min(900, Math.floor(window.innerWidth * 0.9)) : 900;
                return Math.min(max, Math.max(min, w));
            };
            const onMove = (ev: MouseEvent) => {
                const delta = startX - ev.clientX; // dragging left increases width
                setPanelWidth(clampWidth(startWidth + delta));
            };
            const onUp = () => {
                try {
                    const session = (typeof window !== 'undefined' ? getSessionName() : undefined) || 'default';
                    if (typeof window !== 'undefined') {
                        window.localStorage.setItem(`${WIDTH_KEY_PREFIX}${session}`, String(panelWidth));
                    }
                } catch {}
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
        } catch {}
    };

    // Append agent delta message
    const appendAgentDelta = (state: any, node?: string) => {
        console.log("agent delta: ", state);
        const msg: ChatMessage = {
            id: `${Date.now()}-${Math.random()}`,
            type: 'thinking',
            content: state.message,
            timestamp: new Date(),
            node,
            agentState: state as AgentState,
        };
        setChatHistory(prev => [...prev, msg]);
    };

    // Append tool event as foldable-ish line
    const appendToolEvent = (payload: any, node?: string) => {
        const tool = (() => {
            if (payload?.phase || payload?.name || payload?.calls) return payload;
            if (payload?.tool) return payload.tool;
            if (payload?.calls) return { phase: 'call', calls: payload.calls };
            return {
                phase: 'result',
                name: payload?.name,
                content: payload?.content,
                is_error: !!payload?.is_error,
            };
        })();

        const pretty = (() => {
            try {
                return JSON.stringify(tool, null, 2);
            } catch {
                return String(tool);
            }
        })();
        const msg: ChatMessage = {
            id: `${Date.now()}-${Math.random()}`,
            type: 'tool',
            content: pretty,
            timestamp: new Date(),
            node,
            tool,
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
                    onDelta: (state, node) => appendAgentDelta(state, node),
                    onTool: (payload, node) => appendToolEvent(payload, node),
                    onFinal: (state: any) => {
                        try {
                            const agentState = state as AgentState;
                            const finalContent = agentState?.message || 'Completed.';
                            setChatHistory(prev => {
                                const last = prev[prev.length - 1];
                                if (last && last.type === 'thinking' && (last.content || '').trim() === finalContent.trim()) {
                                    // Upgrade last thinking message to final agent message
                                    const upgraded: ChatMessage = {
                                        ...last,
                                        type: 'agent',
                                        content: finalContent,
                                        agentState,
                                    };
                                    return [...prev.slice(0, -1), upgraded];
                                }
                                const message: ChatMessage = {
                                    id: `${Date.now()}-final`,
                                    type: 'agent',
                                    content: finalContent,
                                    timestamp: new Date(),
                                    agentState,
                                };
                                return [...prev, message];
                            });
                            getCachedResults({ callback });
                            if ((agentState as any)?.task_id) {
                                // Matching task
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
                                // New matcher task
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
                            } else {
                                // User operations or other non-matching tasks
                                getTargetOntology({ callback: ontologyCallback });
                                getValueBins({ callback: uniqueValuesCallback });
                                getValueMatches({ callback: valueMatchesCallback });
                                getUserOperationHistory({ callback: userOperationHistoryCallback });
                            }
                        } catch (e) {
                            // noop
                            console.error("Error processing agent state:", e);
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
            console.error("Error processing agent state:", error);
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
            
            {(() => {
                // For thinking messages, avoid Paper entirely
                if (message.type === 'thinking') {
                    const text = typeof message.content === 'string' ? message.content : String(message.content);
                    return (
                        <Box sx={{ ml: 2 }}>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'grey.600' }}>
                                {text}
                            </Typography>
                        </Box>
                    );
                }

                const isToolError = message.type === 'tool' && message.tool?.is_error;
                const paperBg = message.type === 'user'
                    ? '#e3f2fd'
                    : message.type === 'tool'
                        ? (isToolError ? '#ffebee' : '#fff8e1')
                        : '#f3e5f5';
                return (
                    <Paper
                        sx={{
                            p: 1.5,
                            backgroundColor: paperBg,
                            ml: 2,
                        }}
                    >
                {/* Content with expandable UI for non-agent messages */}
                {(() => {
                    const isAgent = message.type === 'agent';
                    const text = typeof message.content === 'string' ? message.content : String(message.content);
                    const isLong = (text?.length || 0) > 300 || (text?.split('\n').length || 0) > 8;
                    const expanded = expandedIds.has(message.id);
                    const bg = paperBg;

                    if (isAgent) {
                        return (
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                {text}
                            </Typography>
                        );
                    }

                    // Compact JSON cards for all tool calls/results
                    if (message.type === 'tool') {
                        const t = message.tool;
                        const header = t?.phase === 'call'
                            ? 'Tool call'
                            : (t?.phase === 'result' ? (t?.name ? `Tool result: ${t.name}` : 'Tool result') : 'Tool');
                        return (
                            <Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: t?.is_error ? '#c62828' : (t?.phase === 'call' ? '#9c27b0' : '#cc6600') }}>
                                        {header}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        onClick={() => navigator.clipboard?.writeText(text)}
                                        aria-label="Copy"
                                    >
                                        <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                                <Box
                                    sx={{
                                        mt: 0.5,
                                        p: 1,
                                        borderRadius: 1,
                                        backgroundColor: 'action.hover',
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        fontSize: '0.75rem',
                                        maxHeight: 180,
                                        overflow: 'auto',
                                        whiteSpace: 'pre',
                                        lineHeight: 1.4,
                                    }}
                                    component="pre"
                                >
                                    {text}
                                </Box>
                            </Box>
                        );
                    }

                    return (
                        <>
                            <Box sx={{ position: 'relative' }}>
                                <Box sx={{ maxHeight: expanded ? 'none' : 140, overflow: 'hidden' }}>
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                        {text}
                                    </Typography>
                                </Box>
                                {!expanded && isLong && (
                                    <Box sx={{
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        height: 40,
                                        background: `linear-gradient(to bottom, rgba(255,255,255,0) 0%, ${bg} 100%)`,
                                    }} />
                                )}
                            </Box>
                            {isLong && (
                                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 0.5 }}>
                                    <Button
                                        size="small"
                                        onClick={() => {
                                            const next = new Set(expandedIds);
                                            if (expanded) next.delete(message.id); else next.add(message.id);
                                            setExpandedIds(next);
                                        }}
                                        startIcon={expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                    >
                                        {expanded ? 'Show less' : 'Show more'}
                                    </Button>
                                    <IconButton
                                        size="small"
                                        onClick={() => navigator.clipboard?.writeText(text)}
                                        aria-label="Copy"
                                    >
                                        <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            )}
                        </>
                    );
                })()}

                {/* Next agent */}
                {message.agentState?.next_agents && message.agentState.next_agents.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" sx={{ color: '#cc6600' }}>
                            Next agent: {message.agentState.next_agents.join(', ')}
                        </Typography>
                    </Box>
                )}

                {/* Files */}
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
                );
            })()}
        </Box>
    );

    if (!ontologySearchPopupOpen) return null;

    return (
        <Box
            sx={{
                position: 'fixed',
                right: 0,
                top: 0,
                width: `${panelWidth}px`,
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
            {/* Resize handle */}
            <Box
                onMouseDown={onResizeMouseDown}
                sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 6,
                    cursor: 'col-resize',
                    '&:hover': { backgroundColor: 'action.hover' },
                }}
            />
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <UnifiedTooltip title="Clear chat history">
                        <span>
                            <IconButton size="small" onClick={handleClearChat}>
                                <DeleteForeverOutlinedIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </UnifiedTooltip>
                    <IconButton
                        size="small"
                        onClick={() => setOntologySearchPopupOpen(false)}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>
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