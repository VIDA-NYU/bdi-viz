import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import HeatMap from '../HeatMap';
import { mockData, mockSourceColumns, mockTargetOntologies } from '../__mocks__/mocks';

describe('HeatMap Component', () => {
  it('should toggle the expanded state of a cell when clicked', () => {
    const setSelectedCandidate = jest.fn();

    const { rerender } = render(
      <HeatMap
        data={mockData}
        sourceColumn="all"
        sourceColumns={mockSourceColumns}
        setSourceColumn={() => {}}
        targetOntologies={mockTargetOntologies}
        selectedCandidate={undefined}
        setSelectedCandidate={setSelectedCandidate}
        sourceUniqueValues={[]}
        targetUniqueValues={[]}
        highlightSourceColumns={[]}
        highlightTargetColumns={[]}
      />
    );

    // Find a cell to click on
    const cell = screen.getByTestId('cell-Gender-gender');
    fireEvent.click(cell);

    // Expect the cell to be selected
    expect(setSelectedCandidate).toHaveBeenCalledWith(mockData[0]);

    // Re-render with the selected candidate
    rerender(
      <HeatMap
        data={mockData}
        sourceColumn="all"
        sourceColumns={mockSourceColumns}
        setSourceColumn={() => {}}
        targetOntologies={mockTargetOntologies}
        selectedCandidate={mockData[0]}
        setSelectedCandidate={setSelectedCandidate}
        sourceUniqueValues={[]}
        targetUniqueValues={[]}
        highlightSourceColumns={[]}
        highlightTargetColumns={[]}
      />
    );

    // The cell should now be expanded
    const expandedCell = screen.getByTestId('expanded-cell-Gender-gender');
    expect(expandedCell).toBeInTheDocument();

    // Click the cell again to close it
    fireEvent.click(expandedCell);
    expect(setSelectedCandidate).toHaveBeenCalledWith(undefined);
  });
}); 