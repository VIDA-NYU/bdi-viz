"use client";

import { useContext, useState } from "react";
import axios from "axios";
import { getCachedResults } from "@/app/lib/heatmap/heatmap-helper";

import { Box, Paper, IconButton } from "@mui/material";
import { BasicButton } from "../layout/components";
import UploadFileIcon from '@mui/icons-material/UploadFile';

import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import { Dropzone } from "./file-upload/fileUploadBox";

interface FileUploadingProps {
    callback: (candidates: Candidate[], sourceCluster: SourceCluster[]) => void;
}

const FileUploading: React.FC<FileUploadingProps> = ({ callback }) => {
    const { setIsLoadingGlobal } = useContext(SettingsGlobalContext);
    const [isVisible, setIsVisible] = useState(false);

    const customHeader = {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    };

    const handleFileRead = (file: File | null, onLoadCallback: (result: string) => void) => {
        if (file) {
            const reader = new FileReader();
            reader.onloadend = (e) => {
                if (e.target?.result) {
                    onLoadCallback(e.target.result as string);
                }
            };
            reader.readAsText(file);
        }
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

        handleFileRead(sourceFile, (sourceCsv) => {
            uploadData.append("source_csv", sourceCsv);

            handleFileRead(targetCsvFile, (targetCsv) => {
                uploadData.append("target_csv", targetCsv);
            });

            handleFileRead(targetJsonFile, (targetJson) => {
                uploadData.append("target_json", targetJson);
            });

            setIsLoadingGlobal(true);
            axios.post("/api/matching", uploadData, { ...customHeader, timeout: 600000 })
                .then((response) => {
                    if (response.status === 200) {
                        getCachedResults({ callback });
                    }
                })
                .catch(console.error)
                .finally(() => setIsLoadingGlobal(false));
        });
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
