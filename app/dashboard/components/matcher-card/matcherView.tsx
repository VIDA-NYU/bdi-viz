


import { useState, useMemo } from 'react';
import MatcherCard from './matcherCard';

import { toastify } from '@/app/lib/toastify/toastify-helper';
import { List, Stack } from '@mui/material';
import { SectionHeader } from '../../layout/components';

interface MatcherViewProps {
    matcherAnalysis: MatcherAnalysis[];
}

const MatcherView = ({ matcherAnalysis }: MatcherViewProps) => {

    const matcherList = useMemo(() => {
        if (matcherAnalysis.length === 0) return null;

        return (
            <List sx={{ margin: 0.5, zIndex: 1 }}>
                {matcherAnalysis.map(analysis => (
                    <MatcherCard
                        key={analysis.name}
                        matcher={analysis}
                    />
                ))}
            </List>
        )
    }, [matcherAnalysis]);

    return (
        <Stack spacing={0}>
            <SectionHeader>
                Matcher Analytics
            </SectionHeader>
            {matcherList}
        </Stack>
    );
};

export default MatcherView;

