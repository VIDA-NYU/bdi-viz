import { useMemo, useContext, useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Popover, IconButton, Stack, TextField, Tooltip, Typography, Divider, Button, Checkbox, FormControlLabel } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import UndoIcon from "@mui/icons-material/Undo";
import HighlightGlobalContext from "@/app/lib/highlight/highlight-context";
import { updateSourceValue, updateTargetMatchValue, getGDCAttribute, getValueMatches } from "@/app/lib/heatmap/heatmap-helper";
import { BasicChip, HighlightedChip } from "../../layout/components";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";

const DEFAULT_COLUMN_WIDTH = 180;
const SOURCE_COLUMN_WIDTH = 240;
const TARGET_COLUMN_WIDTH = 220;
const MIN_COLUMN_WIDTH = 120;

interface ValueComparisonTableProps {
    valueMatches: ValueMatch[];
    weightedAggregatedCandidates: AggregatedCandidate[];
    selectedCandidate?: Candidate;
    setSelectedCandidate: (sourceColumn: string, targetColumn: string) => void;
    handleValueMatches: (valueMatches: ValueMatch[]) => void;
    handleUserOperationsUpdate: (userOperations: UserOperation[]) => void;
}

// A helper component that displays both the original source value and the edited value
// If they differ, the original appears struck through, and the edited value is highlighted with a badge.
const SourceValueDisplay: React.FC<{ original: string; edited: string }> = ({ original, edited }) => {
    const isEdited = original !== edited;

    return (
        <div style={{ display: "flex", alignItems: "center" }}>
            {isEdited ? (
                <>
                    <span style={{ textDecoration: "line-through", marginRight: 4, color: "#a0a0a0" }}>
                        {original}
                    </span>
                    <span style={{ fontWeight: "bold", color: "#1976d2", marginRight: 6 }}>
                        {edited}
                    </span>
                    <span style={{ fontSize: 10, color: "red" }}>(edited)</span>
                </>
            ) : (
                <span>{original}</span>
            )}
        </div>
    );
};

