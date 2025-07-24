'use client';

import { Box, IconButton } from '@mui/material';
import { BasicButton } from '../../layout/components';
import DownloadIcon from '@mui/icons-material/Download';

interface ExportHistoryButtonProps {
    onClick: () => void;
}

const ExportHistoryButton: React.FC<ExportHistoryButtonProps> = ({ onClick }) => {
    return (
        <IconButton
            onClick={onClick}
            sx={{
                px: 0,
                py: 0,
                borderRadius: 1,
                color: 'primary.main',
                '&:hover': { color: 'primary.dark' }
            }}
            title="Export History"
        >
            <DownloadIcon />
        </IconButton>
    );
}

export default ExportHistoryButton;