


import { useState, useMemo } from 'react';
import MatcherCard from './matcherCard';

import { toastify } from '@/app/lib/toastify/toastify-helper';
import { List, Stack } from '@mui/material';
import { SectionHeader } from '../../layout/components';

interface MatcherViewProps {
    matcherAnalysis: MatcherAnalysis[];
}

const MatcherView = ({ matcherAnalysis }: MatcherViewProps) => {

    // Sort the matcherAnalysis by mrr+f1+recall in descending order
    const sortedMatcherAnalysis = useMemo(() => {
        return matcherAnalysis.sort((a, b) => {
            return (b.mrr + b.f1Score + b.recallGt) - (a.mrr + a.f1Score + a.recallGt);
        });
    }, [matcherAnalysis]);

    const matcherList = useMemo(() => {
        if (sortedMatcherAnalysis.length === 0) return null;

        return (
            <List sx={{ margin: 0.5, zIndex: 1 }}>
                {sortedMatcherAnalysis.map(analysis => (
                    <MatcherCard
                        key={analysis.name}
                        matcher={analysis}
                    />
                ))}
            </List>
        )
    }, [sortedMatcherAnalysis]);

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

