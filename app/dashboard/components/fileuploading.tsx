"use client";

import { useContext, useState } from "react";
import { runMatchingTask, getCachedResults, getTargetOntology, getValueBins, getValueMatches } from "@/app/lib/heatmap/heatmap-helper";

import { Box, Paper, IconButton } from "@mui/material";
import { BasicButton } from "../layout/components";
import UploadFileIcon from '@mui/icons-material/UploadFile';

import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import { Dropzone } from "./file-upload/fileUploadBox";

interface FileUploadingProps {
    callback: (candidates: Candidate[], sourceCluster: SourceCluster[]) => void;
    ontologyCallback: (targetOntology: TargetOntology[]) => void;
    uniqueValuesCallback: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
}

const FileUploading: React.FC<FileUploadingProps> = ({
    callback,
    ontologyCallback,
    uniqueValuesCallback,
    valueMatchesCallback,
}) => {
    const { setIsLoadingGlobal, setTaskState } = useContext(SettingsGlobalContext);
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
            setIsLoadingGlobal(true);

            const [sourceCsv, targetCsv, targetJson] = await Promise.all([
                readFileAsync(sourceFile),
                readFileAsync(targetCsvFile),
                readFileAsync(targetJsonFile),
            ]);

            if (sourceCsv) uploadData.append("source_csv", sourceCsv);
            if (targetCsv) uploadData.append("target_csv", targetCsv);
            if (targetJson) uploadData.append("target_json", targetJson);

            // Add keep alive agents for long-running requests
            // const httpAgent = new http.Agent({ keepAlive: true });
            // const httpsAgent = new https.Agent({ keepAlive: true });
            runMatchingTask({
                uploadData,
                onResult: (result) => {
                    console.log("Matching task completed with result:", result);
                    getCachedResults({ callback });
                    getTargetOntology({ callback: ontologyCallback });
                    getValueBins({ callback: uniqueValuesCallback });
                    getValueMatches({ callback: valueMatchesCallback });
                    setIsLoadingGlobal(false);
                },
                onError: (error) => {
                    console.error("Matching task failed with error:", error);
                    setIsLoadingGlobal(false);
                },
                taskStateCallback: (taskState) => {
                    console.log("Task state:", taskState);
                    setTaskState(taskState);
                }
            });
        } catch (error) {
            console.error(error);
            setIsLoadingGlobal(false);
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
            p: 2,
            position: 'fixed',
            zIndex: 1300,
            left: '10px',
            top: '10px',
        }}
    >
        <form encType="multipart/form-data" onSubmit={onSubmit}>
            <Dropzone required name="source-csv" />
            <Dropzone name="target-csv" />
            <Dropzone name="target-json" />
            <Box sx={{ display: "flex", gap: 1 }}>
                <BasicButton variant="contained" color="primary" type="submit">
                    Import CSV
                </BasicButton>
                <BasicButton variant="outlined" color="info" onClick={onCancel}>
                    Cancel
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
