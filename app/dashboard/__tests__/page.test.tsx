import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../page';
import SettingsGlobalContext from '@/app/lib/settings/settings-context';
import PaginationGlobalContext from '@/app/lib/pagination/pagination-context';

jest.mock('axios');

// Mock the contexts
const mockSettingsContext = {
  isLoadingGlobal: false,
  setIsLoadingGlobal: jest.fn(),
  developerMode: false,
  setDeveloperMode: jest.fn(),
  hoverMode: false,
  setHoverMode: jest.fn(),
  taskState: {
    status: 'idle',
    progress: 0,
    current_step: 'Task start...',
    total_steps: 4,
    completed_steps: 0,
    logs: [],
  },
  setTaskState: jest.fn(),
  ontologySearchPopupOpen: false,
  setOntologySearchPopupOpen: jest.fn(),
};

const mockPaginationContext = {
  pageNumber: 1,
  pageSize: 10,
  setTotalPages: jest.fn(),
  setPageNumber: jest.fn(),
  setPageSize: jest.fn(),
  totalPages: 1,
};

describe('Dashboard Page', () => {
  it('should render without crashing and display key elements', async () => {
    render(
      <SettingsGlobalContext.Provider value={mockSettingsContext}>
        <PaginationGlobalContext.Provider value={mockPaginationContext}>
          <Dashboard />
        </PaginationGlobalContext.Provider>
      </SettingsGlobalContext.Provider>
    );

    // Wait for the component to finish rendering and updating state
    await waitFor(() => {
      // Check for some key elements
      expect(screen.getByText('BDIViz')).toBeInTheDocument();
      expect(screen.getByText('Shortcut Panel')).toBeInTheDocument();
      expect(screen.getByText('Control Panel')).toBeInTheDocument();
    });
  });
}); 