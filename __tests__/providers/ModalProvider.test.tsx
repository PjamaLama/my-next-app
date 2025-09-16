import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ModalProvider, useModal } from '../../app/providers/ModalProvider';
import SpreadsheetManagerModal from '../../app/components/SpreadsheetManagerModal';

// Mock SpreadsheetManagerModal
jest.mock('../../app/components/SpreadsheetManagerModal', () => {
  return jest.fn(() => <div data-testid="spreadsheet-manager-modal">Modal Content</div>);
});

// Test component to access useModal hook
const TestComponent: React.FC = () => {
  const { openSpreadsheetManager, closeSpreadsheetManager, isSpreadsheetManagerOpen } = useModal();

  return (
    <div>
      <button onClick={openSpreadsheetManager} data-testid="open-modal-btn">
        Open Modal
      </button>
      <button onClick={closeSpreadsheetManager} data-testid="close-modal-btn">
        Close Modal
      </button>
      <div data-testid="modal-status">
        {isSpreadsheetManagerOpen ? 'open' : 'closed'}
      </div>
    </div>
  );
};

describe('ModalProvider', () => {
  let mockSpreadsheetManagerModal: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpreadsheetManagerModal = require('../../app/components/SpreadsheetManagerModal');
  });

  it('should provide modal context to child components', () => {
    render(
      <ModalProvider>
        <TestComponent />
      </ModalProvider>
    );

    expect(screen.getByTestId('open-modal-btn')).toBeInTheDocument();
    expect(screen.getByTestId('close-modal-btn')).toBeInTheDocument();
    expect(screen.getByTestId('modal-status')).toHaveTextContent('closed');
  });

  it('should open modal when openSpreadsheetManager is called', () => {
    render(
      <ModalProvider>
        <TestComponent />
      </ModalProvider>
    );

    const openButton = screen.getByTestId('open-modal-btn');
    fireEvent.click(openButton);

    expect(screen.getByTestId('modal-status')).toHaveTextContent('open');
  });

  it('should close modal when closeSpreadsheetManager is called', () => {
    render(
      <ModalProvider>
        <TestComponent />
      </ModalProvider>
    );

    // Open modal first
    const openButton = screen.getByTestId('open-modal-btn');
    fireEvent.click(openButton);
    expect(screen.getByTestId('modal-status')).toHaveTextContent('open');

    // Close modal
    const closeButton = screen.getByTestId('close-modal-btn');
    fireEvent.click(closeButton);
    expect(screen.getByTestId('modal-status')).toHaveTextContent('closed');
  });

  it('should render SpreadsheetManagerModal with correct props', () => {
    render(
      <ModalProvider>
        <TestComponent />
      </ModalProvider>
    );

    // Modal should be rendered with open=false initially
    expect(mockSpreadsheetManagerModal).toHaveBeenCalledWith(
      expect.objectContaining({
        open: false,
        onClose: expect.any(Function),
      }),
      {}
    );
  });

  it('should update modal open state correctly', () => {
    render(
      <ModalProvider>
        <TestComponent />
      </ModalProvider>
    );

    // Initially closed
    expect(mockSpreadsheetManagerModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: false }),
      {}
    );

    // Open modal
    const openButton = screen.getByTestId('open-modal-btn');
    fireEvent.click(openButton);

    expect(mockSpreadsheetManagerModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true }),
      {}
    );

    // Close modal
    const closeButton = screen.getByTestId('close-modal-btn');
    fireEvent.click(closeButton);

    expect(mockSpreadsheetManagerModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: false }),
      {}
    );
  });

  it('should throw error when useModal is used outside ModalProvider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useModal must be used within a ModalProvider');

    consoleSpy.mockRestore();
  });
});
