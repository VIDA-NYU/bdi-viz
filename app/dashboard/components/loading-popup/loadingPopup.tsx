import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Box, Paper, Typography, LinearProgress, List, ListItem, ListItemText, CircularProgress, Tabs, Tab } from '@mui/material';

interface LoadingPopupProps {
    taskStates: Record<string, TaskState>;
}

const TaskPanel = ({ taskState }: { taskState: TaskState | null }) => {
    const {
        status = 'processing',
        progress = 0,
        current_step = 'Loading...',
        completed_steps = 0,
        total_steps = 1,
        logs = [],
    } = taskState || {};

    const logsEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [logs]);

    return (
        <>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                <CircularProgress size={20} sx={{ mr: 1.5 }} />
                <Typography variant="subtitle1" component="div" noWrap>
                    {current_step}
                </Typography>
            </Box>

            <Box sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                        {`Step ${completed_steps} of ${total_steps}`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {`${progress}%`}
                    </Typography>
                </Box>
                <LinearProgress variant="determinate" value={progress} sx={{ height: 6, borderRadius: 3 }} />
            </Box>

            <Box
                sx={{
                    maxHeight: '120px',
                    overflowY: 'auto',
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                    bgcolor: '#f5f5f5',
                }}
            >
                <List dense sx={{ py: 0 }}>
                    {logs && logs.map((log, index) => (
                        <ListItem
                            key={index}
                            sx={{
                                py: 0.75,
                                px: 1.5,
                                borderBottom: index < logs.length - 1 ? '1px solid #e0e0e0' : 'none',
                                '&:hover': {
                                    bgcolor: 'rgba(0, 0, 0, 0.02)',
                                },
                            }}
                        >
                            <ListItemText
                                primary={log.step}
                                secondary={
                                    <Box sx={{ mt: 0.5 }}>
                                        <Typography
                                            variant="caption"
                                            component="div"
                                            sx={{
                                                fontSize: '0.7rem',
                                                color: 'text.secondary',
                                                fontWeight: 500,
                                            }}
                                        >
                                            {`${log.timestamp.split('T')[1].substring(0, 8)} - ${log.progress}%`}
                                        </Typography>
                                        {log.message && (
                                            <Typography
                                                variant="caption"
                                                component="div"
                                                sx={{
                                                    color: 'text.secondary',
                                                    mt: 0.25,
                                                    fontSize: '0.65rem',
                                                    lineHeight: 1.2,
                                                    opacity: 0.8,
                                                }}
                                            >
                                                {log.message}
                                            </Typography>
                                        )}
                                    </Box>
                                }
                                primaryTypographyProps={{
                                    variant: 'body2',
                                    fontWeight: 600,
                                    sx: {
                                        fontSize: '0.8rem',
                                        color: 'text.primary',
                                        lineHeight: 1.3,
                                    },
                                }}
                            />
                        </ListItem>
                    ))}
                    <div ref={logsEndRef} />
                </List>
            </Box>

            <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, fontStyle: 'italic', textAlign: 'center', display: 'block' }}
            >
                {status === 'complete' ? 'Task completed successfully' : 'Processing...'}
            </Typography>
        </>
    );
};

const LoadingPopup = ({ taskStates }: LoadingPopupProps) => {
    const tabs: Array<{ key: string; label: string; state: TaskState | null }> = useMemo(() => {
        const entries = Object.entries(taskStates || {});
        if (entries.length === 0) return [];

        const prettyLabel = (key: string) => {
            if (key === 'matching') return 'Matching';
            if (key === 'source') return 'Source Ontology';
            if (key === 'new_matcher') return 'New Matcher';
            return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        };

        const preferred = ['matching', 'source', 'new_matcher'];
        const orderedKeys = [
            ...preferred.filter((k) => k in taskStates),
            ...entries.map(([k]) => k).filter((k) => !preferred.includes(k)),
        ];

        return orderedKeys.map((key) => ({ key, label: prettyLabel(key), state: taskStates[key] || null }));
    }, [taskStates]);

    const [currentTab, setCurrentTab] = useState(0);

    useEffect(() => {
        setCurrentTab(0);
    }, [tabs.length]);

    const current = tabs[currentTab]?.state || null;

    return (
        <Paper
            elevation={3}
            sx={{
                width: '380px',
                p: 2,
                borderRadius: 2,
                bgcolor: 'background.paper',
            }}
        >
            <Tabs
                value={currentTab}
                onChange={(_, v) => setCurrentTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36 } }}
            >
                {tabs.map((t, idx) => (
                    <Tab key={t.key} label={t.label} value={idx} sx={{ fontSize: '0.8rem' }} />
                ))}
            </Tabs>

            <TaskPanel taskState={current} />
        </Paper>
    );
};

export default LoadingPopup;