import { render } from '@testing-library/react';
import Home from '../page';
import { useRouter } from 'next/navigation';

// Mock the useRouter hook
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

describe('Home Page', () => {
  it('should redirect to the /dashboard route', () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push });

    render(<Home />);

    expect(push).toHaveBeenCalledWith('/dashboard');
    expect(push).toHaveBeenCalledTimes(1);
  });
}); 