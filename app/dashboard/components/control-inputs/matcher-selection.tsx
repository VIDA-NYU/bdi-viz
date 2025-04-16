'use client';

import { useState, useEffect } from 'react';
import { Box, FormControl, Stack, Slider, Typography } from '@mui/material';
import { SectionLabel } from '../../layout/components';

interface Matcher {
    name: string;
    weight: number;
}

interface MatcherSelectionProps {
    matchers: Matcher[];
    onSlide: (matchers: Matcher[]) => void;
}

const MatcherSliders: React.FC<MatcherSelectionProps> = ({ matchers, onSlide }) => {
    const [sliderValues, setSliderValues] = useState<number[]>(matchers.map(matcher => matcher.weight));

    useEffect(() => {
        setSliderValues(matchers.map(matcher => matcher.weight));
    }, [matchers]);

    const handleSliderChange = (index: number, value: number | number[]) => {
        const newValue = value as number;
        const oldValue = sliderValues[index];
        const diff = newValue - oldValue;
        
        // Calculate remaining weight to distribute
        const remainingIndices = [...Array(sliderValues.length).keys()].filter(i => i !== index);
        const totalRemainingWeight = remainingIndices.reduce((sum, i) => sum + sliderValues[i], 0);
        
        // Create new values array with proportional distribution
        const newValues = [...sliderValues];
        newValues[index] = newValue;
        
        if (totalRemainingWeight > 0) {
            remainingIndices.forEach(i => {
                const proportion = sliderValues[i] / totalRemainingWeight;
                newValues[i] = Math.max(0, Math.min(1, sliderValues[i] - (diff * proportion)));
            });
        }
        
        // Normalize to ensure sum is exactly 1
        const sum = newValues.reduce((a, b) => a + b, 0);
        
        // Guard against division by zero or invalid sums
        if (sum <= 0 || !Number.isFinite(sum)) {
            // Reset to equal distribution
            const equalWeight = 1 / newValues.length;
            const resetValues = newValues.map(() => equalWeight);
            setSliderValues(resetValues);
            const resetMatchers = matchers.map((matcher, i) => ({
                name: matcher.name,
                weight: resetValues[i]
            }));
            onSlide(resetMatchers);
            return;
        }
        
        const normalizedValues = newValues.map(v => v / sum);
        
        setSliderValues(normalizedValues);
        const newMatchers = matchers.map((matcher, i) => ({
            name: matcher.name,
            weight: normalizedValues[i]
        }));
        onSlide(newMatchers);
    };

    return (
        <Box sx={{ minWidth: 120, flexGrow: 1 }}>
            <FormControl fullWidth>
                <SectionLabel id="matcher-weights-label" sx={{ marginBottom: 0.5 }}>
                    Matcher Weights
                </SectionLabel>
                {matchers.map((matcher, index) => (
                    <Box key={index} sx={{ mt: 1 }}>
                        <Stack 
                            spacing={2} 
                            direction="row" 
                            alignItems="center"
                            sx={{ width: '100%' }}
                        >
                            <Typography 
                                sx={{ 
                                    fontSize: '0.75rem',
                                    width: '120px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    color: 'text.secondary'
                                }}
                            >
                                {matcher.name}
                            </Typography>
                            <Slider
                                value={sliderValues[index]}
                                onChange={(e, value) => handleSliderChange(index, value)}
                                aria-labelledby="matcher-weights-label"
                                valueLabelDisplay="auto"
                                step={0.01}
                                min={0}
                                max={1}
                                sx={{
                                    padding: 0,
                                    margin: 0,
                                    flexGrow: 1,
                                    '& .MuiSlider-markLabel': {
                                        fontSize: '0.75rem'
                                    }
                                }}
                            />
                            <Typography 
                                sx={{ 
                                    fontSize: '0.75rem',
                                    width: '40px',
                                    textAlign: 'right'
                                }}
                            >
                                {sliderValues[index]?.toFixed(2) ?? 0}
                            </Typography>
                        </Stack>
                    </Box>
                ))}
            </FormControl>
        </Box>
    );
}

export default MatcherSliders;
