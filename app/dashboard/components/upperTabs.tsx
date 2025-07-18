"use client";

import { useState, useContext, useEffect, useMemo } from "react";
import { Box, Tab } from "@mui/material";
import { TabList, TabContext } from "@mui/lab";

import HeatMap from "./embed-heatmap/HeatMap";
import HighlightGlobalContext from "@/app/lib/highlight/highlight-context";

interface UpperTabsProps {
  weightedAggregatedCandidates: AggregatedCandidate[];
  sourceColumn: string;
  sourceColumns: SourceColumn[];
  setSourceColumn: (sourceColumn: string) => void;
  sourceCluster: string[];
  targetOntologies: Ontology[];
  sourceOntologies: Ontology[];
  selectedCandidate: Candidate | undefined;
  setSelectedCandidate: (candidate: Candidate | undefined) => void;
  sourceUniqueValues: SourceUniqueValues[];
  targetUniqueValues: TargetUniqueValues[];
  highlightSourceColumns: string[];
  highlightTargetColumns: string[];
  status: string[];
  updateStatus: (status: string[]) => void;
}

const UpperTabs: React.FC<UpperTabsProps> = ({
  weightedAggregatedCandidates,
  sourceColumn,
  setSourceColumn,
  sourceColumns,
  sourceCluster,
  targetOntologies,
  sourceOntologies,
  selectedCandidate,
  setSelectedCandidate,
  sourceUniqueValues,
  targetUniqueValues,
  highlightSourceColumns,
  highlightTargetColumns,
  status,
  updateStatus,
}) => {
  const [value, setValue] = useState("3");
  const { setGlobalCandidateHighlight } = useContext(HighlightGlobalContext);

  const handleChange = (event: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
    setGlobalCandidateHighlight(undefined);
    setSelectedCandidate(undefined);
    if (newValue === "1") {
      updateStatus(["accepted"]);
    } else if (newValue === "2") {
      updateStatus(["rejected", "discarded", "idle"]);
    } else {
      updateStatus(["accepted", "rejected", "discarded", "idle"]);
    }
  };

  const sourceColumnStatus = useMemo(() => {
    const sourceColumnStatus = sourceColumns.find(
      (column) => column.name === sourceColumn
    );
    if (sourceColumnStatus) {
      return sourceColumnStatus.status;
    } else {
      return "complete";
    }
  }, [sourceColumns, sourceColumn, selectedCandidate]);

  useEffect(() => {
    if (status.length === 1 && status[0] === "accepted") {
      setValue("1");
    } else if (status.length === 3) {
      setValue("2");
    } else {
      setValue("3");
    }
  }, [status]);

  return (
    <Box
      sx={{
        width: "100%",
        minHeight: "600px",
        marginTop: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TabContext value={value}>
        <Box sx={{ borderTop: 1, borderColor: "divider" }}>
            <TabList onChange={handleChange} aria-label="basic tabs example">
            <Tab label="Accepted" value="1" disabled={sourceColumnStatus !== "complete"} />
            <Tab label="Unmatched" value="2" />
            <Tab label="All" value="3" />
            </TabList>
        </Box>
      </TabContext>
      <Box
        sx={{
          paddingTop: 0,
          flexGrow: 1,
          flexDirection: "column",
          display: "flex",
        }}
      >
        <HeatMap
          data={weightedAggregatedCandidates}
          sourceColumn={sourceColumn}
          setSourceColumn={setSourceColumn}
          sourceColumns={sourceColumns}
          sourceCluster={sourceCluster}
          targetOntologies={targetOntologies}
          sourceOntologies={sourceOntologies}
          selectedCandidate={selectedCandidate}
          setSelectedCandidate={setSelectedCandidate}
          sourceUniqueValues={sourceUniqueValues}
          targetUniqueValues={targetUniqueValues}
          sx={{
            flexGrow: 1,
          }}
          highlightSourceColumns={highlightSourceColumns}
          highlightTargetColumns={highlightTargetColumns}
        />
      </Box>
    </Box>
  );
};

export default UpperTabs;
