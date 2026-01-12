"use client";

import { useContext, useState } from "react";
import {
  Box,
  Paper,
  IconButton,
  Typography,
  Divider,
  Chip,
  Stack,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Alert,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PostAddIcon from "@mui/icons-material/PostAdd";
import CloseIcon from "@mui/icons-material/Close";

import { BasicButton } from "../layout/components";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import { Dropzone } from "./file-upload/fileUploadBox";
import { toastify } from "@/app/lib/toastify/toastify-helper";
import {
  runMatchingTask,
  getCachedResults,
  getTargetOntology,
  getValueBins,
  getValueMatches,
  applyUserOperation,
} from "@/app/lib/heatmap/heatmap-helper";

interface ValueMatchingUploadingProps {
  callback: (candidates: Candidate[]) => void;
  ontologyCallback: (targetOntology: Ontology[]) => void;
  sourceOntologyCallback: (sourceOntology: Ontology[]) => void;
  uniqueValuesCallback: (
    sourceUniqueValuesArray: SourceUniqueValues[],
    targetUniqueValuesArray: TargetUniqueValues[]
  ) => void;
  valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
}

const ValueMatchingUploading: React.FC<ValueMatchingUploadingProps> = ({
  callback,
  ontologyCallback,
  sourceOntologyCallback,
  uniqueValuesCallback,
  valueMatchesCallback,
}) => {
  const { setTaskStateFor } = useContext(SettingsGlobalContext);
  const [isVisible, setIsVisible] = useState(false);

  const handleOnSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const sourceFile = formData.get("source-csv") as File | null;
    const targetCsvFile = formData.get("target-csv") as File | null;
    const groundtruthCsvFile = formData.get("groundtruth-csv") as File | null;

    if (!sourceFile) {
      toastify("error", "Source CSV file is required.");
      return;
    }
    if (!groundtruthCsvFile) {
      toastify("error", "Ground truth CSV file is required.");
      return;
    }

    const uploadData = new FormData();
    uploadData.append("type", "csv_input");

    try {
      setTaskStateFor("matching", {
        status: "started",
        progress: 0,
        current_step: "Preparing...",
        completed_steps: 0,
        total_steps: 1,
        logs: [],
      } as TaskState);

      uploadData.append("source_csv", sourceFile, sourceFile.name);
      if (sourceFile?.name)
        uploadData.append("source_csv_name", sourceFile.name);
      if (sourceFile.size)
        uploadData.append(
          "source_csv_size",
          `${(sourceFile.size / 1024).toFixed(2)} KB`
        );
      uploadData.append("source_csv_timestamp", new Date().toISOString());

      if (targetCsvFile) {
        uploadData.append("target_csv", targetCsvFile, targetCsvFile.name);
        if (targetCsvFile?.name)
          uploadData.append("target_csv_name", targetCsvFile.name);
        if (targetCsvFile?.size)
          uploadData.append(
            "target_csv_size",
            `${(targetCsvFile.size / 1024).toFixed(2)} KB`
          );
        uploadData.append("target_csv_timestamp", new Date().toISOString());
      }

      if (groundtruthCsvFile) {
        uploadData.append(
          "groundtruth_csv",
          groundtruthCsvFile,
          groundtruthCsvFile.name
        );
        if (groundtruthCsvFile?.name)
          uploadData.append(
            "groundtruth_csv_name",
            groundtruthCsvFile.name
          );
        if (groundtruthCsvFile?.size)
          uploadData.append(
            "groundtruth_csv_size",
            `${(groundtruthCsvFile.size / 1024).toFixed(2)} KB`
          );
        uploadData.append(
          "groundtruth_csv_timestamp",
          new Date().toISOString()
        );
      }

      runMatchingTask({
        uploadData,
        onResult: () => {
          getCachedResults({ callback });
          getTargetOntology({ callback: ontologyCallback });
          getValueBins({ callback: uniqueValuesCallback });
          getValueMatches({ callback: valueMatchesCallback });

          setIsVisible(false);
          toastify(
            "success",
            "Value matching initialized and ground truth applied."
          );
        },
        onError: (error) => {
          console.error("Matching task failed with error:", error);
          toastify("error", "Matching task failed with error: " + error);
        },
        taskStateCallback: (taskState) => {
          setTaskStateFor("matching", taskState);
        },
        onSourceOntologyReady: (sourceOntology) => {
          sourceOntologyCallback(sourceOntology);
        },
        sourceOntologyTaskStateCallback: (taskState) => {
          setTaskStateFor("source", taskState);
        },
        onTargetOntologyReady: (targetOntology) => {
          ontologyCallback(targetOntology);
        },
        targetOntologyTaskStateCallback: (taskState) => {
          setTaskStateFor("target", taskState);
        },
      });
    } catch (error) {
      console.error(error);
      toastify("error", "Internal error: " + error);
    }
  };

  return (
    <>
      {isVisible && (
        <ValueMatchingUploadForm
          onSubmit={handleOnSubmit}
          onCancel={() => setIsVisible(false)}
        />
      )}
      <ValueMatchingUploadButton onClick={() => setIsVisible(true)} />
    </>
  );
};

