"use client";

import { useContext } from "react";
import { styled } from "@mui/material/styles";
import {
  Box, useTheme
} from "@mui/material";
import FileUploading from "./fileuploading";
import AcceptMatchButton from "./control-inputs/accept-match-button";
import RejectMatchButton from "./control-inputs/reject-match-button";
import DiscardColumnButton from "./control-inputs/discard-column-button";
import UndoButton from "./control-inputs/undo-button";
import RedoButton from "./control-inputs/redo-button";
import ExportMatchingResultsButton from "./control-inputs/export-matching-results";
import { SectionHeader, SectionLabel } from "../layout/components";


interface ShortcutPanelProps {
    handleFileUpload: (newCandidates: Candidate[], newSourceClusters?: SourceCluster[], newMatchers?: Matcher[]) => void;
    handleTargetOntology: (targetOntologies: TargetOntology[]) => void;
    acceptMatch: () => void;
    rejectMatch: () => void;
    discardColumn: () => void;
    undo: () => void;
    redo: () => void;
    exportMatchingResults: (format: string) => void;
}

const ShortcutPanel: React.FC<ShortcutPanelProps> = ({
    handleFileUpload,
    handleTargetOntology,
    acceptMatch,
    rejectMatch,
    discardColumn,
    undo,
    redo,
    exportMatchingResults,
}) => {
  const theme = useTheme();
  return (
    <>
        <SectionHeader>
            Shortcut Panel
        </SectionHeader>
        <Box sx={{ display: "flex", gap: 1, width: "100%", alignItems: "left", height: "30px" }}>
            <Box sx={{ display: "flex", gap: 0.5, backgroundColor: theme.palette.grey[300], px: 1, py: 0.5, borderRadius: 2, alignItems: "center" }}>
              <SectionLabel
              sx={{
                paddingRight: "0.2rem",
                fontSize: "0.8rem",
                fontWeight: "800",
                color: theme.palette.text.secondary,
              }}
              >Decision</SectionLabel>
              <AcceptMatchButton onClick={acceptMatch} />
              <RejectMatchButton onClick={rejectMatch} />
              <DiscardColumnButton onClick={discardColumn} />
            </Box>
            <Box sx={{ display: "flex", gap: 0.5, backgroundColor: theme.palette.grey[300], px: 1, py: 0.5, borderRadius: 2 }}>
              <UndoButton onClick={undo} />
              <RedoButton onClick={redo} />
            </Box>
            <ExportMatchingResultsButton onClick={exportMatchingResults} />
            <FileUploading callback={handleFileUpload} ontologyCallback={handleTargetOntology} />
        </Box>
    </>
  );
}

export default ShortcutPanel;
