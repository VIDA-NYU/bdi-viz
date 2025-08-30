import { useMemo, useContext, useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Popover, IconButton, Stack, TextField, Tooltip, Typography, Switch, FormControlLabel, Divider } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ListAltIcon from "@mui/icons-material/ListAlt";
import UndoIcon from "@mui/icons-material/Undo";
import HighlightGlobalContext from "@/app/lib/highlight/highlight-context";
import { updateSourceValue, getGDCAttribute } from "@/app/lib/heatmap/heatmap-helper";
import { BasicChip, HighlightedChip } from "../../layout/components";

interface ValueComparisonTableProps {
    valueMatches: ValueMatch[];
    weightedAggregatedCandidates: AggregatedCandidate[];
    selectedCandidate?: Candidate;
    setSelectedCandidate: (sourceColumn: string, targetColumn: string) => void;
    handleValueMatches: (valueMatches: ValueMatch[]) => void;
    selectedSourceColumn: string;
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
    selectedSourceColumn,
}) => {
    const theme = useTheme();
    const { globalCandidateHighlight, globalQuery } = useContext(HighlightGlobalContext);
    const [gdcAttribute, setGdcAttribute] = useState<GDCAttribute | undefined>(undefined);
    const [enumAnchorEl, setEnumAnchorEl] = useState<HTMLElement | null>(null);
    const [searchText, setSearchText] = useState("");
    const [selectedRowForEnums, setSelectedRowForEnums] = useState<any | null>(null);
    const sourceCellRefs = useRef<Map<number, HTMLElement | null>>(new Map());

    const candidate = useMemo(() => {
        let candidate = selectedCandidate;
        if (selectedCandidate?.targetColumn === "") {
            if (globalCandidateHighlight) {
                candidate = globalCandidateHighlight as Candidate;
            }
        }
        return candidate;
    }, [selectedCandidate, globalCandidateHighlight]);

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
                    // Use our helper component to display both original and edited values on the source column
                    [`${valueMatch.sourceColumn}(source)`.replace(/\./g, "")]:  valueMatch.sourceMappedValues[index],
                    "SourceOriginalValues": sourceValue,
                    // (
                    //     <SourceValueDisplay
                    //         original={sourceValue}
                    //         edited={valueMatch.sourceMappedValues[index]}
                    //     />
                    // ),
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
    }, [valueMatches, weightedAggregatedCandidates, candidate, selectedSourceColumn]);

    // Fetch GDC attribute for the selected candidate's target column
    useEffect(() => {
        if (!candidate || !candidate.targetColumn) {
            setGdcAttribute(undefined);
            return;
        }
        const controller = new AbortController();
        getGDCAttribute({
            targetColumn: candidate.targetColumn,
            callback: (attr) => setGdcAttribute(attr),
            signal: controller.signal,
        });
        return () => controller.abort();
    }, [candidate]);

    const openEnumsPopover = useCallback((row: any) => {
        setSelectedRowForEnums(row);
        const anchor = sourceCellRefs.current.get(row.id as number) || null;
        setEnumAnchorEl(anchor);
    }, []);

    const closeEnumsPopover = useCallback(() => {
        setEnumAnchorEl(null);
        setSearchText("");
        setSelectedRowForEnums(null);
    }, []);

    // Build dynamic column keys in display order
    const dynamicColumnKeys = useMemo(() => {
        if (!rows.length) return [] as string[];
        const keys = Object.keys(rows[0]).filter((k) => k !== "id" && k !== "SourceOriginalValues");
        return keys;
    }, [rows]);

    // Sticky column measurements for 3 left-pinned columns: review, source, target
    const tableContainerRef = useRef<HTMLDivElement | null>(null);
    const thReviewRef = useRef<HTMLTableCellElement | null>(null);
    const thSourceRef = useRef<HTMLTableCellElement | null>(null);

    const updateStickyOffsets = useCallback(() => {
        const container = tableContainerRef.current;
        if (!container) return;
        const reviewWidth = thReviewRef.current?.getBoundingClientRect().width ?? 0;
        const sourceWidth = thSourceRef.current?.getBoundingClientRect().width ?? 0;
        container.style.setProperty("--sticky-left-0", `0px`);
        container.style.setProperty("--sticky-left-1", `${reviewWidth}px`);
        container.style.setProperty("--sticky-left-2", `${reviewWidth + sourceWidth}px`);
    }, []);

    useLayoutEffect(() => {
        updateStickyOffsets();
    }, [rows, dynamicColumnKeys, updateStickyOffsets]);

    useEffect(() => {
        const onResize = () => updateStickyOffsets();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [updateStickyOffsets]);

    const [editingRowId, setEditingRowId] = useState<number | null>(null);
    const [editingValue, setEditingValue] = useState<string>("");
    const [localFilter, setLocalFilter] = useState<string>("");
    const [showOnlyEdited, setShowOnlyEdited] = useState<boolean>(false);

    const filteredEnums = useMemo(() => {
        if (!gdcAttribute?.enum) return [] as string[];
        if (!searchText) return gdcAttribute.enum;
        return gdcAttribute.enum.filter((e) => e.toLowerCase().includes(searchText.toLowerCase()));
    }, [gdcAttribute, searchText]);

    const applyEnumToRow = useCallback((enumValue: string) => {
        if (!candidate || !selectedRowForEnums) return;
        updateSourceValue({
            column: candidate.sourceColumn,
            value: selectedRowForEnums[`${candidate?.sourceColumn}(source)`.replace(/\./g, "")],
            newValue: enumValue,
            valueMatchesCallback: handleValueMatches,
        });
    }, [candidate, selectedRowForEnums, handleValueMatches]);

    const sourceKey = useMemo(() => {
        if (!candidate) return null as string | null;
        return `${candidate.sourceColumn}(source)`.replace(/\./g, "");
    }, [candidate]);

    const displayedColumnKeys = useMemo(() => {
        if (!rows.length) return [] as string[];
        const keys = Object.keys(rows[0]).filter((k) => k !== "id" && k !== "SourceOriginalValues");
        const order: string[] = ["__review__"];
        if (sourceKey && keys.includes(sourceKey)) order.push(sourceKey);
        if (candidate?.targetColumn && keys.includes(candidate.targetColumn)) order.push(candidate.targetColumn);
        const remaining = keys.filter((k) => !order.includes(k));
        return [...order, ...remaining];
    }, [rows, sourceKey, candidate]);

    const commitEditIfNeeded = useCallback((row: any) => {
        if (!candidate || editingRowId === null) return;
        updateSourceValue({
            column: candidate.sourceColumn,
            value: row[sourceKey as string],
            newValue: editingValue,
            valueMatchesCallback: handleValueMatches,
        });
        setEditingRowId(null);
        setEditingValue("");
    }, [candidate, editingRowId, editingValue, handleValueMatches, sourceKey]);

    const isRowEdited = useCallback((row: any) => {
        if (!sourceKey) return false;
        return String(row[sourceKey]) !== String(row["SourceOriginalValues"] ?? "");
    }, [sourceKey]);

    const editedCount = useMemo(() => rows.filter((r) => isRowEdited(r)).length, [rows, isRowEdited]);

    const visibleRows = useMemo(() => {
        const filtered = rows.filter((row) => {
            if (showOnlyEdited && !isRowEdited(row)) return false;
            if (!localFilter) return true;
            const values = Object.values(row).map((v) => String(v ?? "").toLowerCase());
            return values.some((v) => v.includes(localFilter.toLowerCase()));
        });
        return filtered;
    }, [rows, showOnlyEdited, localFilter, isRowEdited]);

    return (
        <div style={{ display: "flex", flexDirection: "column" }}>
            <style>
                {`
                    tr {
                        height: 10px;
                    }
                    tr td {
                        height: auto !important;
                    }
                    .MuiTableCell-head {
                        max-width: 300px !important;
                    }
                    .table-container { overflow: auto; border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; width: 100%; }
                    table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; table-layout: fixed; font-size: 0.92rem; }
                    th, td { box-sizing: border-box; border-bottom: 1px solid rgba(0,0,0,0.12); border-right: 1px solid rgba(0,0,0,0.12); padding: 8px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                    thead th:last-child, tbody td:last-child { border-right: none; }
                    thead th { position: sticky; top: 0; z-index: 3; }
                    .sticky-review { position: sticky; left: var(--sticky-left-0); z-index: 4; }
                    .sticky-source { position: sticky; left: var(--sticky-left-1); z-index: 4; }
                    .sticky-target { position: sticky; left: var(--sticky-left-2); z-index: 4; }
                    tbody tr:hover td { background-color: rgba(0,0,0,0.03); }
                    .cell-btn { opacity: 0; transition: opacity 160ms ease; }
                    td:hover .cell-btn { opacity: 1; }
                    .col-review { width: 44px; min-width: 44px; max-width: 44px; text-align: center; }
                `}
            </style>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, px: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    {candidate?.targetColumn && (
                        <Typography variant="caption" color="text.secondary">Target: {candidate.targetColumn}</Typography>
                    )}
                    <Divider orientation="vertical" flexItem />
                    <Typography variant="caption" color="text.secondary">Rows: {visibleRows.length}</Typography>
                    <Typography variant="caption" color="text.secondary">Edited: {editedCount}</Typography>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <TextField
                        size="small"
                        placeholder="Filter rows"
                        value={localFilter}
                        onChange={(e) => setLocalFilter(e.target.value)}
                        InputProps={{ startAdornment: (<SearchIcon fontSize="small" />) }}
                    />
                    <FormControlLabel
                        control={<Switch size="small" checked={showOnlyEdited} onChange={(e) => setShowOnlyEdited(e.target.checked)} />}
                        label={<Typography variant="caption">Only edited</Typography>}
                    />
                </Stack>
            </Box>
            <div ref={tableContainerRef} className={"table-container"}>
                <table>
                    <thead>
                        <tr>
                            {displayedColumnKeys.map((key) => {
                                const isReview = key === "__review__";
                                const isSource = sourceKey && key === sourceKey;
                                const isTarget = candidate?.targetColumn && key === candidate.targetColumn;
                                const stickyClass = isReview ? "sticky-review" : isSource ? "sticky-source" : isTarget ? "sticky-target" : "";
                                const refProp = isReview ? { ref: thReviewRef } : isSource ? { ref: thSourceRef } : {};
                                return (
                                    <th
                                        key={key}
                                        className={`${stickyClass} ${isReview ? "col-review" : ""}`}
                                        {...refProp}
                                        style={{
                                            background: theme.palette.background.paper,
                                            fontWeight: 600,
                                            color: theme.palette.text.primary,
                                        }}
                                    >
                                        {isReview ? (
                                            <Tooltip title="Open enums and helpers for the row" arrow>
                                                <span>Review</span>
                                            </Tooltip>
                                        ) : isSource ? (
                                            <Tooltip title="Editable source value (Enter to apply, Esc to cancel)" arrow>
                                                <span>{key}</span>
                                            </Tooltip>
                                        ) : isTarget ? (
                                            <Tooltip title="Click a cell below to map the source to this value" arrow>
                                                <span>{key}</span>
                                            </Tooltip>
                                        ) : (
                                            key
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.map((row) => (
                            <tr key={row.id}>
                                {displayedColumnKeys.map((key) => {
                                    const isReview = key === "__review__";
                                    const isSource = sourceKey && key === sourceKey;
                                    const isTarget = candidate?.targetColumn && key === candidate.targetColumn;
                                    const stickyClass = isReview ? "sticky-review" : isSource ? "sticky-source" : isTarget ? "sticky-target" : "";
                                    const cellValue = isReview ? "" : row[key];

                                    let backgroundColor: string | undefined = undefined;
                                    if (isReview) {
                                        backgroundColor = "rgba(230,242,252,0.8)";
                                    } else if (isSource) {
                                        backgroundColor = "rgb(230,242,252)";
                                    } else if (isTarget) {
                                        backgroundColor = "rgb(184,158,199)";
                                    }
                                    const emphasize = (typeof cellValue === "string" && globalQuery && cellValue.toLowerCase().includes(globalQuery.toLowerCase()));

                                    const commonStyle: React.CSSProperties = {
                                        backgroundColor,
                                        color: emphasize ? theme.palette.primary.main : undefined,
                                        fontWeight: isSource || isTarget ? "bold" as const : undefined,
                                        cursor: isSource ? "text" : isReview ? "pointer" : "pointer",
                                    };

                                    if (isReview) {
                                        return (
                                            <td key={key} className={`${stickyClass} col-review`} style={commonStyle}>
                                                <IconButton size="small" aria-label="review enums" onClick={() => openEnumsPopover(row)}>
                                                    <ListAltIcon fontSize="small" />
                                                </IconButton>
                                            </td>
                                        );
                                    }

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

                                    return (
                                        <td
                                            key={key}
                                            className={stickyClass}
                                            style={commonStyle}
                                            onClick={() => {
                                                if (!candidate) return;
                                                updateSourceValue({
                                                    column: candidate.sourceColumn,
                                                    value: row[sourceKey as string],
                                                    newValue: row[key],
                                                    valueMatchesCallback: handleValueMatches,
                                                });
                                            }}
                                        >
                                            {String(cellValue ?? "")}
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
                            {candidate?.targetColumn}
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
                                                onClick={() => applyEnumToRow(e)}
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
