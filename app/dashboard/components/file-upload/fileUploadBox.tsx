import React, {useRef} from 'react';
import {useDropzone, type Accept} from 'react-dropzone';
import {Box, Typography, List, ListItem, ListItemText, Chip, Stack} from '@mui/material';
import { SectionLabel } from '../../layout/components';

interface DropzoneProps {
    required?: boolean;
    name: string;
    label: string;
    fileKind: 'csv' | 'json';
}

export function Dropzone(props: DropzoneProps) {
    const {required, name, label, fileKind} = props; 

    const hiddenInputRef = useRef<HTMLInputElement>(null);

    const accept: Accept = fileKind === 'csv'
        ? { 'text/csv': ['.csv'] as const }
        : { 'application/json': ['.json'] as const };

    const {getRootProps, getInputProps, acceptedFiles, isDragActive} = useDropzone({
        onDrop: (incomingFiles: File[]) => {
            if (hiddenInputRef.current) {
                const dataTransfer = new DataTransfer();
                incomingFiles.forEach((v) => {
                    dataTransfer.items.add(v);
                });
                hiddenInputRef.current.files = dataTransfer.files;
            }
        },
        accept,
        maxFiles: 1
    });

    const files = acceptedFiles.map(file => (
        <ListItem key={file.path}>
            <ListItemText primary={file.path} secondary={`${file.size} bytes`} />
        </ListItem>
    ));

    return (
        <Box>
            <SectionLabel>{label}</SectionLabel>
            <Box 
                {...getRootProps({className: 'dropzone'})} 
                sx={{ 
                    p: 2, 
                    textAlign: 'center', 
                    cursor: 'pointer', 
                    border: '2px dashed',
                    borderColor: isDragActive ? 'primary.main' : '#ccc',
                    borderRadius: 1,
                    bgcolor: isDragActive ? 'action.hover' : 'background.paper',
                    transition: 'border-color 0.2s ease-in-out, background-color 0.2s ease-in-out'
                }}
            >
                <input
                    type="file"
                    name={name}
                    required={required}
                    style={{ display: 'none' }}
                    ref={hiddenInputRef}
                    accept={fileKind === 'csv' ? '.csv' : '.json'}
                />
                <input {...getInputProps()} />
                <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
                    <Typography variant="body1" sx={{ fontSize: '0.95rem', fontWeight: 600 }}>
                        Drag & drop or click to select
                    </Typography>
                    <Chip size="small" label={fileKind === 'csv' ? '.csv only' : '.json only'} variant="outlined" />
                </Stack>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
                    Max 1 file. This field is {required ? 'required' : 'optional'}.
                </Typography>
            </Box>
            <Box sx={{ mt: 1 }}>
                <List>{files}</List>
            </Box>
        </Box>
    );
}
