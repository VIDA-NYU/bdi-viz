"use client";

import { useContext, useState } from "react";
import { runMatchingTask, getCachedResults, getTargetOntology, getValueBins, getValueMatches, getSourceOntology } from "@/app/lib/heatmap/heatmap-helper";

import { Box, Paper, IconButton, Typography, Divider, Chip, Stack, Table, TableHead, TableRow, TableCell, TableBody, Alert } from "@mui/material";
import { BasicButton } from "../layout/components";
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloseIcon from '@mui/icons-material/Close';

import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import { Dropzone } from "./file-upload/fileUploadBox";
import { toastify } from "@/app/lib/toastify/toastify-helper";

interface FileUploadingProps {
    callback: (candidates: Candidate[]) => void;
    ontologyCallback: (targetOntology: Ontology[]) => void;
    sourceOntologyCallback: (sourceOntology: Ontology[]) => void;
    uniqueValuesCallback: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
}

const FileUploading: React.FC<FileUploadingProps> = ({
    callback,
    ontologyCallback,
    sourceOntologyCallback,
    uniqueValuesCallback,
    valueMatchesCallback,
}) => {
    const { setIsLoadingGlobal, setTaskStateFor } = useContext(SettingsGlobalContext);
    const [isVisible, setIsVisible] = useState(false);

    const readFileAsync = (file: File | null): Promise<string | null> => {
        return new Promise((resolve) => {
            if (!file) {
                resolve(null);
                return;
            }
            const reader = new FileReader();
            reader.onloadend = (e) => {
                resolve(e.target?.result as string | null);
            };
            reader.readAsText(file);
        });
    };

    const handleOnSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        const sourceFile = formData.get("source-csv") as File | null;
        const targetCsvFile = formData.get("target-csv") as File | null;
        const targetJsonFile = formData.get("target-json") as File | null;

        if (!sourceFile) {
            console.error("Source CSV file is required.");
            return;
        }

        const uploadData = new FormData();
        uploadData.append("type", "csv_input");

        try {
            // Initialize a local 'matching' task state so the global overlay is driven by taskStates,
            // and will reliably clear even if the backend returns cached results without spawning tasks.
            setTaskStateFor('matching', {
                status: 'started',
                progress: 0,
                current_step: 'Preparing...',
                completed_steps: 0,
                total_steps: 1,
                logs: [],
            } as TaskState);

            const [sourceCsv, targetCsv, targetJson] = await Promise.all([
                readFileAsync(sourceFile),
                readFileAsync(targetCsvFile),
                readFileAsync(targetJsonFile),
            ]);

            if (sourceCsv) {
                uploadData.append("source_csv", sourceCsv);
                if (sourceFile?.name) uploadData.append("source_csv_name", sourceFile.name);
                // Filesize in KB
                if (sourceFile.size) uploadData.append("source_csv_size", `${(sourceFile.size / 1024).toFixed(2)} KB`);
                // Add a timestamp
                uploadData.append("source_csv_timestamp", new Date().toISOString());
            }
            if (targetCsv) {
                uploadData.append("target_csv", targetCsv);
                if (targetCsvFile?.name) uploadData.append("target_csv_name", targetCsvFile.name);
                // Filesize in KB
                if (targetCsvFile?.size) uploadData.append("target_csv_size", `${(targetCsvFile.size / 1024).toFixed(2)} KB`);
                // Add a timestamp
                uploadData.append("target_csv_timestamp", new Date().toISOString());
            }

            runMatchingTask({
                uploadData,
                onResult: (result) => {
                    console.log("Matching task completed with result:", result);
                    getCachedResults({ callback });
                    getTargetOntology({ callback: ontologyCallback });
                    getValueBins({ callback: uniqueValuesCallback });
                    getValueMatches({ callback: valueMatchesCallback });
                    // Mark the local 'matching' task complete to clear the overlay if no other tasks are active
                    setTaskStateFor('matching', {
                        status: 'success',
                        progress: 100,
                        current_step: 'Done',
                        completed_steps: 1,
                        total_steps: 1,
                        logs: [],
                    } as TaskState);
                },
                onError: (error) => {
                    console.error("Matching task failed with error:", error);
                    toastify("error", "Matching task failed with error: " + error);
                },
                taskStateCallback: (taskState) => {
                    console.log("Task state:", taskState);
                    setTaskStateFor('matching', taskState);
                },
                onSourceOntologyReady: (sourceOntology) => {
                    console.log("Source ontology task completed.");
                    sourceOntologyCallback(sourceOntology);
                },
                sourceOntologyTaskStateCallback: (taskState) => {
                    setTaskStateFor('source', taskState);
                },
                onTargetOntologyReady: (targetOntology) => {
                    console.log("Target ontology available.");
                    ontologyCallback(targetOntology);
                },
                targetOntologyTaskStateCallback: (taskState) => {
                    setTaskStateFor('target', taskState);
                }
            });
        } catch (error) {
            console.error(error);
            toastify("error", "Internal error: " + error);
        }
    };

    return (
        <>
            {isVisible ? (
                <FileUploadForm
                    onSubmit={handleOnSubmit}
                    onCancel={() => setIsVisible(false)}
                />
            ) : (
                <UploadButton onClick={() => setIsVisible(true)} />
            )}
        </>
    );
};

