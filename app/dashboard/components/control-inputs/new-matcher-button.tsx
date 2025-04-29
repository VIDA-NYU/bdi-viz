'use client';
import React from 'react';
import { IconButton } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

interface NewMatcherButtonProps {
    onClick: () => void;
}

const NewMatcherButton: React.FC<NewMatcherButtonProps> = ({ onClick }) => {
    return (
            <IconButton
                onClick={onClick}
                sx={{
                    px: 0,
                    py: 0,
                    borderRadius: 1,
                    color: 'primary.main',
                    '&:hover': { color: 'primary.dark' },
                    transform: 'scaleX(-1)'
                }}
                title="New Matcher"
            >
                <AddCircleOutlineIcon />
            </IconButton>
    );
}

export default NewMatcherButton;