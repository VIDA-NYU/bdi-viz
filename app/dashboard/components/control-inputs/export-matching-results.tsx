'use client';
import React from 'react';
import { IconButton, Menu, MenuItem } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';

interface ExportMatchingResultsButtonProps {
    onClick: (format: string) => void;
}

const ExportMatchingResultsButton: React.FC<ExportMatchingResultsButtonProps> = ({ onClick }) => {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleExport = (format: 'csv' | 'json' | 'mapping_csv_4col') => {
        handleClose();
        onClick(format);
    };

    return (
        <>
            <IconButton
                onClick={handleClick}
                sx={{
                    py: 0,
                    px: 0,
                    borderRadius: 1,
                    color: 'primary.main',
                    '&:hover': { color: 'primary.dark' },
                }}
                title="Export matching results"
            >
                <FileDownloadOutlinedIcon />
            </IconButton>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
            >
                <MenuItem onClick={() => handleExport('csv')}>Export curated dataset (CSV)</MenuItem>
                <MenuItem onClick={() => handleExport('json')}>Export mappings (JSON)</MenuItem>
                <MenuItem onClick={() => handleExport('mapping_csv_4col')}>Export mappings (CSV 4-column)</MenuItem>
            </Menu>
        </>
    );
}

export default ExportMatchingResultsButton;