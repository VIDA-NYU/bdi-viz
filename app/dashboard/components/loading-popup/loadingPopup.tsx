import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography, LinearProgress, List, ListItem, ListItemText, CircularProgress } from '@mui/material';

interface LoadingPopupProps {
    taskState: TaskState | null;
}

const LoadingPopup = ({ taskState }: LoadingPopupProps) => {
    const { 
        status = 'processing',
        progress = 0,
        current_step = 'Loading...',
        completed_steps = 0,
        total_steps = 1,
        logs = []
    } = taskState || {};

    const logsEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [logs]);

    return (
        <Paper
            elevation={3}
            sx={{
                width: '350px',
                p: 2,
                borderRadius: 2,
                bgcolor: 'background.paper',
            }}
        >
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
                <LinearProgress 
                    variant="determinate" 
                    value={progress} 
                    sx={{ height: 6, borderRadius: 3 }}
                />
            </Box>
            
            <Box 
                sx={{ 
                    maxHeight: '120px', 
                    overflowY: 'auto',
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                    bgcolor: '#f5f5f5'
                }}
            >
                <List dense sx={{ py: 0 }}>
                    {logs && logs.map((log, index) => (
                        <ListItem key={index} sx={{ py: 0.5, borderBottom: index < logs.length - 1 ? '1px solid #e0e0e0' : 'none' }}>
                            <ListItemText
                                primary={log.step}
                                secondary={
                                    <Box>
                                        <Typography variant="caption" component="div">
                                            {`${log.timestamp.split('T')[1].substring(0, 8)} - ${log.progress}%`}
                                        </Typography>
                                        {log.message && (
                                            <Typography variant="caption" component="div" sx={{ color: 'text.secondary', mt: 0.5 }}>
                                                {log.message}
                                            </Typography>
                                        )}
                                    </Box>
                                }
                                primaryTypographyProps={{ variant: 'caption', fontWeight: 'medium' }}
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
        </Paper>
    );
};

export default LoadingPopup;