const ValueMatchingUploadForm: React.FC<{
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}> = ({ onSubmit, onCancel }) => (
  <Paper
    sx={{
      p: 3,
      position: "fixed",
      zIndex: 1300,
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(1000px, 92vw)",
      maxHeight: "85vh",
      overflowY: "auto",
    }}
  >
    <IconButton
      aria-label="Close"
      onClick={onCancel}
      size="small"
      sx={{ position: "absolute", top: 8, right: 8 }}
    >
      <CloseIcon fontSize="small" />
    </IconButton>
    <form encType="multipart/form-data" onSubmit={onSubmit}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Upload files for value matching (with ground truth)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Provide your source dataset, optional target reference, and a ground
          truth CSV. You can upload either: 1) 2 columns [source_attribute,
          target_attribute] to assert column mappings, or 2) 4 columns
          [source_attribute, target_attribute, source_value, target_value] to
          assert value mappings. When provided, the system skips automated
          schema/value matching and uses your ground truth.
        </Typography>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            A. Source CSV File{" "}
            <Chip size="small" color="error" label="Required" sx={{ ml: 1 }} />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Upload a .csv file containing your source dataset.
          </Typography>
          <Dropzone
            required
            name="source-csv"
            label="Source CSV"
            fileKind="csv"
          />
        </Box>

        <Divider />

        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            B. Target CSV File{" "}
            <Chip size="small" label="Optional" sx={{ ml: 1 }} />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            If omitted, the system will default to the GDC v3.3.0 schema.
          </Typography>
          <Dropzone name="target-csv" label="Target CSV" fileKind="csv" />
        </Box>

        <Divider />

        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            C. Ground Truth Mapping CSV{" "}
            <Chip size="small" color="error" label="Required" sx={{ ml: 1 }} />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Supported formats: - 2 columns: source_attribute, target_attribute -
            4 columns: source_attribute, target_attribute, source_value,
            target_value
          </Typography>
          <Dropzone
            required
            name="groundtruth-csv"
            label="Ground Truth CSV"
            fileKind="csv"
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 1 }}
          >
            Example format:
          </Typography>
          <Table size="small" sx={{ mt: 0.5 }}>
            <TableHead>
              <TableRow>
                <TableCell>source_attribute</TableCell>
                <TableCell>target_attribute</TableCell>
                <TableCell>source_value</TableCell>
                <TableCell>target_value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>sex</TableCell>
                <TableCell>gender</TableCell>
                <TableCell>F</TableCell>
                <TableCell>female</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Ethnicity_Self_Identify</TableCell>
                <TableCell>race</TableCell>
                <TableCell>White</TableCell>
                <TableCell>white</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      </Stack>

      <Alert severity="info" sx={{ mt: 2 }}>
        The ground truth will be applied by appending missing candidates and
        accepting the mapped pairs.
      </Alert>

      <Box
        sx={{ display: "flex", gap: 1.5, mt: 2, justifyContent: "flex-end" }}
      >
        <BasicButton variant="outlined" color="info" onClick={onCancel}>
          Close
        </BasicButton>
        <BasicButton variant="contained" color="primary" type="submit">
          Start Value Matching
        </BasicButton>
      </Box>
    </form>
  </Paper>
);

const ValueMatchingUploadButton: React.FC<{ onClick: () => void }> = ({
  onClick,
}) => (
  <IconButton
    color="secondary"
    onClick={onClick}
    sx={{
      borderRadius: 1,
      py: 0,
      px: 0,
      "&:hover": { color: "secondary.dark" },
    }}
    title="Value matching with ground truth"
  >
    <PostAddIcon />
  </IconButton>
);

export default ValueMatchingUploading;
