'use client';

import { useEffect, useState, useContext } from 'react';
import { Box, FormControl, Autocomplete, TextField, useTheme } from '@mui/material';
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';


interface SourceColumnSelectionProps {
    sourceColumns: SourceColumn[];
    selectedSourceColumn: string;
    onSelect: (column: string) => void;
}

const SourceColumnSelection: React.FC<SourceColumnSelectionProps> = ({ sourceColumns, selectedSourceColumn, onSelect }) => {
    const [sourceColumn, setSourceColumn] = useState<string>("all");
    const { setGlobalCandidateHighlight } = useContext(HighlightGlobalContext);

    const theme = useTheme();

    // Create options array with "All" option at the top
    const options = [
        { name: "all", displayName: "All", status: undefined },
        ...sourceColumns.map(col => ({ name: col.name, displayName: col.name, status: col.status }))
    ];

    const handleChange = (column: string) => {
        setSourceColumn(column);
        onSelect(column);
    }

    useEffect(() => {
        if (selectedSourceColumn) {
            setSourceColumn(selectedSourceColumn);
            setGlobalCandidateHighlight(undefined);
        }
    }, [selectedSourceColumn]);

    return (
        <Box sx={{ width: "100%", flexGrow: 1 }}>
            <FormControl size="small" fullWidth>
                <Autocomplete
                    options={options}
                    getOptionLabel={(option) => typeof option === 'string' ? option : option.displayName}
                    value={options.find(opt => opt.name === sourceColumn) || null}
                    onChange={(event, newValue) => {
                        const columnName = newValue ? newValue.name : "all";
                        handleChange(columnName);
                    }}
                    filterOptions={(options, { inputValue }) => {
                        return options.filter(option =>
                            option.displayName.toLowerCase().includes(inputValue.toLowerCase())
                        );
                    }}
                    renderOption={(props, option) => (
                        <Box
                            component="li"
                            {...props}
                            sx={{
                                backgroundColor: option.status === 'complete' ? theme.palette.success.light : 
                                               option.status === 'ignored' ? theme.palette.grey[400] : 'inherit',
                                '&:hover': {
                                    backgroundColor: option.status === 'complete' ? "#009900 !important" : 
                                                   option.status === 'ignored' ? theme.palette.grey[600] : theme.palette.grey[200],
                                },
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: 12,
                                whiteSpace: "normal",
                                wordBreak: "break-all",
                            }}
                        >
                            <span>{option.displayName}</span>
                            {option.status === 'complete' && <span>✔️</span>}
                            {option.status === 'ignored' && <span>❌</span>}
                        </Box>
                    )}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Source Column"
                            size="small"
                            sx={{
                                '& .MuiInputBase-input': {
                                    fontSize: 12,
                                },
                            }}
                        />
                    )}
                    sx={{
                        '& .MuiAutocomplete-inputRoot': {
                            fontSize: 12,
                        },
                    }}
                />
            </FormControl>
        </Box>
    );
}

export default SourceColumnSelection;