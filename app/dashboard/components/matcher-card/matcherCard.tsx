
import { useState, useEffect } from 'react';
import { 
    ListItem,
    ListItemText,
    Box,
    Stack,
    Typography,
    Chip,
    Tooltip,
    IconButton,
    Collapse
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface MatcherCardProps {
    matcher: MatcherAnalysis;
}

function MatcherCard({ matcher }: MatcherCardProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <ListItem
            disablePadding
        >
            <ListItemText
                primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Stack spacing={1}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle1" sx={{ 
                                    fontWeight: 500,
                                    fontSize: '0.9rem',
                                    color: 'text.primary'
                                }}>
                                    {matcher.name}
                                </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                <Tooltip title="Mean Reciprocal Rank">
                                    <Chip 
                                        size="small" 
                                        label={`MRR: ${matcher.mrr.toFixed(2)}`}
                                        sx={{ 
                                            backgroundColor: 'rgba(25, 118, 210, 0.1)', 
                                            color: 'primary.main',
                                            fontWeight: 500,
                                            fontSize: '0.65rem',
                                        }} 
                                    />
                                </Tooltip>
                                <Tooltip title="F1 Score">
                                    <Chip
                                        size="small"
                                        label={`F1: ${matcher.f1Score.toFixed(2)}`}
                                        sx={{
                                            backgroundColor: 'rgba(76, 175, 80, 0.1)',
                                            color: 'success.main',
                                            fontWeight: 500,
                                            fontSize: '0.65rem',
                                        }}
                                    />
                                </Tooltip>
                                <Tooltip title="Recall">
                                    <Chip
                                        size="small"
                                        label={`Recall: ${matcher.recallGt.toFixed(2)}`}
                                        sx={{
                                            backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                            color: 'warning.dark',
                                            fontWeight: 500,
                                            fontSize: '0.65rem',
                                        }}
                                    />
                                </Tooltip>
                            </Box>
                        </Stack>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                            <Tooltip title={expanded ? "Collapse" : "Expand"}>
                                <IconButton 
                                    size="small" 
                                    onClick={() => setExpanded(!expanded)}
                                >
                                    {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>
                }

                secondary={
                    <Box sx={{ mt: 1 }}>
                        {/* Collapsible content */}
                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.primary' }}>
                                    {matcher.description}
                                </Typography>
                            </Box>
                        </Collapse>
                    </Box>
                }
            />
        </ListItem>
    )
}

export default MatcherCard;
