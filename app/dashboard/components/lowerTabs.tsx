"use client";

import { useState } from "react";
import UpsetPlot from "./upset-plot/UpsetPlot";
import ValueComparisonTable from "./value-comparisons/value-comparison-table";
import DataWranglerTable from "./wrangler/data-wrangler-table";

import { Box, Tab } from "@mui/material";
import { TabPanel, TabList, TabContext } from "@mui/lab";

interface LowerTabsProps {
  weightedAggregatedCandidates: AggregatedCandidate[];
  matchers: Matcher[];
  selectedCandidate?: Candidate;
  setSelectedCandidate: (sourceColumn: string, targetColumn: string) => void;
  handleValueMatches: (valueMatches: ValueMatch[]) => void;
  valueMatches: ValueMatch[];
  metaData?: { sourceMeta: DatasetMeta; targetMeta: DatasetMeta };
}

const LowerTabs: React.FC<LowerTabsProps> = ({
  weightedAggregatedCandidates,
  matchers,
  selectedCandidate,
  setSelectedCandidate,
  handleValueMatches,
  valueMatches,
  metaData,
}) => {
  const [value, setValue] = useState("3");

  const handleChange = (event: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ width: "100%", marginTop: 0 }}>
      <TabContext value={value}>
          <TabList onChange={handleChange} aria-label="basic tabs example">
            <Tab label="UpSet Plot" value="1" />
            <Tab label="Value Comparisons" value="2" />
            <Tab label="Data Wrangler" value="3" />
          </TabList>
          <TabPanel sx={{ paddingBottom: 2, maxHeight: 0, overflowY: "scroll", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }} value="0">
          </TabPanel>
          <TabPanel sx={{ padding: 0, maxHeight: 400, overflowY: "scroll", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }} value="1">
            <UpsetPlot
              aggData={weightedAggregatedCandidates}
              matchers={matchers}
              selectedCandidate={selectedCandidate}
              setSelectedCandidate={setSelectedCandidate}
            />
          </TabPanel>
          <TabPanel sx={{ padding: 0, maxHeight: 400, overflowY: "scroll", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }} value="2">
            <ValueComparisonTable
              valueMatches={valueMatches}
              weightedAggregatedCandidates={weightedAggregatedCandidates}
              selectedCandidate={selectedCandidate}
              setSelectedCandidate={setSelectedCandidate}
              handleValueMatches={handleValueMatches}
            />
          </TabPanel>
          <TabPanel sx={{ padding: 0, maxHeight: 400, overflowY: "scroll", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }} value="3">
            <DataWranglerTable
              selectedCandidate={selectedCandidate}
              valueMatches={valueMatches}
              handleValueMatches={handleValueMatches}
              metaData={metaData}
            />
          </TabPanel>
      </TabContext>
    </Box>
  );
};

export default LowerTabs;