const FileUploadForm: React.FC<{
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
}> = ({ onSubmit, onCancel }) => (
    <Paper
        sx={{
            p: 3,
            position: 'fixed',
            zIndex: 1300,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(1000px, 92vw)',
            maxHeight: '85vh',
            overflowY: 'auto'
        }}
    >
        <IconButton
            aria-label="Close"
            onClick={onCancel}
            size="small"
            sx={{ position: 'absolute', top: 8, right: 8 }}
        >
            <CloseIcon fontSize="small" />
        </IconButton>
        <form encType="multipart/form-data" onSubmit={onSubmit}>
            <Box sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Upload files for schema matching</Typography>
                <Typography variant="body2" color="text.secondary">
                    Provide your source dataset and optional target references. If you omit optional files, defaults to the GDC v3.3.0 schema.
                </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Stack spacing={2}>
                <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        A. Source CSV File <Chip size="small" color="error" label="Required" sx={{ ml: 1 }} />
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Upload a .csv file containing your unstructured or raw biomedical dataset. This serves as the basis for matching.
                    </Typography>
                    <Dropzone required name="source-csv" label="Source CSV" fileKind="csv" />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Example format:</Typography>
                    <Table size="small" sx={{ mt: 0.5 }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Case_ID</TableCell>
                                <TableCell>Gender</TableCell>
                                <TableCell>Ethnicity_Self_Identify</TableCell>
                                <TableCell>Path_Stage_Reg_Lymph_Nodes_pN</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            <TableRow>
                                <TableCell>C1234</TableCell>
                                <TableCell>Male</TableCell>
                                <TableCell>Asian</TableCell>
                                <TableCell>pN1</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>C5678</TableCell>
                                <TableCell>Female</TableCell>
                                <TableCell>White</TableCell>
                                <TableCell>pN2</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>C1111</TableCell>
                                <TableCell>Unknown</TableCell>
                                <TableCell>Unknown</TableCell>
                                <TableCell>pNX</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Box>

                <Divider />

                <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        B. Target CSV File <Chip size="small" label="Optional" sx={{ ml: 1 }} />
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        If omitted, the system will default to the GDC v3.3.0 schema. Upload a .csv file that reflects the reference or gold-standard biomedical dataset (e.g., GDC, PDC).
                    </Typography>
                    <Dropzone name="target-csv" label="Target CSV" fileKind="csv" />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Example format:</Typography>
                    <Table size="small" sx={{ mt: 0.5 }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>submitter_id</TableCell>
                                <TableCell>gender</TableCell>
                                <TableCell>race</TableCell>
                                <TableCell>ajcc_pathologic_n</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            <TableRow>
                                <TableCell>T001</TableCell>
                                <TableCell>Male</TableCell>
                                <TableCell>Asian</TableCell>
                                <TableCell>N1</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>T002</TableCell>
                                <TableCell>Female</TableCell>
                                <TableCell>White</TableCell>
                                <TableCell>N2</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Box>

                <Divider />

                <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        C. Target Schema JSON File <Chip size="small" label="Optional" sx={{ ml: 1 }} />
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        If omitted, the system will use the GDC v3.3.0 schema definition. Upload a .json file that defines metadata and attributes for the target schema.
                    </Typography>
                    <Dropzone name="target-json" label="Target Schema JSON" fileKind="json" />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Example snippet:</Typography>
                    <Box component="pre" sx={{
                        mt: 0.5,
                        bgcolor: 'grey.100',
                        p: 1.5,
                        borderRadius: 1,
                        overflowX: 'auto',
                        fontSize: '0.75rem'
                    }}>{`{
  "age_at_index": {
    "column_name": "age_at_index",
    "category": "clinical",
    "node": "demographic",
    "type": "integer",
    "description": "The patient's age (in years) on the reference or anchor date used during date obfuscation.",
    "minimum": 0
  },
  "education_level": {
    "column_name": "education_level",
    "category": "clinical",
    "node": "demographic",
    "type": "enum",
    "description": "The years of schooling completed in graded public, private, or parochial schools, and in colleges, universities, or professional schools.",
    "enum": [
      "College Degree",
      "High School Graduate or GED",
      "Professional or Graduate Degree",
      "Some High School or Less",
      "Vocational College or Some College",
      "Unknown",
      "Not Reported"
    ]
  }
}`}</Box>
                </Box>
            </Stack>

            <Alert severity="info" sx={{ mt: 2 }}>
                Tip: You can start with just the Source CSV. The system will infer the rest using the default GDC schema.
            </Alert>

            <Box sx={{ display: "flex", gap: 1.5, mt: 2, justifyContent: 'flex-end' }}>
                <BasicButton variant="outlined" color="info" onClick={onCancel}>
                    Close
                </BasicButton>
                <BasicButton variant="contained" color="primary" type="submit">
                    Start Matching
                </BasicButton>
            </Box>
        </form>
    </Paper>
);

const UploadButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <IconButton
        color="primary"
        onClick={onClick}
        sx={{
            borderRadius: 1,
            py: 0,
            px: 0,
            '&:hover': { color: 'primary.dark' },
        }}
        title="New matching task"
    >
        <UploadFileIcon />
    </IconButton>
);

export default FileUploading;
