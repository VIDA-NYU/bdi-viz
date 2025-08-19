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

    // Build grouped options: All, Selected, Matched, Unmatched
    type OptionItem = { name: string; displayName: string; status?: string; group: string };

    const groupOrder: Record<string, number> = { "All": 0, "Selected": 1, "Matched": 2, "Unmatched": 3 };

    const options: OptionItem[] = (
        [
            { name: "all", displayName: "All", status: undefined, group: "All" },
            ...sourceColumns.map(col => {
                const isSelected = selectedSourceColumn && selectedSourceColumn !== "all" && col.name === selectedSourceColumn;
                const isMatched = col.status === 'complete';
                const group = isSelected ? "Selected" : (isMatched ? "Matched" : "Unmatched");
                return { name: col.name, displayName: col.name, status: col.status, group };
            })
        ] as OptionItem[]
    ).sort((a, b) => {
        const ga = groupOrder[a.group] ?? 99;
        const gb = groupOrder[b.group] ?? 99;
        if (ga !== gb) return ga - gb;
        // Keep "All" first within its group, otherwise sort by name
        if (a.group === "All") return a.name === "all" ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
    });

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
                    isOptionEqualToValue={(option, value) => option.name === value.name}
                    onChange={(event, newValue) => {
                        const columnName = newValue ? newValue.name : "all";
                        handleChange(columnName);
                    }}
                    filterOptions={(options, { inputValue }) => {
                        return options.filter(option =>
                            option.displayName.toLowerCase().includes(inputValue.toLowerCase())
                        );
                    }}
                    groupBy={(option) => option.group}
                    renderGroup={(params) => (
                        <Box key={params.key} sx={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 1,
                            background: theme.palette.background.paper,
                            px: 1,
                            py: 0.5,
                            fontSize: 12,
                            color: theme.palette.text.secondary,
                            borderTop: `1px solid ${theme.palette.divider}`,
                        }}>
                            <Box sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                {params.group}
                                <Box component="span" sx={{ ml: 1, fontWeight: 400 }}>
                                    ({Array.isArray(params.children) ? params.children.length : 0})
                                </Box>
                            </Box>
                            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                                {params.children}
                            </Box>
                        </Box>
                    )}
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