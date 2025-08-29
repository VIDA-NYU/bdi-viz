// components/SchemaExplanation/RelevantKnowledge.tsx
import { useContext } from 'react';
import { 
    Box,
    Typography, 
    List, 
    ListItem,
    Stack,
    Tooltip
} from '@mui/material';
import { BasicChip, HighlightedChip } from '../../layout/components';
import { SectionHeader } from '../../layout/components';
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';
import { handleCopy } from '../../utils/clipboard';

interface RelevantKnowledgeProps {
    relevantKnowledge: RelevantKnowledge[];
    gdcAttribute?: GDCAttribute;
    isLoading: boolean;
    relatedOuterSources: RelatedSource[];
}

const RelevantKnowledgeView = ({
    relevantKnowledge,
    gdcAttribute,
    isLoading,
    relatedOuterSources,
}: RelevantKnowledgeProps) => {

    // Highlight Global Context
    const { globalQuery } = useContext(HighlightGlobalContext);
    return (
        <Stack>
            {/* {isLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                <CircularProgress />
            </Box>
            ) : (
            <List>
                {relevantKnowledge.map((rk, i) => (
                <ListItem key={i}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                    <Chip label={rk.entry} color="primary" />
                    <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.7rem' }}>
                        {rk.description}
                    </Typography>
                    </Stack>
                </ListItem>
                ))}
            </List>
            )} */}

            {gdcAttribute && (
            <Box>
                <SectionHeader>
                Target Attribute
                </SectionHeader>
                <Typography variant="body1" sx={{ fontSize: '0.7rem' }}>
                <strong>Name:</strong> {gdcAttribute.name}
                </Typography>
                <Typography variant="body1" sx={{ fontSize: '0.7rem' }}>
                <strong>Category:</strong> {gdcAttribute.category}
                </Typography>
                <Typography variant="body1" sx={{ fontSize: '0.7rem' }}>
                <strong>Node:</strong> {gdcAttribute.node}
                </Typography>
                <Typography variant="body1" gutterBottom sx={{ fontSize: '0.7rem' }}>
                <strong>Type:</strong> {gdcAttribute.type}
                </Typography>
                {gdcAttribute.minimum !== null && gdcAttribute.minimum !== undefined && (
                <Typography variant="body2" sx={{ fontSize: '0.7rem' }}>
                    <strong>Minimum:</strong> {gdcAttribute.minimum}
                </Typography>
                )}
                {gdcAttribute.maximum !== null && gdcAttribute.maximum !== undefined && (
                <Typography variant="body2" sx={{ fontSize: '0.7rem' }}>
                    <strong>Maximum:</strong> {gdcAttribute.maximum}
                </Typography>
                )}
                {gdcAttribute.description && (
                    typeof gdcAttribute.description === 'string' ? (
                        <Typography variant="body2" color="textSecondary" gutterBottom sx={{ fontSize: '0.7rem' }}>
                            <strong>Description:</strong> {gdcAttribute.description}
                        </Typography>
                    ) : (
                        gdcAttribute.description.map((desc, i) => (
                            <Typography key={i} variant="body2" color="textSecondary" gutterBottom sx={{ fontSize: '0.7rem' }}>
                                <strong>Description:</strong> {desc.description}
                            </Typography>
                        ))
                    )
                )}
                {gdcAttribute.enum && (
                <Box display="flex" flexWrap="wrap" gap={0.5}>
                    <Typography variant="body2" sx={{ fontSize: '0.7rem' }}>
                    <strong>Enum:</strong>
                    </Typography>
                    {gdcAttribute.enum.map((enumValue, index) => {
                    const tooltipText = gdcAttribute.enumDef?.[enumValue] ?? enumValue;
                    const isHighlighted = !!globalQuery && enumValue.toLowerCase().includes(globalQuery.toLowerCase());
                    return (
                        <Tooltip key={index} title={tooltipText} arrow placement="top">
                        {isHighlighted ? (
                            <HighlightedChip
                            label={enumValue}
                            color="info" 
                            size='small' 
                            sx={{ fontSize: "0.65rem" }} 
                            onClick={() => handleCopy(enumValue)}
                            />
                        ) : (
                            <BasicChip
                            label={enumValue} 
                            color="info" 
                            size='small' 
                            sx={{ fontSize: "0.65rem" }}
                            onClick={() => handleCopy(enumValue)}
                            />
                        )}
                        </Tooltip>
                    );
                    })}
                </Box>
                )}
            </Box>
            )}

            {relatedOuterSources && relatedOuterSources.length > 0 && (
            <Box>
                <SectionHeader>
                    Related Outer Sources
                </SectionHeader>
                <List sx= {{ py: 0, px: 0.5 }}>
                {relatedOuterSources.map((source, i) => (
                    <ListItem 
                        key={i}
                        sx={{
                            mb: 1,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            position: 'relative',
                            overflow: 'hidden',
                            padding: 1,
                            boxShadow: 3,
                            backgroundColor: 'background.paper',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            '&:hover': {
                                transform: 'scale(1.02)',
                                boxShadow: 6,
                            }
                        }}
                    >
                        <Stack direction="column" spacing={1}>
                            <Typography variant="h6" color="black" sx={{ fontWeight: "600", fontSize: '0.8rem' }}>
                                {source.title}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ fontWeight: "300", fontSize: '0.7rem' }}>
                                {source.snippet}
                            </Typography>
                            <Typography variant="body2" color="primary" sx={{ fontSize: '0.7rem', wordBreak: 'break-word' }}>
                                <a href={source.link} target="_blank" rel="noopener noreferrer">
                                    {source.link}
                                </a>
                            </Typography>
                        </Stack>
                    </ListItem>
                ))}
                </List>
            </Box>
            )}
        </Stack>
    );
};

export default RelevantKnowledgeView;
