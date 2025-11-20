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
import ValueMatchingUploading from "./value-matching-uploading";
import { SectionHeader, SectionLabel } from "../layout/components";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";


interface ShortcutPanelProps {
    handleFileUpload: (newCandidates: Candidate[]) => void;
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

const ShortcutGroup = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(0.2),
  backgroundColor: theme.palette.grey[300],
  padding: theme.spacing(0.5, 1),
  borderRadius: theme.shape.borderRadius * 2,
  alignItems: "center",
  flexWrap: "wrap",
}));

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
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 1,
            alignItems: "flex-start",
          }}
        >
            <ShortcutGroup>
              <SectionLabel
                sx={{
                  paddingRight: "0.2rem",
                  fontSize: "0.8rem",
                  fontWeight: "400",
                  color: theme.palette.text.secondary,
                }}
              >
                Operations
              </SectionLabel>
              <AcceptMatchButton onClick={acceptMatch} />
              <RejectMatchButton onClick={rejectMatch} />
              <DiscardColumnButton onClick={discardColumn} />
            </ShortcutGroup>

            <ShortcutGroup>
              <SectionLabel
                sx={{
                  paddingRight: "0.2rem",
                  fontSize: "0.8rem",
                  fontWeight: "400",
                  color: theme.palette.text.secondary,
                }}
              >
                History
              </SectionLabel>
              <UndoButton onClick={undo} />
              <RedoButton onClick={redo} />
            </ShortcutGroup>

            <ShortcutGroup>
              <SectionLabel
                sx={{
                  paddingRight: "0.2rem",
                  fontSize: "0.8rem",
                  fontWeight: "400",
                  color: theme.palette.text.secondary,
                }}
              >
                File
              </SectionLabel>
              <FileUploading
                callback={handleFileUpload}
                ontologyCallback={handleTargetOntology}
                sourceOntologyCallback={handleSourceOntology}
                uniqueValuesCallback={handleUniqueValues}
                valueMatchesCallback={handleValueMatches}
              />
              <ExportMatchingResultsButton onClick={exportMatchingResults} />
            </ShortcutGroup>

            {developerMode && (
              <ShortcutGroup>
                <SectionLabel
                  sx={{
                    paddingRight: "0.2rem",
                    fontSize: "0.8rem",
                    fontWeight: "400",
                    color: theme.palette.text.secondary,
                  }}
                >
                  Developer
                </SectionLabel>
                <ValueMatchingUploading
                  callback={handleFileUpload}
                  ontologyCallback={handleTargetOntology}
                  sourceOntologyCallback={handleSourceOntology}
                  uniqueValuesCallback={handleUniqueValues}
                  valueMatchesCallback={handleValueMatches}
                />
                <NewMatcherButton onClick={() => setOpenNewMatcherDialog(true)} />
              </ShortcutGroup>
            )}
        </Box>
    </>
  );
}

export default ShortcutPanel;
