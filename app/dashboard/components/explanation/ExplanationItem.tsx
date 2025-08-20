// components/SchemaExplanation/ExplanationItem.tsx
import React, { useState } from 'react';
import { 
    Box,
    Chip,
    Collapse,
    IconButton, 
    LinearProgress,
    ListItem, 
    ListItemText,
    Stack,
    Typography
} from '@mui/material';
import UnifiedTooltip from '@/app/lib/ui/UnifiedTooltip';
import { getIcon, getTypeColor, getTypeDescription, getDefaultTitle } from './icons';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

// Type definitions
type ExplanationType = 'name' | 'token' | 'value' | 'semantic' | 'pattern' | 'history' | 'knowledge' | 'other';

interface Explanation {
    title: string;
    id: string;
    isMatch: boolean;
    type: ExplanationType | string;
    reason: string;
    reference: string;
    confidence: number;
}

interface ExplanationItemProps {
    explanation: Explanation;
    selected: boolean;
    thumbUp: boolean;
    thumbDown: boolean;
    onSelect: (explanation: Explanation) => void;
    onThumbUpClick: (id: string) => void;
    onThumbDownClick: (id: string) => void;
}

// Use getDefaultTitle from icons.tsx

function ExplanationItem({
    explanation,
    selected,
    thumbUp,
    thumbDown,
    onSelect,
    onThumbUpClick,
    onThumbDownClick
}: ExplanationItemProps) {
    const [expanded, setExpanded] = useState(false);
    
    const typeColor = getTypeColor(explanation.type);
    const typeIcon = getIcon(explanation.type);
    
    const handleExpandClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
    };
    
    return (
        <ListItem 
            disablePadding
            onClick={() => onSelect(explanation)}
            sx={{
                mb: 1,
                borderRadius: 2,
                border: 1,
                borderColor: selected ? 'primary.main' : (explanation.isMatch ? 'success.light' : 'error.light'),
                borderLeft: `4px solid ${typeColor}`,
                position: 'relative',
                overflow: 'hidden',
                padding: 1.5,
                backgroundColor: selected ? 'rgba(25, 118, 210, 0.08)' : 'background.paper',
                transition: 'all 0.2s',
                '&:hover': {
                    transform: 'scale(1.01)',
                    boxShadow: 1,
                },
                boxShadow: expanded ? 2 : 0,
                cursor: 'pointer'
            }}
        >
            <ListItemText
                primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Stack spacing={1}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box sx={{ color: typeColor }}>
                                    {typeIcon}
                                </Box>
                                <Typography variant="subtitle1" sx={{ 
                                    fontWeight: 500,
                                    fontSize: '0.9rem',
                                    color: 'text.primary'
                                }}>
                                    {explanation.title || getDefaultTitle(explanation.type, explanation.isMatch)}
                                </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                <UnifiedTooltip title={getTypeDescription(explanation.type)}>
                                    <Chip 
                                        size="small" 
                                        label={explanation.type.charAt(0).toUpperCase() + explanation.type.slice(1)} 
                                        sx={{ 
                                            backgroundColor: `${typeColor}20`, 
                                            color: typeColor,
                                            fontWeight: 500,
                                            fontSize: '0.65rem',
                                        }} 
                                    />
                                </UnifiedTooltip>
                                <Chip
                                    size="small"
                                    label={explanation.isMatch ? "Match" : "Not a Match"}
                                    sx={{
                                        backgroundColor: explanation.isMatch ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                                        color: explanation.isMatch ? 'green' : 'red',
                                        fontWeight: 500,
                                        fontSize: '0.65rem',
                                    }}
                                />
                            </Box>
                        </Stack>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                            <UnifiedTooltip title={thumbUp ? "Remove upvote" : "Upvote this explanation"}>
                                <IconButton 
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onThumbUpClick(explanation.id);
                                    }}
                                    color={thumbUp ? 'primary' : 'default'}
                                >
                                    {thumbUp ? <ThumbUpIcon fontSize="small" /> : <ThumbUpOutlinedIcon fontSize="small" />}
                                </IconButton>
                            </UnifiedTooltip>
                            
                            <UnifiedTooltip title={thumbDown ? "Remove downvote" : "Downvote this explanation"}>
                                <IconButton 
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onThumbDownClick(explanation.id);
                                    }}
                                    color={thumbDown ? 'error' : 'default'}
                                >
                                    {thumbDown ? <ThumbDownIcon fontSize="small" /> : <ThumbDownOutlinedIcon fontSize="small" />}
                                </IconButton>
                            </UnifiedTooltip>
                            
                            <UnifiedTooltip title={expanded ? "Collapse" : "Expand"}>
                                <IconButton 
                                    size="small" 
                                    onClick={handleExpandClick}
                                >
                                    {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                </IconButton>
                            </UnifiedTooltip>
                        </Box>
                    </Box>
                }
                secondary={
                    <Box sx={{ mt: 1 }}>
                        {/* Confidence visualization */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                                Confidence:
                            </Typography>
                            <LinearProgress 
                                variant="determinate" 
                                value={explanation.confidence * 100} 
                                sx={{ 
                                    width: '100%',
                                    maxWidth: 120,
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: '#e0e0e0',
                                    '& .MuiLinearProgress-bar': {
                                        backgroundColor: explanation.isMatch ? 'success.main' : 'warning.main',
                                    }
                                }} 
                            />
                            <Typography variant="caption" sx={{ minWidth: 35 }}>
                                {(explanation.confidence * 100).toFixed(0)}%
                            </Typography>
                        </Box>
                        
                        {/* Collapsible content */}
                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.primary' }}>
                                    {explanation.reason}
                                </Typography>
                                
                                {explanation.reference && (
                                    <Box sx={{ 
                                        mt: 1.5, 
                                        p: 1, 
                                        backgroundColor: 'rgba(0, 0, 0, 0.03)', 
                                        borderRadius: 1,
                                        borderLeft: `2px solid ${typeColor}40`
                                    }}>
                                        <Typography variant="caption" color="text.secondary">
                                            Reference:
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontSize: '0.75rem', mt: 0.5 }}>
                                            {explanation.reference}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Collapse>
                    </Box>
                }
                sx={{ zIndex: 2, margin: 0 }}
            />
        </ListItem>
    );
}

export default ExplanationItem;
export { getIcon };