
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
            sx={{
                mb: 1,
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
                borderLeft: `4px solid #4dabf5`,
                position: 'relative',
                overflow: 'hidden',
                padding: 1.5,
                backgroundColor: '#2a3441',
                color: '#e0e0e0',
                transition: 'all 0.2s',
                '&:hover': {
                    backgroundColor: '#354150',
                    boxShadow: '0 0 10px rgba(77, 171, 245, 0.5)',
                },
                boxShadow: expanded ? '0 0 15px rgba(77, 171, 245, 0.6)' : '0 0 5px rgba(77, 171, 245, 0.3)',
                cursor: 'pointer',
                '& .MuiTypography-root': {
                    color: '#e0e0e0',
                },
                '& .MuiChip-root': {
                }
            }}
        >
            <ListItemText
                primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Stack spacing={1}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle1" sx={{ 
                                    fontWeight: 800,
                                    fontSize: '0.9rem',
                                    color: 'text.primary'
                                }}>
                                    {matcher.name}
                                </Typography>
                            </Box>
                            <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                flexWrap: 'wrap',
                                gap: 1.5, 
                                mt: 0.8,
                                '& .MuiChip-root': {
                                    transition: 'transform 0.2s ease-in-out',
                                    '&:hover': {
                                        transform: 'scale(1.05)',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                    }
                                }
                            }}>
                                <Tooltip title="Mean Reciprocal Rank">
                                    <Chip 
                                        size="small" 
                                        label={`MRR: ${matcher.mrr.toFixed(2)}`}
                                        sx={{ 
                                            backgroundColor: 'rgba(77, 171, 245, 0.5)', 
                                            color: 'white',
                                            fontWeight: 700,
                                            fontSize: '0.65rem',
                                        }} 
                                    />
                                </Tooltip>
                                <Tooltip title="F1 Score">
                                    <Chip
                                        size="small"
                                        label={`F1: ${matcher.f1Score.toFixed(2)}`}
                                        sx={{
                                            backgroundColor: 'rgba(102, 187, 106, 0.5)',
                                            color: 'white',
                                            fontWeight: 700,
                                            fontSize: '0.65rem',
                                        }}
                                    />
                                </Tooltip>
                                <Tooltip title="Recall">
                                    <Chip
                                        size="small"
                                        label={`Recall: ${matcher.recallGt.toFixed(2)}`}
                                        sx={{
                                            backgroundColor: 'rgba(255, 152, 0, 0.5)',
                                            color: 'white',
                                            fontWeight: 700,
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
                                    sx={{ 
                                        backgroundColor: '#2a3441',
                                        color: 'white',
                                        '&:hover': {
                                            backgroundColor: '#3a4a5c'
                                        }
                                    }}
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
