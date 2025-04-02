import React, {useRef} from 'react';
import {useDropzone} from 'react-dropzone';
import {Box, Typography, List, ListItem, ListItemText, Paper} from '@mui/material';
import { SectionLabel } from '../../layout/components';

interface DropzoneProps {
    required?: boolean;
    name: string;
}

export function Dropzone(props: DropzoneProps) {
    const {required, name} = props; 

    const hiddenInputRef = useRef<HTMLInputElement>(null);

    const {getRootProps, getInputProps, open, acceptedFiles, isDragActive} = useDropzone({
        onDrop: (incomingFiles: File[]) => {
            if (hiddenInputRef.current) {
                const dataTransfer = new DataTransfer();
                incomingFiles.forEach((v) => {
                    dataTransfer.items.add(v);
                });
                hiddenInputRef.current.files = dataTransfer.files;
            }
        },
        accept: {
            'text/csv': ['.csv']
        },
        maxFiles: 1
    });

    const files = acceptedFiles.map(file => (
        <ListItem key={file.path}>
            <ListItemText primary={file.path} secondary={`${file.size} bytes`} />
        </ListItem>
    ));

    return (
        <Box>
            <Box 
                {...getRootProps({className: 'dropzone'})} 
                sx={{ 
                    p: 2, 
                    textAlign: 'center', 
                    cursor: 'pointer', 
                    border: '4px dashed #ccc', 
                    transition: 'border-color 0.3s ease-in-out',
                    ...(isDragActive && {
                        borderColor: '#000',
                        animation: 'pulse 1s infinite'
                    }),
                    '@keyframes pulse': {
                        '0%': { borderColor: '#000' },
                        '50%': { borderColor: '#ccc' },
                        '100%': { borderColor: '#000' }
                    }
                }}
            >
                <input type="file" name={name} required={required} style={{ display: 'none' }} ref={hiddenInputRef} accept=".csv"/>
                <input {...getInputProps()} />
                <Typography variant="body1" sx={{
                    fontSize: '0.9rem',
                    fontWeight: '800',
                    color: '#bbb'
                }}>Drag &apos;n&apos; drop a CSV file here</Typography>
            </Box>
            <Box sx={{ mt: 1 }}>
                <SectionLabel>{name}</SectionLabel>
                <List>{files}</List>
            </Box>
        </Box>
    );
}
