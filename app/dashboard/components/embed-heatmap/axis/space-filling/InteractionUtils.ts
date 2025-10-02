import {BaseType, Selection} from 'd3';
import { Theme } from '@mui/material';

export function applyHighlightStyleOnEdge(selection: Selection<BaseType, unknown, null, undefined>) {
    return selection.attr('stroke-width', 1.5)
            .attr('stroke-opacity', 1)
            .attr('stroke-dasharray', '3,3'); 
}

export function applyBackgroundStyleOnEdge(selection: Selection<BaseType, unknown, null, undefined>) {
    return selection.attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.2)
    .attr('stroke-dasharray', '3,3');
}

export function applyDefaultStyleOnEdge(selection: Selection<BaseType, unknown, null, undefined>) {
    return selection.attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.7)
    .attr('stroke-dasharray', '3,3'); 
}

export function applyDefaultStyleOnColumn(selection: Selection<BaseType, unknown, null, undefined>) {
    return selection.attr('opacity', 1)
    .select('rect')
    .attr('stroke-width', 1); 
}

export function applyHighlightStyleOnColumn(selection: Selection<BaseType, unknown, null, undefined>) {
    return selection.attr('opacity', 1)
    .select('rect')
    .attr('stroke-width', 2); 
}

export function applyBackgroundStyleOnColumn(selection: Selection<BaseType, unknown, null, undefined>) {
    return selection.attr('opacity', 0.2)
    .select('rect')
    .attr('stroke-width', 1); 
}

export function applyDefaultStyleOnNode(selection: Selection<BaseType, unknown, null, undefined>, theme: Theme) {
    return selection.attr('opacity', 1)
        .select('rect')
        .attr('stroke-opacity', 1)
        .attr('stroke', theme.palette.text.primary)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '0');
}

export function applyHighlightStyleOnNode(selection: Selection<BaseType, unknown, null, undefined>, theme: Theme) {
    return selection.attr('opacity', 1)
        .select('rect')
        .attr('stroke', theme.palette.primary.main)
        .attr('stroke-width', 3)
        .attr('stroke-opacity', 1)
        .attr('stroke-dasharray', '0');
}

export function applyBackgroundStyleOnNode(selection: Selection<BaseType, unknown, null, undefined>, theme: Theme) {
    return selection.attr('opacity', 0.2)
        .select('rect')
        .attr('stroke', theme.palette.text.primary)
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.2)
        .attr('stroke-dasharray', '3,3');
}

export function applyBackgroundStyleOnCategory(selection: Selection<BaseType, unknown, null, undefined>, theme: Theme) {
    return selection.attr('opacity', 0.2)
        .select('rect')
        .attr('stroke', theme.palette.text.primary)
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.2)
}

export function applyHighlightStyleOnCategory(selection: Selection<BaseType, unknown, null, undefined>, theme: Theme) {
    return selection.attr('opacity', 1)
        .select('rect')
        .attr('stroke', theme.palette.primary.main)
        .attr('stroke-width', 3)
        .attr('stroke-opacity', 1)
        .attr('stroke-dasharray', '0');
}

export function applyDefaultStyleOnCategory(selection: Selection<BaseType, unknown, null, undefined>, theme: Theme) {
    return selection.attr('opacity', 1)
        .select('rect')
        .attr('stroke', theme.palette.text.primary)
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 1)
}