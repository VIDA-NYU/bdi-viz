"use client";

import { useEffect, useMemo, useState, useCallback, useContext } from "react";
import { Box, Button, Typography, Tooltip, Popover, TextField, Stack, FormControlLabel, Switch, Checkbox } from "@mui/material";
import Papa from "papaparse";
import { useTheme, alpha } from "@mui/material/styles";
import { DataGrid, GridColDef, GridCellParams, useGridApiRef } from "@mui/x-data-grid";
import { getSessionName } from "@/app/lib/settings/session";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import HighlightGlobalContext from "@/app/lib/highlight/highlight-context";
import { BasicChip, HighlightedChip } from "../../layout/components";
import { updateTargetMatchValue, getGDCAttribute } from "@/app/lib/heatmap/heatmap-helper";

interface DataWranglerTableProps {
  selectedCandidate?: Candidate;
  valueMatches: ValueMatch[];
  handleValueMatches?: (valueMatches: ValueMatch[]) => void;
  metaData?: { sourceMeta: DatasetMeta; targetMeta: DatasetMeta };
}

type CsvRow = Record<string, any>;

const MAX_ROWS = 1000; // safety cap for UI responsiveness

const DataWranglerTable: React.FC<DataWranglerTableProps> = ({ selectedCandidate, valueMatches, handleValueMatches, metaData }) => {
  const theme = useTheme();
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [columns, setColumns] = useState<GridColDef[]>([]);
  const [loading, setLoading] = useState(false);
  const session = getSessionName();
  // Edit-together state and popup search
  const [editing, setEditing] = useState<{ rowId: number | null; key: string | null; value: string; sourceValue: string | null }>({ rowId: null, key: null, value: "", sourceValue: null });
  const [popover, setPopover] = useState<{ anchorEl: Element | null; search: string; options: string[]; attribute?: GDCAttribute }>({ anchorEl: null, search: "", options: [], attribute: undefined });
  const { globalQuery } = useContext(HighlightGlobalContext);

  // Focus/visibility controls
  const [columnsAnchorEl, setColumnsAnchorEl] = useState<Element | null>(null);
  const [columnsSearch, setColumnsSearch] = useState<string>("");
  const [columnVisibilityModel, setColumnVisibilityModel] = useState<Record<string, boolean>>({});

  const apiRef = useGridApiRef();

  const csvUrl = useMemo(() => `/sessions/${encodeURIComponent(session)}/source.csv`, [session]);

  const fetchCsv = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(csvUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
      const text = await res.text();
      const parsed = Papa.parse(text, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
        comments: "#",
      });
      const data = (parsed.data as CsvRow[]).slice(0, MAX_ROWS);
      const cols = parsed.meta.fields?.map((f) => ({ field: f || "", headerName: f || "", flex: 1, minWidth: 160 })) || [];
      // Assign IDs for DataGrid
      const withId = data.map((d, idx) => ({ id: idx, ...d }));
      setColumns(cols);
      // Initialize visibility to show all
      const vis: Record<string, boolean> = {};
      cols.forEach((c) => { if (c.field) vis[c.field] = true; });
      setColumnVisibilityModel(vis);
      setRows(withId);
    } catch (e) {
      setColumns([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [csvUrl]);

  useEffect(() => {
    fetchCsv();
  }, [fetchCsv]);

  // Refetch when the source dataset changes (new task, new upload)
  useEffect(() => {
    if (!metaData?.sourceMeta) return;
    fetchCsv();
  }, [metaData?.sourceMeta?.timestamp, metaData?.sourceMeta?.name, fetchCsv]);

  const mappedColName = useMemo(() => {
    if (!selectedCandidate) return "";
    return `${selectedCandidate.targetColumn} (mapped)`;
  }, [selectedCandidate]);

  // Autofocus and scroll to the selected source column when candidate changes
  useEffect(() => {
    if (!apiRef?.current || !selectedCandidate) return;
    const sourceCol = selectedCandidate.sourceColumn;
    requestAnimationFrame(() => {
      try {
        // Focus the first row of the source column if available
        const firstId = augmented?.data?.[0]?.id ?? null;
        if (firstId !== null && (apiRef.current as any).setCellFocus) {
          (apiRef.current as any).setCellFocus(firstId, sourceCol);
        }
      } catch (_) {}
      try {
        // Scroll horizontally so the target column is visible, else scroll to the source column
        const targetColIndex = Math.max(0, (augmented?.cols || []).findIndex((c: any) => c.field === mappedColName));
        if (targetColIndex >= 0 && (apiRef.current as any).scrollToIndexes) {
          (apiRef.current as any).scrollToIndexes({ rowIndex: 0, colIndex: targetColIndex });
        } else {
          const sourceColIndex = Math.max(0, (augmented?.cols || []).findIndex((c: any) => c.field === sourceCol));
          if (sourceColIndex >= 0 && (apiRef.current as any).scrollToIndexes) {
            (apiRef.current as any).scrollToIndexes({ rowIndex: 0, colIndex: sourceColIndex });
          }
        }
      } catch (_) {}
    });
  }, [selectedCandidate, apiRef, rows, columns]);

  // Build an ephemeral mapped column when a candidate is selected
  const augmented = useMemo(() => {
    if (!selectedCandidate || rows.length === 0) {
      return { cols: columns, data: rows };
    }

    const sourceCol = selectedCandidate.sourceColumn;
    const match = valueMatches.find((m) => m.sourceColumn === sourceCol);
    const targetCol = selectedCandidate.targetColumn;
    const targetVM = match?.targets?.find((t) => t.targetColumn === targetCol);

    const sourceValues = match?.sourceValues || [];
    const mappedSourceValues = match?.sourceMappedValues || [];
    const targetValues = targetVM?.targetValues || [];

    const valueToMapped: Record<string, string> = {};
    for (let i = 0; i < sourceValues.length; i++) {
      const fromVal = String(sourceValues[i] ?? "");
      const rawTarget = targetValues[i];
      let toVal = "";
      if (rawTarget !== undefined && rawTarget !== null) {
        const s = String(rawTarget).trim();
        const sl = s.toLowerCase();
        // When target is empty/NaN/None, keep it empty. Do not fall back to source.
        if (s.length > 0 && sl !== "nan" && sl !== "none") {
          toVal = s;
        } else {
          toVal = "";
        }
      } else {
        toVal = "";
      }
      if (fromVal.length > 0) valueToMapped[fromVal] = toVal;
    }

    const newRows = rows.map((r) => {
      const srcVal = r[sourceCol];
      const existing = (r as any)[mappedColName];
      const computed = valueToMapped[String(srcVal ?? "")] ?? "";
      const mapped = existing !== undefined ? String(existing ?? "") : computed;
      return { ...r, [mappedColName]: mapped };
    });

    // Always add mapped column (even if empty)
    const mappedCol: GridColDef = {
      field: mappedColName,
      headerName: mappedColName,
      flex: 2,
      minWidth: 220,
      headerClassName: 'mapped-header',
      cellClassName: (params: GridCellParams<any, any>) => {
        const srcVal = String((params.row as any)[sourceCol] ?? "");
        const isLinked = editing.sourceValue !== null && srcVal === editing.sourceValue;
        return isLinked ? 'mapped-cell linked-edit' : 'mapped-cell';
      },
    };

    const sourceIdx = columns.findIndex((c) => c.field === sourceCol);
    const filtered = columns.filter((c) => c.field !== mappedColName);
    const insertIdx = sourceIdx >= 0 ? sourceIdx + 1 : filtered.length;
    const adjusted = filtered.map((c) => {
      const base: GridColDef = { ...c };
      if (c.field === sourceCol) {
        base.flex = 2;
        base.minWidth = 220;
        base.headerClassName = 'source-header';
        base.cellClassName = 'source-cell';
      } else {
        base.flex = Math.max(1, c.flex || 1);
        base.minWidth = Math.max(160, (c as any).minWidth || 0);
      }
      return base;
    });
    const newCols = [...adjusted.slice(0, insertIdx), mappedCol, ...adjusted.slice(insertIdx)];

    return { cols: newCols, data: newRows };
  }, [selectedCandidate, valueMatches, rows, columns, editing.sourceValue, mappedColName]);

  const mappingInfo = useMemo(() => {
    if (!selectedCandidate) return null as null | { sourceCol: string; targetCol: string; mappedColName: string };
    const sourceCol = selectedCandidate.sourceColumn;
    const targetCol = selectedCandidate.targetColumn;
    return { sourceCol, targetCol, mappedColName };
  }, [selectedCandidate, mappedColName]);

  const openEnumsPopover = useCallback((row: any, targetColumn: string, anchor: HTMLElement) => {
    setPopover((p) => ({ ...p, anchorEl: anchor, search: "", options: [], attribute: undefined }));
    const controller = new AbortController();
    getGDCAttribute({
        targetColumn,
        callback: (attr: any) => {
          const enums = Array.isArray(attr?.enum) ? (attr.enum as string[]) : [];
          setPopover((p) => ({ ...p, options: enums, attribute: attr as GDCAttribute }));
        },
        signal: controller.signal,
    });
  }, []);

  const closeEnumsPopover = useCallback(() => {
    setPopover({ anchorEl: null, options: [], search: "", attribute: undefined });
  }, []);

  const filteredTargetValueOptions = useMemo(() => {
    const options = popover.options || [];
    const q = popover.search?.toLowerCase?.() || "";
    if (!q) return options;
    return options.filter((e) => e.toLowerCase().includes(q));
  }, [popover.options, popover.search]);

  const applyEnumToRow = useCallback((enumValue: string) => {
    if (!selectedCandidate || editing.sourceValue === null || !handleValueMatches) return;
    const sourceCol = selectedCandidate.sourceColumn;
    const targetCol = selectedCandidate.targetColumn;
    try { console.log("[Wrangler] applyEnumToRow", { enumValue, sourceCol, targetCol, sourceValue: editing.sourceValue }); } catch (_) {}
    setRows((prev) => prev.map((r) => (String(r[sourceCol] ?? "") === editing.sourceValue ? { ...r, [mappedColName]: enumValue } : r)));
    updateTargetMatchValue({
      sourceColumn: sourceCol,
      sourceValue: editing.sourceValue,
      targetColumn: targetCol,
      newTargetValue: enumValue,
      valueMatchesCallback: handleValueMatches,
    });
    closeEnumsPopover();
    setEditing((s) => ({ ...s, sourceValue: null }));
  }, [selectedCandidate, editing.sourceValue, handleValueMatches, mappedColName, closeEnumsPopover]);

  // Quick helpers for visibility controls
  const showOnlyFocused = useCallback(() => {
    if (!selectedCandidate) return;
    const sourceCol = selectedCandidate.sourceColumn;
    const vis: Record<string, boolean> = {};
    (augmented.cols || []).forEach((c: any) => {
      vis[c.field] = (c.field === sourceCol || c.field === mappedColName);
    });
    setColumnVisibilityModel(vis);
  }, [selectedCandidate, augmented, mappedColName]);

  const showAllColumns = useCallback(() => {
    const vis: Record<string, boolean> = {};
    (augmented.cols || []).forEach((c: any) => { vis[c.field] = true; });
    setColumnVisibilityModel(vis);
  }, [augmented]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1,
      '& .mapped-cell': { backgroundColor: alpha(theme.palette.secondary.light, 0.3) },
      '& .source-cell': { backgroundColor: alpha(theme.palette.primary.light, 0.3) },
      '& .linked-edit': { boxShadow: 'inset 0 0 0 2px #90caf9' },
      '& .muted-cell': { opacity: 0.55, filter: 'grayscale(0.1)' },
      '& .muted-header': { opacity: 0.8 },
    }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle2">Session: {session}</Typography>
          <Button size="small" onClick={showOnlyFocused} disabled={!selectedCandidate}>Show focused only</Button>
          <Button size="small" onClick={showAllColumns}>Show all</Button>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<ViewColumnIcon />} onClick={(e) => setColumnsAnchorEl(e.currentTarget)}>Columns</Button>
          <Button size="small" onClick={fetchCsv} disabled={loading}>Refresh</Button>
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
                {(augmented.cols || []).filter((c: any) => !columnsSearch || (c.headerName || c.field || '').toLowerCase().includes(columnsSearch.toLowerCase())).map((c: any) => (
                  <FormControlLabel key={c.field} control={<Checkbox size="small" checked={columnVisibilityModel[c.field] !== false} onChange={(e) => setColumnVisibilityModel((prev) => ({ ...prev, [c.field]: e.target.checked }))} />} label={<Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{c.headerName || c.field}</Typography>} />
                ))}
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Popover>

      <div style={{ width: "100%", height: 360 }}>
        <DataGrid
          apiRef={apiRef}
          rows={augmented.data}
          columns={(augmented.cols || []).map((col) => {
            if (!mappingInfo) return col;
            const { sourceCol, targetCol, mappedColName } = mappingInfo;
            // Determine focus vs muted styling
            const isFocus = col.field === sourceCol || col.field === mappedColName;
            const baseFlex = isFocus ? 2 : 1;
            const baseMinWidth = isFocus ? 220 : 160;
            const addClasses = isFocus
              ? { headerClassName: `${col.headerClassName || ''} focus-header`.trim(), cellClassName: `${(col as any).cellClassName || ''} focus-col`.trim() }
              : { headerClassName: `${col.headerClassName || ''} muted-header`.trim(), cellClassName: `${(col as any).cellClassName || ''} muted-cell`.trim() };

            if (col.field === sourceCol) {
              return { ...col, flex: baseFlex, minWidth: baseMinWidth, headerClassName: `${'source-header'} ${addClasses.headerClassName || ''}`.trim(), cellClassName: `${'source-cell'} ${addClasses.cellClassName || ''}`.trim() } as GridColDef;
            }
            if (col.field !== mappedColName) {
              return { ...col, flex: baseFlex, minWidth: baseMinWidth, ...addClasses } as GridColDef;
            }
            // Mapped column: inline edit on click + hover edit icon
            return {
              ...col,
              flex: baseFlex,
              minWidth: baseMinWidth,
              headerClassName: 'mapped-header',
              cellClassName: 'mapped-cell',
              renderCell: (params: GridCellParams<any, any>) => {
                const srcVal = String((params.row as any)[sourceCol] ?? "");
                const current = String(params.value ?? "");
                const isEditing = editing.rowId === (params.id as number) && editing.key === mappedColName;
                const startInline = () => {
                  setEditing({ rowId: params.id as number, key: mappedColName, value: current, sourceValue: srcVal });
                };
                const commit = () => {
                  if (!handleValueMatches) { setEditing({ rowId: null, key: null, value: "", sourceValue: null }); return; }
                  const newVal = editing.value;
                  // optimistic update across all rows with the same source value
                  setRows((prev) => prev.map((r) => (String(r[sourceCol] ?? "") === srcVal ? { ...r, [mappedColName]: newVal } : r)));
                  // persist to backend
                  updateTargetMatchValue({
                    sourceColumn: sourceCol,
                    sourceValue: srcVal,
                    targetColumn: targetCol,
                    newTargetValue: newVal,
                    valueMatchesCallback: handleValueMatches,
                  });
                  setEditing({ rowId: null, key: null, value: "", sourceValue: null });
                };
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%' }} onClick={(e) => {
                    // Enter inline edit when clicking the cell area
                    // Avoid when clicking the icon (it will stopPropagation)
                    if (!isEditing) startInline();
                  }}>
                    {isEditing ? (
                      <TextField
                        autoFocus
                        size="small"
                        value={editing.value}
                        onChange={(e) => setEditing((s) => ({ ...s, value: e.target.value }))}
                        onBlur={commit}
                        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing({ rowId: null, key: null, value: "", sourceValue: null }); } }}
                        inputProps={{ style: { padding: '2px 6px', fontSize: '0.85rem' } }}
                      />
                    ) : (
                      <span style={{ cursor: 'text', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{current}</span>
                    )}
                    <Tooltip title="Search target value (applies to all identical source values)">
                      <EditIcon
                        className="cell-btn"
                        fontSize="small"
                        sx={{ color: 'primary.main', cursor: 'pointer', opacity: 0.7, '&:hover': { opacity: 1 } }}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // Open popover without triggering inline edit
                          setEditing((s) => ({ ...s, sourceValue: srcVal }));
                          openEnumsPopover(params.row as any, targetCol, e.currentTarget as any as HTMLElement);
                        }}
                      />
                    </Tooltip>
                  </Box>
                );
              },
            } as GridColDef;
          })}
          columnVisibilityModel={columnVisibilityModel}
          onColumnVisibilityModelChange={(model) => setColumnVisibilityModel(model as Record<string, boolean>)}
          density="compact"
          loading={loading}
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { page: 0, pageSize: 50 } } }}
          sx={{
            '& .MuiDataGrid-columnHeaders': { position: 'sticky', top: 0, zIndex: 2 },
            '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700, fontFamily: '"Roboto","Helvetica","Arial",sans-serif' },
            '& .cell-btn': { opacity: 0, transition: 'opacity 160ms ease' },
            '& .MuiDataGrid-cell:hover .cell-btn': { opacity: 1 },
          }}
        />
      </div>

      {/* Existing target value popover */}
      <Popover
        open={Boolean(popover.anchorEl)}
        anchorEl={popover.anchorEl}
        onClose={closeEnumsPopover}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box sx={{ width: 360, p: 2 }} role="presentation">
          <Stack spacing={1}>
            <Typography variant="h6" sx={{ fontSize: "0.9rem", fontWeight: 600 }}>Target Values</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
              {selectedCandidate?.targetColumn}
            </Typography>
            <TextField
              value={popover.search}
              onChange={(e) => setPopover((p) => ({ ...p, search: e.target.value }))}
              placeholder="Search enums"
              size="small"
              InputProps={{
                startAdornment: (
                  <SearchIcon fontSize="small" />
                )
              }}
            />
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {filteredTargetValueOptions.map((e, idx) => {
                const isHighlighted = !!globalQuery && e.toLowerCase().includes(globalQuery.toLowerCase());
                const def = popover.attribute?.enumDef?.[e as any];
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
                        onMouseDown={(ev: any) => { ev.preventDefault(); ev.stopPropagation(); applyEnumToRow(e); }}
                        onClick={(ev: any) => { ev.preventDefault(); ev.stopPropagation(); applyEnumToRow(e); }}
                      />
                    </span>
                  </Tooltip>
                );
              })}
            </Stack>
            {!popover.attribute?.enum?.length && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                No enum values available for this property.
              </Typography>
            )}
          </Stack>
        </Box>
      </Popover>
    </Box>
  );
};

export default DataWranglerTable;


