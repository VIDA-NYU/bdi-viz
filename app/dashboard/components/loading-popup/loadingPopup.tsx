
import React from 'react';
import { Box, Paper, Typography, LinearProgress, List, ListItem, ListItemText, CircularProgress } from '@mui/material';

interface LoadingPopupProps {
    taskState: TaskState;
}

const LoadingPopup = ({ taskState }: LoadingPopupProps) => {
    const { status, progress, current_step, completed_steps, total_steps, logs } = taskState;
    
    return (
        <Paper
            elevation={3}
            sx={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '500px',
                maxWidth: '90vw',
                p: 3,
                zIndex: 1400,
                borderRadius: 2,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CircularProgress size={24} sx={{ mr: 2 }} />
                <Typography variant="h6" component="div">
                    {current_step}
                </Typography>
            </Box>
            
            <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                        {`Step ${completed_steps} of ${total_steps}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {`${progress}%`}
                    </Typography>
                </Box>
                <LinearProgress 
                    variant="determinate" 
                    value={progress} 
                    sx={{ height: 8, borderRadius: 4 }}
                />
            </Box>
            
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Task Logs:
            </Typography>
            
            <Box 
                sx={{ 
                    maxHeight: '200px', 
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
                                secondary={`${log.timestamp.split('T')[0]} ${log.timestamp.split('T')[1].substring(0, 8)} - ${log.progress}%`}
                                primaryTypographyProps={{ variant: 'body2', fontWeight: 'medium' }}
                                secondaryTypographyProps={{ variant: 'caption' }}
                            />
                        </ListItem>
                    ))}
                </List>
            </Box>
            
            <Typography 
                variant="body2" 
                color="text.secondary" 
                sx={{ mt: 2, fontStyle: 'italic', textAlign: 'center' }}
            >
                {status === 'complete' ? 'Task completed successfully' : 'Processing your request...'}
            </Typography>
        </Paper>
    );
};

export default LoadingPopup;