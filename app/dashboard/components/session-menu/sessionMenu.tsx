'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, TextField, IconButton, MenuItem, Tooltip, Select, CircularProgress, Typography, InputAdornment } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useSession } from '@/app/lib/settings/session';
import { createSession, listSessions, deleteSession, getCachedResults, getTargetOntology, getValueBins, getValueMatches, getSourceOntology, getUserOperationHistory } from '@/app/lib/heatmap/heatmap-helper';


interface SessionMenuProps {
    callback: (candidates: Candidate[]) => void;
    sourceOntologyCallback: (sourceOntology: Ontology[]) => void;
    targetOntologyCallback: (targetOntology: Ontology[]) => void;
    uniqueValuesCallback: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
    userOperationHistoryCallback: (userOperationHistory: UserOperation[]) => void;
}

const toSessionObjs = (names: string[] | Session[]): Session[] =>
    (names as any[]).map((item) =>
        typeof item === 'string' ? ({ name: item } as Session) : (item as Session)
    );

const SessionMenu: React.FC<SessionMenuProps> = ({ callback, sourceOntologyCallback, targetOntologyCallback, uniqueValuesCallback, valueMatchesCallback, userOperationHistoryCallback }) => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [newSessionName, setNewSessionName] = useState<string>('');
    const [sessionName, updateSessionName] = useSession();
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    const namesSet = useMemo(() => new Set(sessions.map(s => s.name)), [sessions]);
    const trimmedNewName = newSessionName.trim();
    const isDuplicate = trimmedNewName.length > 0 && namesSet.has(trimmedNewName);

    const onRefresh = useCallback(async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await listSessions({
                onSession: (names) => {
                    setSessions(toSessionObjs(names));
                },
            });
        } finally {
            setIsRefreshing(false);
        }
    }, [setSessions, isRefreshing]);

    const onCreate = useCallback(async () => {
        const name = trimmedNewName;
        if (!name || isDuplicate || isCreating) return;
        setIsCreating(true);
        try {
            await createSession(name);
            await listSessions({ onSession: (names) => { setSessions(toSessionObjs(names)); } });
            setNewSessionName('');
            // ensure local state reflects the just-created session
            updateSessionName(name);
            // kick off data refresh for new session
            getCachedResults({ callback: callback });
            getSourceOntology({ callback: sourceOntologyCallback });
            getTargetOntology({ callback: targetOntologyCallback });
            getValueBins({ callback: uniqueValuesCallback });
            getValueMatches({ callback: valueMatchesCallback });
            getUserOperationHistory({ callback: userOperationHistoryCallback });
        } catch (_) {
            // no-op toast; container handles feedback
        } finally {
            setIsCreating(false);
        }
    }, [trimmedNewName, isDuplicate, isCreating, updateSessionName, callback, sourceOntologyCallback, targetOntologyCallback, uniqueValuesCallback, valueMatchesCallback, userOperationHistoryCallback, setSessions]);

    const onDelete = useCallback(async (name: string) => {
        const confirm = window.confirm(`Delete session "${name}"?`);
        if (!confirm) return;
        setDeleting(name);
        try {
            const remaining = await deleteSession(name);
            // Always refresh local sessions list, regardless of which session was deleted
            setSessions(toSessionObjs(remaining));
            if (name == sessionName) {
                const next = (remaining && remaining.length > 0) ? remaining[0] : 'default';
                updateSessionName(next);
                // refresh data for switched session
                getCachedResults({ callback: callback });
                getSourceOntology({ callback: sourceOntologyCallback });
                getTargetOntology({ callback: targetOntologyCallback });
                getValueBins({ callback: uniqueValuesCallback });
                getValueMatches({ callback: valueMatchesCallback });
                getUserOperationHistory({ callback: userOperationHistoryCallback });
            }
        } catch (_) {
            // no-op toast; container handles feedback
        } finally {
            setDeleting(null);
        }
    }, [setSessions, sessionName, callback, sourceOntologyCallback, targetOntologyCallback, uniqueValuesCallback, valueMatchesCallback, updateSessionName]);

    const onUpdate = useCallback((session: Session) => {
        updateSessionName(session.name);
        getCachedResults({ callback: callback });
        getSourceOntology({ callback: sourceOntologyCallback });
        getTargetOntology({ callback: targetOntologyCallback });
        getValueBins({ callback: uniqueValuesCallback });
        getValueMatches({ callback: valueMatchesCallback });
        getUserOperationHistory({ callback: userOperationHistoryCallback });
    }, [updateSessionName, callback, sourceOntologyCallback, targetOntologyCallback, uniqueValuesCallback, valueMatchesCallback, userOperationHistoryCallback]);

    const onSelectSession = useCallback((e: any) => {
        const name = e.target.value as string;
        if (!name || name === sessionName) return;
        onUpdate({ name } as Session);
    }, [sessionName, onUpdate]);

    useEffect(() => {
        onRefresh();
        // ensure initial session is set so backend receives it
        if (sessionName) updateSessionName(sessionName);
    }, []);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: "1.2rem", fontWeight: "200" }}>BDIViz</Typography>
            <TextField
                size="small"
                variant="outlined"
                placeholder="New session"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        onCreate();
                    }
                }}
                error={Boolean(trimmedNewName) && isDuplicate}
                helperText={Boolean(trimmedNewName) && isDuplicate ? 'Session already exists' : undefined}
                sx={{
                    width: '150px',
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
                        lineHeight: '20px',
                    }
                }}
                InputProps={{
                    endAdornment: (
                        <IconButton size="small" color="secondary" onClick={onCreate} disabled={!trimmedNewName || isDuplicate || isCreating}>
                            {isCreating ? <CircularProgress size={16} /> : <AddIcon fontSize="small" />}
                        </IconButton>
                    ),
                }}
            />
            <Tooltip title="Refresh sessions">
                <IconButton size="small" onClick={onRefresh} disabled={isRefreshing}>
                    {isRefreshing ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
            </Tooltip>
            <Select
                size="small"
                value={sessionName}
                onChange={onSelectSession}
                displayEmpty
                renderValue={(selected) => (
                    <Box sx={{
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {selected as string}
                    </Box>
                )}
                sx={{
                    minWidth: 150,
                    height: 36,
                    fontSize: 11,
                    fontFamily: `"Roboto", "Helvetica", "Arial", sans-serif`,
                    fontWeight: 400,
                    '& .MuiSelect-select': {
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        pr: 1,
                    },
                    '& .MuiInputBase-input': {
                        backgroundColor: 'white',
                    }
                }}
            >
                {sessions.length === 0 && (
                    <MenuItem value={sessionName}>{sessionName}</MenuItem>
                )}
                {sessions.map((s) => (
                    <MenuItem key={s.name} value={s.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ 
                            flexGrow: 1, 
                            maxWidth: 220, 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            fontSize: 11,
                            fontWeight: 400,
                        }}>
                            {s.name}
                        </Box>
                        {s.name !== 'default' && (
                            <Tooltip title={`Delete ${s.name}`}>
                                <IconButton
                                    size="small"
                                    edge="end"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(s.name); }}
                                    disabled={deleting === s.name}
                                >
                                    {deleting === s.name ? <CircularProgress size={16} /> : <DeleteOutlineIcon fontSize="small" />}
                                </IconButton>
                            </Tooltip>
                        )}
                    </MenuItem>
                ))}
            </Select>
        </Box>
    );
};

export default SessionMenu;