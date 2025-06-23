import React, { useState, useEffect, useContext } from 'react';
import { Dialog, DialogContent, TextField, Button, CircularProgress, Table, TableHead, TableRow, TableCell, Chip, TableBody } from '@mui/material';
import { agentSearchOntology } from '@/app/lib/langchain/agent-helper';
import SettingsGlobalContext from '@/app/lib/settings/settings-context';

interface OntologySearchPopupProps {
    selectedCandidate: Candidate;
    callback: (candidates: Candidate[]) => void;
}

const OntologySearchPopup: React.FC<OntologySearchPopupProps> = ({ selectedCandidate, callback }) => {
    const [query, setQuery] = useState<string>('');
    const [agentState, setAgentState] = useState<AgentState | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [initialMousePosition, setInitialMousePosition] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
    const { ontologySearchPopupOpen, setOntologySearchPopupOpen } = useContext(SettingsGlobalContext);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            setInitialMousePosition({ x: event.clientX, y: event.clientY });
        };

        if (ontologySearchPopupOpen) {
            window.addEventListener('mousemove', handleMouseMove, { once: true });
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, [ontologySearchPopupOpen]);

    const handleSearch = async () => {
        setLoading(true);
        const result = await agentSearchOntology(query, selectedCandidate);
        if (result) {
            setAgentState(result);
            if (result.candidates) callback(result.candidates);
        }
        setLoading(false);
    };

    const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <Dialog
            open={ontologySearchPopupOpen}
            onClose={() => {
                setOntologySearchPopupOpen(false);
            }}
            PaperProps={{
                style: {
                    position: 'absolute',
                    left: initialMousePosition.x,
                    top: initialMousePosition.y,
                    transform: 'none',
                    maxWidth: '400px'
                }
            }}
        >
            <DialogContent style={{ padding: '12px' }}>
                <TextField
                    size="small"
                    fullWidth
                    variant="outlined"
                    placeholder="Explore the ontology..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyPress}
                    style={{ marginBottom: '8px' }}
                />
                <Button 
                    onClick={handleSearch} 
                    variant="contained" 
                    color="primary" 
                    size="small"
                    style={{ marginBottom: '8px', fontSize: '0.8rem' }}
                >
                    Search
                </Button>
                {loading ? (
                    <CircularProgress size={24} style={{ display: 'block', margin: '10px auto' }} />
                ) : (
                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px', padding: '6px', fontSize: '0.8rem', fontFamily: 'monospace', backgroundColor: '#f5f5f5' }}>
                        {agentState?.message && agentState.message.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                                <div style={{ fontWeight: 'bold', color: '#0066cc', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '6px' }}>
                                    Agent Thoughts:
                                </div>
                                {agentState.message.map((msg, idx) => (
                                    <div key={idx}>{msg}</div>
                                ))}
                            </div>
                        )}

                        {agentState?.candidates && agentState.candidates.length > 0 && (
                            <div>
                                <div style={{ fontWeight: 'bold', color: '#006600', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '6px' }}>
                                    Candidates Found ({agentState.candidates.length}):
                                </div>
                                {agentState.candidates.map((candidate, index) => (
                                    <div key={index} style={{ padding: '4px', borderLeft: '3px solid #006600', marginBottom: '6px', backgroundColor: '#f0fff0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 'bold' }}>Source:</span> 
                                            <span style={{ wordBreak: 'break-word', maxWidth: '80%' }}>{candidate.sourceColumn}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 'bold' }}>Target:</span> 
                                            <span style={{ wordBreak: 'break-word', maxWidth: '80%' }}>{candidate.targetColumn}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 'bold' }}>Score:</span> 
                                            <span>{candidate.score?.toFixed(2) || 'N/A'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {agentState?.candidates_to_append && agentState.candidates_to_append.length > 0 && (
                            <div>
                                <div style={{ fontWeight: 'bold', color: '#cc6600', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '6px', marginTop: '10px' }}>
                                    Candidates To Append ({agentState.candidates_to_append.length}):
                                </div>
                                {agentState.candidates_to_append.map((candidate, index) => (
                                    <div key={index} style={{ padding: '4px', borderLeft: '3px solid #cc6600', marginBottom: '6px', backgroundColor: '#fffaf0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 'bold' }}>Source:</span> 
                                            <span style={{ wordBreak: 'break-word', maxWidth: '80%' }}>{candidate.sourceColumn}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 'bold' }}>Target:</span> 
                                            <span style={{ wordBreak: 'break-word', maxWidth: '80%' }}>{candidate.targetColumn}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 'bold' }}>Score:</span> 
                                            <span>{candidate.score?.toFixed(2) || 'N/A'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {(!agentState || (agentState.candidates.length === 0 && agentState.candidates_to_append.length === 0 && (!agentState.message || agentState.message.length === 0))) && (
                            <div style={{ color: '#666', textAlign: 'center', padding: '10px' }}>
                                No results found. Try a different search query.
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default OntologySearchPopup;