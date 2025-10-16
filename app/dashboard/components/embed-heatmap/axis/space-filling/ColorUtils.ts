import * as d3 from 'd3';
import { NodeData } from './HierarchyUtils';

/**
 * Color utility functions for data visualization
 */

/**
 * Color palettes optimized for data visualization with good separation
 * Each palette is designed to be perceptually distinct and colorblind-friendly
 */
export const COLOR_PALETTES = {
  // Categorical palette with high distinguishability (based on ColorBrewer's qualitative palettes)
  categorical: [
    '#1f77b4', // blue
    '#ff7f0e', // orange
    '#2ca02c', // green
    '#d62728', // red
    '#9467bd', // purple
    '#8c564b', // brown
    '#e377c2', // pink
    '#7f7f7f', // gray
    '#bcbd22', // olive
    '#17becf'  // cyan
  ],
  
  // For 5-8 categories (Tableau 10 inspired)
  tableau: [
    '#4e79a7', // blue
    '#f28e2c', // orange
    '#e15759', // red
    '#76b7b2', // teal
    '#59a14f', // green
    '#edc949', // yellow
    '#af7aa1', // purple
    '#ff9da7', // pink
    '#9c755f', // brown
    '#bab0ab'  // gray
  ],
  
  // Colorblind-friendly palette (Okabe-Ito)
  colorblindFriendly: [
    '#0072B2', // blue
    '#E69F00', // orange
    '#009E73', // green
    '#CC79A7', // pink
    '#56B4E9', // light blue
    '#D55E00', // red
    '#F0E442', // yellow
    '#999999'  // gray
  ],
  
  // For visualizations with sequential data
  sequential: d3.schemeBlues[9],
  
  // Diverging palette for values that go in two directions from a midpoint
  diverging: d3.schemeRdBu[11]
};

/**
 * Returns a categorical color scale for a set of categories
 * 
 * @param categories Array of category identifiers
 * @param paletteType Type of palette to use (categorical, tableau, colorblindFriendly)
 * @returns Function that maps a category ID to a color
 */
export function getCategoryColorScale(
  categories: string[],
  paletteType: 'categorical' | 'tableau' | 'colorblindFriendly' = 'categorical'
): (id: string) => string {
  const palette = COLOR_PALETTES[paletteType];
  
  // Create a mapping function
  return (id: string): string => {
    // Find index of category in the array
    const index = categories.indexOf(id);
    
    if (index === -1) {
      // If category not found, use a hash function to assign a color
      const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return palette[hash % palette.length];
    }
    
    // Use modulo to handle more categories than colors
    return palette[index % palette.length];
  };
}

/**
 * Generates a color scale with custom saturation and brightness
 * to create visually distinct but harmonious colors
 * 
 * @param numCategories Number of distinct categories
 * @param saturation Saturation value (0-1)
 * @param brightness Brightness value (0-1)
 * @returns Array of colors in hex format
 */
export function generateCustomPalette(
  numCategories: number,
  saturation: number = 0.7,
  brightness: number = 0.8
): string[] {
  const colors: string[] = [];
  
  // Generate colors evenly spaced around the color wheel
  for (let i = 0; i < numCategories; i++) {
    const hue = (i * 360 / numCategories) % 360;
    
    // Convert HSV to RGB (simplified algorithm)
    let r, g, b;
    
    const h = hue / 60;
    const s = saturation;
    const v = brightness;
    
    const i2 = Math.floor(h);
    const f = h - i2;
    const p = v * (1 - s);
    const q = v * (1 - s * f);
    const t = v * (1 - s * (1 - f));
    
    switch (i2) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    
    // Convert to hex
    const toHex = (x: number) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    colors.push(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
  }
  
  return colors;
}

/**
 * Creates a color scale for categories with optimal perceptual distance
 * 
 * @param categories Array of category identifiers 
 * @returns Function that maps a category ID to a color
 */
export function getOptimalCategoryColorScale(totalCategories: string[]): (name: string) => string {
  // Choose the best palette based on number of categories
  const numCategories = totalCategories.length;
  
  let palette: string[];
  if (numCategories <= 8) {
    palette = COLOR_PALETTES.colorblindFriendly;
  } else if (numCategories <= 10) {
    palette = COLOR_PALETTES.categorical;
  } else {
    // Generate a custom palette for more than 10 categories
    palette = generateCustomPalette(numCategories);
  }
  
  // Create a direct mapping from category to color
  const categoryColorMap = new Map<string, string>();
  totalCategories.forEach((category, i) => {
    categoryColorMap.set(category, palette[i % palette.length]);
  });
  return (name: string): string => {
    return categoryColorMap.get(name) || palette[0];
  };
}

/**
 * Returns a node color scale that is consistent within category.
 * Nodes in the same category share a base hue, with small deterministic
 * variations by node name/id to keep them in the same spectrum.
 *
 * Usage: pass the returned function anywhere a `(nodeId) => color` is expected.
 */
export function getCategoryConsistentNodeColorScale(
  categoryColorScale: (name: string) => string,
  nodes: NodeData[],
): (name: string) => string {

  const nodesByCategory = new Map<string, NodeData[]>();
  for (const n of nodes) {
    if (!nodesByCategory.has(n.category.name)) nodesByCategory.set(n.category.name, []);
    nodesByCategory.get(n.category.name)!.push(n);
  }
  const nodeNameToColor = new Map<string, string>();
  for (const [categoryName, nodes] of nodesByCategory.entries()) {
    const base = d3.color(categoryColorScale(categoryName));
    const baseHsl = base ? d3.hsl(base) : d3.hsl('#888');
    const nodesLength = nodes.length;
    nodes.forEach((node, index) => {
      // Hue jitter
      const hueJitter = index * 80 / nodesLength;

      const color = d3.hsl(
        (baseHsl.h + hueJitter - 40) % 360,
        baseHsl.s * 0.9,
        baseHsl.l * 0.9
      ).formatHex();

      nodeNameToColor.set(node.name, color);
    });
  }

  return (name: string): string => nodeNameToColor.get(name) || categoryColorScale(nodes[0].category.name || 'default');
}