const ValueComparisonTable: React.FC<ValueComparisonTableProps> = ({
    valueMatches,
    weightedAggregatedCandidates,
    selectedCandidate,
    setSelectedCandidate,
    handleValueMatches,
    handleUserOperationsUpdate,
}) => {
    const theme = useTheme();
    const { globalCandidateHighlight, globalQuery } = useContext(HighlightGlobalContext);
    const [gdcAttribute, setGdcAttribute] = useState<GDCAttribute | undefined>(undefined);
    const [enumAnchorEl, setEnumAnchorEl] = useState<HTMLElement | null>(null);
    const [searchText, setSearchText] = useState("");
    const [selectedEnumContext, setSelectedEnumContext] = useState<{ row: any; targetColumn: string } | null>(null);
    const sourceCellRefs = useRef<Map<number, HTMLElement | null>>(new Map());
    // Columns UI
    const [columnsAnchorEl, setColumnsAnchorEl] = useState<HTMLElement | null>(null);
    const [columnsSearch, setColumnsSearch] = useState<string>("");
    const [columnVisibilityModel, setColumnVisibilityModel] = useState<Record<string, boolean>>({});
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
    const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

    const candidate = useMemo(() => {
        let candidate = selectedCandidate;
        if (!selectedCandidate || selectedCandidate?.targetColumn === "") {
            if (globalCandidateHighlight) {
                candidate = globalCandidateHighlight as Candidate;
            }
        }
        return candidate;
    }, [selectedCandidate, globalCandidateHighlight]);

    const sourceKey = useMemo(() => {
        if (!candidate) return null as string | null;
        return `${candidate.sourceColumn}(source)`.replace(/\./g, "");
    }, [candidate]);

    const rows = useMemo(() => {
        if (!candidate) return [];
        const valueMatch = valueMatches.find(
            (valueMatch) => valueMatch.sourceColumn === candidate.sourceColumn
        );

        if (valueMatch) {
            const targetColumns = weightedAggregatedCandidates
                .filter((aggCandidate) => aggCandidate.sourceColumn === candidate.sourceColumn)
                .map((aggCandidate) => aggCandidate.targetColumn);
            return valueMatch.sourceValues.map((sourceValue, index) => {
                const rowObj: Record<string, any> = {
                    id: index,
                    [`${valueMatch.sourceColumn}(source)`.replace(/\./g, "")]:  valueMatch.sourceMappedValues[index],
                    "SourceOriginalValues": sourceValue,
                };
                const targetValueMatches = targetColumns
                    .map((targetColumn) =>
                        valueMatch.targets.find((target) => target.targetColumn === targetColumn)
                    )
                    .filter(target => target !== undefined);
                targetValueMatches.forEach((targetObj) => {
                    const targetColumn = targetObj.targetColumn;
                    const targetValue =
                        targetObj.targetValues[index] !== undefined ? targetObj.targetValues[index] : "";
                    rowObj[targetColumn] = targetValue;
                });
                return rowObj;
            });
        }
        return [];
    }, [valueMatches, weightedAggregatedCandidates, candidate]);

    // Build dynamic column keys in display order
    const dynamicColumnKeys = useMemo(() => {
        if (!rows.length) return [] as string[];
        const keys = Object.keys(rows[0]).filter((k) => k !== "id" && k !== "SourceOriginalValues");
        return keys;
    }, [rows]);

    // Initialize column visibility when keys change
    useEffect(() => {
        if (!dynamicColumnKeys.length) return;
        setColumnVisibilityModel((prev) => {
            const next = { ...prev };
            dynamicColumnKeys.forEach((k) => {
                if (!(k in next)) next[k] = true;
            });
            // hide nothing by default
            return next;
        });
    }, [dynamicColumnKeys.join("|")]);

    useEffect(() => {
        if (!dynamicColumnKeys.length) return;
        setColumnWidths((prev) => {
            const next = { ...prev };
            dynamicColumnKeys.forEach((k) => {
                if (k in next) return;
                if (sourceKey && k === sourceKey) {
                    next[k] = SOURCE_COLUMN_WIDTH;
                } else if (candidate?.targetColumn && k === candidate.targetColumn) {
                    next[k] = TARGET_COLUMN_WIDTH;
                } else {
                    next[k] = DEFAULT_COLUMN_WIDTH;
                }
            });
            return next;
        });
    }, [dynamicColumnKeys.join("|"), sourceKey, candidate?.targetColumn]);

    // fetch enums lazily when opening the editor for a specific target column

    const openEnumsPopover = useCallback((row: any, targetColumn: string, anchor: HTMLElement) => {
        setSelectedEnumContext({ row, targetColumn });
        setEnumAnchorEl(anchor);
        const controller = new AbortController();
        getGDCAttribute({
            targetColumn,
            callback: (attr) => setGdcAttribute(attr),
            signal: controller.signal,
        });
    }, []);

    const closeEnumsPopover = useCallback(() => {
        setEnumAnchorEl(null);
        setSearchText("");
        setSelectedEnumContext(null);
    }, []);

    // Sticky column measurements for 2 left-pinned columns: source, target
    const tableContainerRef = useRef<HTMLDivElement | null>(null);
    const thSourceRef = useRef<HTMLTableCellElement | null>(null);

    const updateStickyOffsets = useCallback(() => {
        const container = tableContainerRef.current;
        if (!container) return;
        const sourceWidth = thSourceRef.current?.getBoundingClientRect().width ?? 0;
        container.style.setProperty("--sticky-left-source", `0px`);
        container.style.setProperty("--sticky-left-target", `${sourceWidth}px`);
    }, []);

    useLayoutEffect(() => {
        updateStickyOffsets();
    }, [rows, dynamicColumnKeys, columnWidths, updateStickyOffsets]);

    useEffect(() => {
        const onResize = () => updateStickyOffsets();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [updateStickyOffsets]);

    const [editingRowId, setEditingRowId] = useState<number | null>(null);
    const [editingValue, setEditingValue] = useState<string>("");
    const [editingTarget, setEditingTarget] = useState<{ rowId: number; key: string } | null>(null);
    const [editingTargetValue, setEditingTargetValue] = useState<string>("");
    const [showOnlyEdited, setShowOnlyEdited] = useState<boolean>(false);

    const getColumnWidth = useCallback((key: string) => {
        if (columnWidths[key]) return columnWidths[key];
        if (sourceKey && key === sourceKey) return SOURCE_COLUMN_WIDTH;
        if (candidate?.targetColumn && key === candidate.targetColumn) return TARGET_COLUMN_WIDTH;
        return DEFAULT_COLUMN_WIDTH;
    }, [columnWidths, sourceKey, candidate?.targetColumn]);

    const startResize = useCallback((key: string, event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const headerCell = (event.currentTarget as HTMLElement).parentElement;
        const measuredWidth = headerCell?.getBoundingClientRect().width ?? DEFAULT_COLUMN_WIDTH;
        const startWidth = columnWidths[key] ?? measuredWidth;
        resizingRef.current = { key, startX: event.clientX, startWidth };

        const onMove = (ev: MouseEvent) => {
            if (!resizingRef.current) return;
            const delta = ev.clientX - resizingRef.current.startX;
            const nextWidth = Math.max(MIN_COLUMN_WIDTH, resizingRef.current.startWidth + delta);
            setColumnWidths((prev) => ({ ...prev, [key]: nextWidth }));
        };

        const onUp = () => {
            resizingRef.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }, [columnWidths]);

    const filteredEnums = useMemo(() => {
        if (!gdcAttribute?.enum) return [] as string[];
        if (!searchText) return gdcAttribute.enum;
        return gdcAttribute.enum.filter((e) => e.toLowerCase().includes(searchText.toLowerCase()));
    }, [gdcAttribute, searchText]);

    const applyEnumToRow = useCallback((enumValue: string) => {
        if (!candidate || !selectedEnumContext) return;
        updateTargetMatchValue({
            sourceColumn: candidate.sourceColumn,
            sourceValue: String(selectedEnumContext.row["SourceOriginalValues"] ?? ""),
            targetColumn: selectedEnumContext.targetColumn,
            newTargetValue: enumValue,
            valueMatchesCallback: handleValueMatches,
            userOperationHistoryCallback: handleUserOperationsUpdate,
        });
    }, [candidate, selectedEnumContext, handleValueMatches]);

    const displayedColumnKeys = useMemo(() => {
        if (!rows.length) return [] as string[];
        const keys = Object.keys(rows[0]).filter((k) => k !== "id" && k !== "SourceOriginalValues");
        const order: string[] = [];
        if (sourceKey && keys.includes(sourceKey)) order.push(sourceKey);
        if (candidate?.targetColumn && keys.includes(candidate.targetColumn)) order.push(candidate.targetColumn);
        const remaining = keys.filter((k) => !order.includes(k));
        const ordered = [...order, ...remaining];
        // apply visibility model
        return ordered.filter((k) => columnVisibilityModel[k] !== false);
    }, [rows, sourceKey, candidate, columnVisibilityModel]);

    const commitEditIfNeeded = useCallback((row: any) => {
        if (!candidate || editingRowId === null || !sourceKey) return;
        const original = String(row[sourceKey]);
        // If value did not actually change, do not call update endpoint
        if (original === editingValue) {
            setEditingRowId(null);
            setEditingValue("");
            return;
        }
        updateSourceValue({
            column: candidate.sourceColumn,
            value: row[sourceKey],
            newValue: editingValue,
            valueMatchesCallback: handleValueMatches,
            userOperationHistoryCallback: handleUserOperationsUpdate,
        });
        setEditingRowId(null);
        setEditingValue("");
    }, [candidate, editingRowId, editingValue, handleValueMatches, handleUserOperationsUpdate, sourceKey]);

    const isRowEdited = useCallback((row: any) => {
        if (!sourceKey) return false;
        return String(row[sourceKey]) !== String(row["SourceOriginalValues"] ?? "");
    }, [sourceKey]);

    return (
        <div className="value-comparison-root" style={{ display: "flex", flexDirection: "column" }}>
            <style>
                {`
                    .value-comparison-root tr {
                        height: 10px;
                    }
                    .value-comparison-root tr td {
                        height: auto !important;
                    }
                    .value-comparison-root .MuiTableCell-head {
                        max-width: 300px !important;
                        font-weight: 700 !important;
                        font-family: "Roboto","Helvetica","Arial",sans-serif !important;
                    }
                    .value-comparison-root .table-container { overflow: auto; border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; width: 100%; }
                    .value-comparison-root table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; table-layout: fixed; font-size: 0.92rem; }
                    .value-comparison-root th,
                    .value-comparison-root td { box-sizing: border-box; border-bottom: 1px solid rgba(0,0,0,0.12); border-right: 1px solid rgba(0,0,0,0.12); padding: 8px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                    .value-comparison-root thead th:last-child,
                    .value-comparison-root tbody td:last-child { border-right: none; }
                    .value-comparison-root thead th { position: sticky; top: 0; z-index: 3; }
                    .value-comparison-root .sticky-source { position: sticky; left: var(--sticky-left-source); z-index: 4; }
                    .value-comparison-root .sticky-target { position: sticky; left: var(--sticky-left-target); z-index: 4; }
                    .value-comparison-root tbody tr:hover td { background-color: rgba(0,0,0,0.03); }
                    .value-comparison-root .cell-btn { opacity: 0; transition: opacity 160ms ease; }
                    .value-comparison-root td:hover .cell-btn { opacity: 1; }
                    .value-comparison-root .col-resizer {
                        position: absolute;
                        top: 0;
                        right: 0;
                        width: 8px;
                        height: 100%;
                        cursor: col-resize;
                        user-select: none;
                        touch-action: none;
                    }
                `}
            </style>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, px: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    {candidate?.sourceColumn && (
                        <Typography variant="caption" color="text.secondary">Source: {candidate.sourceColumn}</Typography>
                    )}
                    <Divider orientation="vertical" flexItem />
                    {candidate?.targetColumn && (
                        <Typography variant="caption" color="text.secondary">Target: {candidate.targetColumn}</Typography>
                    )}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Button size="small" startIcon={<ViewColumnIcon />} onClick={(e) => setColumnsAnchorEl(e.currentTarget)}>Columns</Button>
                    <Button size="small" onClick={() => getValueMatches({ callback: handleValueMatches })}>Refresh</Button>
                </Stack>
            </Box>

            <Popover
                open={Boolean(columnsAnchorEl)}
                anchorEl={columnsAnchorEl}
                onClose={() => setColumnsAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            >
                <Box sx={{ p: 2, width: 280 }}>
                    <Stack spacing={1}>
                        <Typography variant="subtitle2">Visible columns</Typography>
                        <TextField size="small" placeholder="Search columns" value={columnsSearch} onChange={(e) => setColumnsSearch(e.target.value)} InputProps={{ startAdornment: (<SearchIcon fontSize="small" />) }} />
                        <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                            <Stack>
                                {dynamicColumnKeys.filter((k) => !columnsSearch || k.toLowerCase().includes(columnsSearch.toLowerCase())).map((k) => (
                                    <FormControlLabel key={k} control={<Checkbox size="small" checked={columnVisibilityModel[k] !== false} onChange={(e) => setColumnVisibilityModel((prev) => ({ ...prev, [k]: e.target.checked }))} />} label={<Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{k}</Typography>} />
                                ))}
                            </Stack>
                        </Box>
                    </Stack>
                </Box>
            </Popover>

            <div ref={tableContainerRef} className={"table-container"}>
                <table>
                    <thead>
                        <tr>
                            {displayedColumnKeys.map((key) => {
                                const isSource = sourceKey && key === sourceKey;
                                const isTarget = candidate?.targetColumn && key === candidate.targetColumn;
                                const stickyClass = isSource ? "sticky-source" : isTarget ? "sticky-target" : "";
                                const refProp = isSource ? { ref: thSourceRef } : {};
                                const columnWidth = getColumnWidth(key);
                                return (
                                    <th
                                        key={key}
                                        className={`${stickyClass}`}
                                        {...refProp}
                                        style={{
                                            background: theme.palette.background.paper,
                                            fontWeight: 600,
                                            color: theme.palette.text.primary,
                                            width: columnWidth,
                                            minWidth: columnWidth,
                                            maxWidth: columnWidth,
                                        }}
                                    >
                                        {isSource ? (
                                            <Tooltip title="Editable source value (Enter to apply, Esc to cancel)" arrow>
                                                <span>{key}</span>
                                            </Tooltip>
                                        ) : isTarget ? (
                                            <Tooltip title="Click a cell to edit mapping or use the edit icon for enums" arrow>
                                                <span>{key}</span>
                                            </Tooltip>
                                        ) : (
                                            key
                                        )}
                                        <div
                                            className="col-resizer"
                                            role="separator"
                                            aria-label={`Resize column ${key}`}
                                            aria-orientation="vertical"
                                            onMouseDown={(e) => startResize(key, e)}
                                        />
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id}>
                                {displayedColumnKeys.map((key) => {
                                    const isSource = sourceKey && key === sourceKey;
                                    const isTarget = candidate?.targetColumn && key === candidate.targetColumn;
                                    const stickyClass = isSource ? "sticky-source" : isTarget ? "sticky-target" : "";
                                    const cellValue = row[key];
                                    const columnWidth = getColumnWidth(key);

                                    let backgroundColor: string | undefined = undefined;
                                    if (isSource) {
                                        backgroundColor = "rgb(230,242,252)";
                                    } else if (isTarget) {
                                        backgroundColor = "rgb(184,158,199)";
                                    }
                                    const emphasize = (typeof cellValue === "string" && globalQuery && cellValue.toLowerCase().includes(globalQuery.toLowerCase()));

                                    const commonStyle: React.CSSProperties = {
                                        backgroundColor,
                                        color: emphasize ? theme.palette.primary.main : undefined,
                                        fontWeight: isSource || isTarget ? "bold" as const : undefined,
                                        cursor: isSource ? "text" : "pointer",
                                        width: columnWidth,
                                        minWidth: columnWidth,
                                        maxWidth: columnWidth,
                                    };

                                    if (isSource) {
                                        const isEditing = editingRowId === row.id;
                                        const edited = isRowEdited(row);
                                        return (
                                            <td
                                                key={key}
                                                className={stickyClass}
                                                style={commonStyle}
                                                ref={(el) => {
                                                    sourceCellRefs.current.set(row.id as number, el);
                                                }}
                                                onClick={() => {
                                                    if (!isEditing) {
                                                        setEditingRowId(row.id as number);
                                                        setEditingValue(String(row[key] ?? ""));
                                                    }
                                                }}
                                            >
                                                {isEditing ? (
                                                    <TextField
                                                        autoFocus
                                                        size="small"
                                                        value={editingValue}
                                                        sx={{
                                                            '& .MuiInputBase-input': {
                                                                width: `${Math.max(editingValue.length + 1, 3)}ch`,
                                                            },
                                                        }}
                                                        onChange={(e) => setEditingValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") {
                                                                commitEditIfNeeded(row);
                                                            } else if (e.key === "Escape") {
                                                                setEditingRowId(null);
                                                                setEditingValue("");
                                                            }
                                                        }}
                                                        onBlur={() => commitEditIfNeeded(row)}
                                                        variant="outlined"
                                                        inputProps={{ style: { padding: "4px 6px", fontSize: "0.875rem" } }}
                                                    />
                                                ) : (
                                                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                                                        <span>
                                                            <SourceValueDisplay original={String(row["SourceOriginalValues"] ?? "")} edited={String(cellValue ?? "")} />
                                                        </span>
                                                        {edited && (
                                                            <IconButton size="small" className="cell-btn" aria-label="revert" onClick={(e) => {
                                                                e.stopPropagation();
                                                                updateSourceValue({
                                                                    column: candidate!.sourceColumn,
                                                                    value: row[sourceKey as string],
                                                                    newValue: String(row["SourceOriginalValues"] ?? ""),
                                                                    valueMatchesCallback: handleValueMatches,
                                                                    userOperationHistoryCallback: handleUserOperationsUpdate,
                                                                });
                                                            }}>
                                                                <UndoIcon fontSize="inherit" />
                                                            </IconButton>
                                                        )}
                                                    </Stack>
                                                )}
                                            </td>
                                        );
                                    }

                                    const isTargetEditing = editingTarget && editingTarget.rowId === row.id && editingTarget.key === key;
                                    return (
                                        <td
                                            key={key}
                                            className={stickyClass}
                                            style={commonStyle}
                                            onClick={() => {
                                                if (!candidate) return;
                                                if (!isTargetEditing) {
                                                    setEditingTarget({ rowId: row.id as number, key });
                                                    setEditingTargetValue(String(row[key] ?? ""));
                                                }
                                            }}
                                        >
                                            {isTargetEditing ? (
                                                <TextField
                                                    autoFocus
                                                    size="small"
                                                    value={editingTargetValue}
                                                    sx={{
                                                        '& .MuiInputBase-input': {
                                                            width: `${Math.max(editingTargetValue.length + 1, 3)}ch`,
                                                        },
                                                    }}
                                                    onChange={(e) => setEditingTargetValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            // Commit via blur; onBlur will trigger a single update
                                                            (e.target as HTMLInputElement).blur();
                                                        } else if (e.key === "Escape") {
                                                            setEditingTarget(null);
                                                            setEditingTargetValue("");
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        if (candidate) {
                                                            const original = String(row[key] ?? "");
                                                            if (original !== editingTargetValue) {
                                                                updateTargetMatchValue({
                                                                    sourceColumn: candidate.sourceColumn,
                                                                    sourceValue: String(row["SourceOriginalValues"] ?? ""),
                                                                    targetColumn: key,
                                                                    newTargetValue: editingTargetValue,
                                                                    valueMatchesCallback: handleValueMatches,
                                                                    userOperationHistoryCallback: handleUserOperationsUpdate,
                                                                });
                                                            }
                                                        }
                                                        setEditingTarget(null);
                                                        setEditingTargetValue("");
                                                    }}
                                                    variant="outlined"
                                                    inputProps={{ style: { padding: "4px 6px", fontSize: "0.875rem" } }}
                                                />
                                            ) : (
                                                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                                                    <span>{String(cellValue ?? "")}</span>
                                                    <IconButton
                                                        size="small"
                                                        className="cell-btn"
                                                        aria-label="edit enum"
                                                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (!candidate) return;
                                                            openEnumsPopover(row, key, e.currentTarget as HTMLElement);
                                                        }}
                                                    >
                                                        <EditIcon fontSize="inherit" />
                                                    </IconButton>
                                                </Stack>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Popover
                open={Boolean(enumAnchorEl)}
                anchorEl={enumAnchorEl}
                onClose={closeEnumsPopover}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Box sx={{ width: 360, p: 2 }} role="presentation">
                    <Stack spacing={1}>
                        <Typography variant="h6" sx={{ fontSize: "0.9rem", fontWeight: 600 }}>GDC Enums</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                            {selectedEnumContext?.targetColumn}
                        </Typography>
                        <TextField
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder="Search enums"
                            size="small"
                            InputProps={{
                                startAdornment: (
                                    <SearchIcon fontSize="small" />
                                )
                            }}
                        />

                        <Stack direction="row" flexWrap="wrap" gap={0.5}>
                            {filteredEnums.map((e, idx) => {
                                const isHighlighted = !!globalQuery && e.toLowerCase().includes(globalQuery.toLowerCase());
                                const def = gdcAttribute?.enumDef?.[e];
                                const ChipComp = isHighlighted ? HighlightedChip : BasicChip;
                                return (
                                    <Tooltip key={`${e}-${idx}`} title={def ?? e} arrow placement="top">
                                        <span>
                                            <ChipComp
                                                label={e}
                                                color="info"
                                                size="small"
                                                sx={{ fontSize: "0.65rem" }}
                                                clickable
                                                onMouseDown={(ev) => { ev.preventDefault(); ev.stopPropagation(); applyEnumToRow(e); }}
                                                onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); applyEnumToRow(e); }}
                                            />
                                        </span>
                                    </Tooltip>
                                );
                            })}
                        </Stack>
                        {!gdcAttribute?.enum?.length && (
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                                No enum values available for this property.
                            </Typography>
                        )}
                    </Stack>
                </Box>
            </Popover>
        </div>
    );
};

export default ValueComparisonTable;
