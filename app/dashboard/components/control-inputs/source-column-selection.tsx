'use client';

import { useEffect, useState, useContext, useRef } from 'react';
import { Box, FormControl, Autocomplete, TextField, useTheme, Checkbox, Button, Chip } from '@mui/material';
import HighlightGlobalContext from '@/app/lib/highlight/highlight-context';


interface SourceColumnSelectionProps {
    sourceColumns: SourceColumn[];
    selectedSourceColumns: string[];
    onSelect: (columns: string[]) => void;
}

const SourceColumnSelection: React.FC<SourceColumnSelectionProps> = ({ sourceColumns, selectedSourceColumns, onSelect }) => {
    type OptionItem = { name: string; displayName: string; status?: string; group: string };
    const [selectedOptions, setSelectedOptions] = useState<OptionItem[]>([]);
    const [inputValue, setInputValue] = useState<string>("");
    const { setGlobalCandidateHighlight, setSelectedSourceNodes } = useContext(HighlightGlobalContext);

    const theme = useTheme();
    const listboxRef = useRef<HTMLUListElement | null>(null);

    const preserveListboxScroll = (fn: () => void) => {
        const prevTop = listboxRef.current?.scrollTop ?? 0;
        fn();
        requestAnimationFrame(() => {
            if (listboxRef.current) {
                listboxRef.current.scrollTop = prevTop;
            }
        });
    };

    // Build grouped options: All, Selected, Matched, Unmatched
    const groupOrder: Record<string, number> = { "All": 0, "Selected": 1, "Matched": 2, "Unmatched": 3 };

    const options: OptionItem[] = (
        [
            { name: "all", displayName: "All", status: undefined, group: "All" },
            ...sourceColumns.map(col => {
                const isSelected = selectedOptions.some(opt => opt.name === col.name);
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

    const handleEmit = (columns: string[]) => {
        onSelect(columns);
    }

    useEffect(() => {
        // Sync internal selection from external array
        if (Array.isArray(selectedSourceColumns)) {
            const next = selectedSourceColumns
                .map(name => {
                    const col = sourceColumns.find(c => c.name === name);
                    return col ? { name: col.name, displayName: col.name, status: col.status, group: "Selected" } as OptionItem : undefined;
                })
                .filter(Boolean) as OptionItem[];
            setSelectedOptions(next);
            setGlobalCandidateHighlight(undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSourceColumns, sourceColumns.length]);

    return (
        <Box sx={{ width: "100%", flexGrow: 1 }}>
            <FormControl size="small" fullWidth>
                <Autocomplete
                    multiple
                    disableCloseOnSelect
                    size="small"
                    fullWidth
                    options={options}
                    getOptionLabel={(option) => typeof option === 'string' ? option : option.displayName}
                    value={selectedOptions}
                    isOptionEqualToValue={(option, value) => option.name === value.name}
                    inputValue={inputValue}
                    onInputChange={(event, newValue, reason) => {
                        if (reason === 'input' || reason === 'clear') {
                            setInputValue(newValue);
                        }
                        // ignore 'reset' to preserve user-typed text on selection
                    }}
                    clearOnBlur={false}
                    clearOnEscape={false}
                    onChange={(event, newValue, reason, details) => {
                        const totalColumns = sourceColumns.length;
                        // Handle toggling All explicitly
                        if ((details as any)?.option?.name === 'all') {
                            const allSelected = selectedOptions.length === totalColumns;
                            preserveListboxScroll(() => {
                                if (allSelected) {
                                    setSelectedOptions([]);
                                    handleEmit([]);
                                } else {
                                    const allOpts = sourceColumns.map(col => ({ name: col.name, displayName: col.name, status: col.status, group: 'Selected' } as OptionItem));
                                    setSelectedOptions(allOpts);
                                    handleEmit(allOpts.map(o => o.name));
                                }
                            });
                            return;
                        }
                        // Normal multi-select behavior
                        const filtered = (newValue as OptionItem[]).filter(v => v.name !== 'all');
                        preserveListboxScroll(() => {
                            setSelectedOptions(filtered);
                            handleEmit(filtered.map(f => f.name));
                        });
                    }}
                    slotProps={{ listbox: { ref: listboxRef } as any }}
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
                            px: 0.5,
                            py: 0.25,
                            fontSize: 11,
                            color: theme.palette.text.secondary,
                            borderTop: `1px solid ${theme.palette.divider}`,
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                    {params.group}
                                    <Box component="span" sx={{ ml: 1, fontWeight: 400 }}>
                                        ({Array.isArray(params.children) ? params.children.length : 0})
                                    </Box>
                                </Box>
                                {inputValue.trim().length > 0 && params.group === 'All' && (
                                    <Button
                                        size="small"
                                        variant="text"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            const filtered = options.filter(o => o.name !== 'all' && o.displayName.toLowerCase().includes(inputValue.toLowerCase()));
                                            // Merge with existing selections
                                            const map = new Map<string, OptionItem>();
                                            [...selectedOptions, ...filtered].forEach(o => map.set(o.name, o));
                                            const merged = Array.from(map.values());
                                            preserveListboxScroll(() => {
                                                setSelectedOptions(merged);
                                                handleEmit(merged.filter(o => o.name !== 'all').map(o => o.name));
                                            });
                                        }}
                                        sx={{ minWidth: 0, padding: 0.25, fontSize: 11 }}
                                    >
                                        Select all
                                    </Button>
                                )}
                            </Box>
                            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                                {params.children}
                            </Box>
                        </Box>
                    )}
                    renderOption={(props, option) => {
                        const totalColumns = sourceColumns.length;
                        const allSelected = selectedOptions.length === totalColumns;
                        const someSelected = selectedOptions.length > 0 && selectedOptions.length < totalColumns;
                        const isAll = option.name === 'all';
                        const checked = isAll ? allSelected : selectedOptions.some(o => o.name === option.name);
                        return (
                            <Box
                                component="li"
                                {...props}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    fontSize: 12,
                                    whiteSpace: "normal",
                                    wordBreak: "break-all",
                                    padding: 0,
                                    backgroundColor:
                                        !isAll && option.status === 'complete' ? theme.palette.success.light :
                                        (!isAll && option.status === 'ignored' ? theme.palette.grey[300] : 'transparent'),
                                    '&:hover': {
                                        backgroundColor:
                                            !isAll && option.status === 'complete' ? theme.palette.success.main :
                                            (!isAll && option.status === 'ignored' ? theme.palette.grey[400] : theme.palette.grey[100]),
                                    },
                                }}
                            >
                                <Checkbox
                                    size="small"
                                    checked={checked}
                                    indeterminate={isAll ? someSelected : false}
                                    tabIndex={-1}
                                    disableRipple
                                    sx={{
                                        padding: 0,
                                    }}
                                />
                                <span>{option.displayName}</span>
                            </Box>
                        );
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Source Columns"
                            size="small"
                            InputLabelProps={{
                                sx: {
                                    fontSize: 11,
                                    fontWeight: 400,
                                    fontFamily: `"Roboto", "Helvetica", "Arial", sans-serif`,
                                    color: theme.palette.text.secondary,
                                    '&.Mui-focused': { color: theme.palette.text.secondary },
                                }
                            }}
                            sx={{
                                '& .MuiInputBase-root': { height: 32 },
                            }}
                        />
                    )}
                    renderTags={(value, getTagProps) => {
                        const maxChips = 2;
                        const visible = value.slice(0, maxChips);
                        const hiddenCount = value.length - visible.length;
                        return [
                            ...visible.map((option, index) => (
                                <Chip
                                    {...getTagProps({ index })}
                                    key={option.name}
                                    size="small"
                                    color="primary"
                                    label={option.displayName}
                                    sx={{
                                        '& .MuiChip-label': {
                                            px: 0.5,
                                            fontSize: 11,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }
                                    }}
                                />
                            )),
                            hiddenCount > 0 ? (
                                <Chip
                                    key="more"
                                    size="small"
                                    color="primary"
                                    label={`+${hiddenCount}`}
                                    sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: 11 } }}
                                />
                            ) : null
                        ].filter(Boolean) as any;
                    }}
                    sx={{
                        width: '100%',
                        '& .MuiAutocomplete-inputRoot': {
                            fontSize: 12,
                            paddingY: 0.25,
                            gap: 0.5,
                            flexWrap: 'nowrap',
                            overflow: 'hidden',
                        },
                        '& .MuiAutocomplete-input': { minWidth: 60 },
                        '& .MuiAutocomplete-listbox': { paddingY: 0 },
                        '& .MuiAutocomplete-option': { minHeight: 28, paddingY: 0.25, paddingX: 0.5 },
                        '& .MuiAutocomplete-tag': { maxWidth: 90 },
                    }}
                />
            </FormControl>
        </Box>
    );
}

export default SourceColumnSelection;