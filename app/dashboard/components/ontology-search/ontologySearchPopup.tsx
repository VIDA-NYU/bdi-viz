import React, { useState, useEffect, useContext } from 'react';
import { Dialog, DialogContent, TextField, Button, CircularProgress, Table, TableHead, TableRow, TableCell, Chip, TableBody } from '@mui/material';
import { agentSearchOntology } from '@/app/lib/langchain/agent-helper';
import SettingsGlobalContext from '@/app/lib/settings/settings-context';
interface OntologySearchPopupProps {
    selectedCandidate: Candidate;
    callback: (candidates: Candidate[]) => void;
    terminalogiesCallback: (terminologies: RelevantKnowledge[]) => void;
}

const OntologySearchPopup: React.FC<OntologySearchPopupProps> = ({ selectedCandidate, callback, terminalogiesCallback }) => {
    const [query, setQuery] = useState<string>('');
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [terminologies, setTerminologies] = useState<RelevantKnowledge[]>([]);
    const [response, setResponse] = useState<string>('');
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
        const results = await agentSearchOntology(query, selectedCandidate);
        console.log("results: ", results);
        const candidates = results.candidates;
        const terminologies = results.terminologies;
        const response = results.response;

        if (candidates) {
            setCandidates(candidates);
            callback(candidates);
        }
        if (terminologies) {
            setTerminologies(terminologies);
            // terminalogiesCallback(terminologies);
        }
        if (response) {
            setResponse(response);
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
                        {response && (
                            <div style={{ marginBottom: '10px' }}>
                                <div style={{ fontWeight: 'bold', color: '#0066cc', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '6px' }}>
                                    Response:
                                </div>
                                <span>{response}</span>
                            </div>
                        )}
                        
                        {terminologies.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                                <div style={{ fontWeight: 'bold', color: '#0066cc', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '6px' }}>
                                    Terminologies Found:
                                </div>
                                {terminologies.map((terminology, index) => (
                                    <div key={index} style={{ padding: '4px', borderLeft: '3px solid #0066cc', marginBottom: '4px', backgroundColor: '#f0f8ff' }}>
                                        <span style={{ fontWeight: 'bold' }}>{terminology.entry}</span>: {terminology.description}
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {candidates.length > 0 && (
                            <div>
                                <div style={{ fontWeight: 'bold', color: '#006600', borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '6px' }}>
                                    Candidates Found ({candidates.length}):
                                </div>
                                {candidates.map((candidate, index) => (
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
                        
                        {terminologies.length === 0 && candidates.length === 0 && (
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