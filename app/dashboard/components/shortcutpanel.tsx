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
import NewMatcherButton from "./control-inputs/new-matcher-button";
import { SectionHeader, SectionLabel } from "../layout/components";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";


interface ShortcutPanelProps {
    handleFileUpload: (newCandidates: Candidate[], newSourceClusters?: SourceCluster[]) => void;
    handleTargetOntology: (targetOntologies: Ontology[]) => void;
    handleSourceOntology: (sourceOntologies: Ontology[]) => void;
    handleUniqueValues: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
    handleValueMatches: (valueMatches: ValueMatch[]) => void;
    acceptMatch: () => void;
    rejectMatch: () => void;
    discardColumn: () => void;
    undo: () => void;
    redo: () => void;
    exportMatchingResults: (format: string) => void;
    setOpenNewMatcherDialog: (open: boolean) => void;
}

const ShortcutPanel: React.FC<ShortcutPanelProps> = ({
    handleFileUpload,
    handleTargetOntology,
    handleSourceOntology,
    handleUniqueValues,
    handleValueMatches,
    acceptMatch,
    rejectMatch,
    discardColumn,
    undo,
    redo,
    exportMatchingResults,
    setOpenNewMatcherDialog,
}) => {
  const {
    developerMode,
  } = useContext(SettingsGlobalContext);
  const theme = useTheme();
  return (
    <>
        <SectionHeader>
            Shortcut Panel
        </SectionHeader>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "left", maxWidth: "300px" }}>
            <Box sx={{ display: "flex", gap: 1 }}>
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
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <ExportMatchingResultsButton onClick={exportMatchingResults} />
                  <FileUploading
                    callback={handleFileUpload}
                    ontologyCallback={handleTargetOntology}
                    sourceOntologyCallback={handleSourceOntology}
                    uniqueValuesCallback={handleUniqueValues}
                    valueMatchesCallback={handleValueMatches}
                  />
                </Box>
            </Box>

            {developerMode && (
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <NewMatcherButton onClick={() => setOpenNewMatcherDialog(true)} />
              </Box>
            )}
        </Box>
    </>
  );
}

export default ShortcutPanel;
