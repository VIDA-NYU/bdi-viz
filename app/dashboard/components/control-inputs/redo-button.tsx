'use client';

import { IconButton } from '@mui/material';
import ReplayIcon from '@mui/icons-material/Replay';

interface RedoButtonProps {
    onClick: () => void;
}

const RedoButton: React.FC<RedoButtonProps> = ({ onClick }) => {
    return (
            <IconButton
                onClick={onClick}
                sx={{
                    px: 0,
                    py: 0,
                    borderRadius: 1,
                    color: 'grey.800',
                    '&:hover': { color: 'primary.dark' },
                    transform: 'scaleX(-1)'
                }}
                title="Redo"
            >
                <ReplayIcon />
            </IconButton>
    );
}

export default RedoButton;