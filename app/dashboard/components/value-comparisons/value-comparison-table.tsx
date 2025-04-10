import { useMemo, useContext, useEffect } from "react";
import { useTheme } from "@mui/material/styles";
import { 
    MaterialReactTable,
    useMaterialReactTable,
    type MRT_ColumnDef,
} from "material-react-table";
import HighlightGlobalContext from "@/app/lib/highlight/highlight-context";
import { updateSourceValue } from "@/app/lib/heatmap/heatmap-helper";

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

    const columns: MRT_ColumnDef<any>[] = useMemo(() => {
        if (!rows.length || !candidate) return [];
        const cols = Object.keys(rows[0])
            .map((key) => ({
                accessorKey: key,
                header: key,
                maxSize: 50,
            } as MRT_ColumnDef<any>))
            .filter((column) => column.accessorKey !== "id");

        // cols.push({
        //         header: "Changes",
        //         accessorKey: "changes",
        //         Cell: ({ row }) => {
        //             return (
        //                 <div style={{ display: "inline-block", fontSize: "0.75rem", color: "#757575" }}>
        //                     <SourceValueDisplay
        //                         original={row.original[`SourceOriginalValues`]}
        //                         edited={row.original[`${candidate.sourceColumn}(source)`.replace(/\./g, "")]}
        //                     />
        //                 </div>
        //             );
        //         },
        //         Header: () => {
        //             return (
        //                 <div style={{ display: "flex", alignItems: "center", fontSize: "0.75rem", color: "#757575" }}>
        //                     <span>Changes</span>
        //                 </div>
        //             );
        //         },
        //         enableEditing: false,
        //         enableColumnActions: false,
        //         maxSize: 30,
        // });
        return cols;
    }, [rows, candidate]);

    const table = useMaterialReactTable({
        columns: columns,
        data: rows,
        enableColumnPinning: true,
        enableTopToolbar: false,
        enableRowActions: false,
        enablePagination: false,
        enableBottomToolbar: false,
        initialState: {
            columnPinning: {
                left: candidate?.sourceColumn ? [`changes`, `${candidate.sourceColumn}(source)`.replace(/\./g, "")] : [],
            },
            columnVisibility: {
                SourceOriginalValues: false,
            },
        },
        muiTableBodyCellProps: ({ cell, column, table }) => {
            const isSourceColumn = cell.column.id === `${candidate?.sourceColumn}(source)`.replace(/\./g, "");
            const isTargetColumn = cell.column.id === candidate?.targetColumn;
            const isChangesColumn = cell.column.id === "changes";
            const cellValue = cell.getValue();

            let cellStyle: React.CSSProperties = {
                backgroundColor: isChangesColumn
                    ? theme.palette.primary.light
                    : isSourceColumn
                    ? theme.palette.primary.dark
                    : isTargetColumn
                    ? theme.palette.secondary.dark
                    : undefined,
                color: isSourceColumn || isTargetColumn ? theme.palette.common.black : undefined,
                fontWeight: isSourceColumn || isTargetColumn ? "bold" : undefined,
            };

            if (
                globalQuery &&
                typeof cellValue === "string" &&
                cellValue.toLowerCase().includes(globalQuery.toLowerCase())
            ) {
                cellStyle = {
                    ...cellStyle,
                    color: theme.palette.primary.main,
                };
            }

            return {
                onClick: () => {
                    if (isSourceColumn) {
                        table.setEditingCell(cell);
                    } else {
                        if (candidate && column.id !== "changes") {
                            updateSourceValue({
                                column: candidate.sourceColumn,
                                value: cell.row.original[`${candidate?.sourceColumn}(source)`.replace(/\./g, "")],
                                newValue: cell.row.original[column.id],
                                valueMatchesCallback: handleValueMatches,
                            });
                        }
                    }
                },
                style: cellStyle,
                onKeyDown: (event) => {
                    if (event.key === "Enter" && isSourceColumn && candidate) {
                        updateSourceValue({
                            column: candidate.sourceColumn,
                            value: cell.row.original[`${candidate?.sourceColumn}(source)`.replace(/\./g, "")],
                            newValue: cell.getValue(),
                            valueMatchesCallback: handleValueMatches,
                        });
                        table.setEditingCell(null);
                    }
                },
            };
        },
        enableEditing: true,
        editDisplayMode: "cell",
    });

    // Refresh table columns when columns change
    useEffect(() => {
        table.setColumnOrder(columns.map((column) => column.accessorKey).filter((key): key is string => key !== undefined));
    }, [columns]);

    useMemo(() => {
        const columnPinning = [];
        if (candidate?.sourceColumn) {
            columnPinning.push(`${candidate.sourceColumn}(source)`.replace(/\./g, ""));
        }
        if (candidate?.targetColumn) {
            columnPinning.push(candidate.targetColumn);
        }
        table.setColumnPinning({ left: columnPinning });
    }, [candidate, table]);

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
                `}
            </style>
            <MaterialReactTable table={table} />
        </div>
    );
};

export default ValueComparisonTable;
