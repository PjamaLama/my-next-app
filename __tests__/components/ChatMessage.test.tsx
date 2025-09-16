import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatMessage from '../../app/components/ChatMessage';

// Mock the useChat hook
const mockUpdateMessageTables = jest.fn();
jest.mock('../../app/providers/ChatProvider', () => ({
  useChat: () => ({
    updateMessageTables: mockUpdateMessageTables,
  }),
}));

describe('ChatMessage', () => {
  const mockOnEdit = jest.fn();
  const mockOnReadAloud = jest.fn();

  const defaultProps = {
    message: {
      id: '1',
      role: 'assistant' as const,
      content: 'Test message',
      timestamp: new Date(),
      tables: [
        {
          title: 'Test Table',
          headers: ['Name', 'Age'],
          rows: JSON.stringify([['John', '25'], ['Jane', '30']]),
          rowCount: 2,
          summary: 'Test data',
          meta: {
            sheetName: 'Sheet1',
            operations: { add: 2, update: 0 },
            requiresConfirmation: true,
            isDryRun: false,
          },
        },
      ],
    },
    selectedSheetNames: [],
    processingTables: new Set<string>(),
    onEdit: mockOnEdit,
    onReadAloud: mockOnReadAloud,
    speakingMessageId: null,
    formatTimestamp: (date: Date) => date.toLocaleTimeString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.dispatchEvent
    window.dispatchEvent = jest.fn();
  });

  describe('Approve button', () => {
    it('should enable approve button when table has meta.sheetName', () => {
      render(<ChatMessage {...defaultProps} />);

      const approveButton = screen.getByRole('button', { name: /approve/i });
      expect(approveButton).not.toBeDisabled();
    });

    it('should disable approve button when table lacks meta.sheetName', () => {
      const propsWithoutSheetName = {
        ...defaultProps,
        message: {
          ...defaultProps.message,
          tables: [
            {
              ...defaultProps.message.tables![0],
              meta: {
                ...defaultProps.message.tables![0].meta,
                sheetName: undefined,
              },
            },
          ],
        },
      };

      render(<ChatMessage {...propsWithoutSheetName} />);

      const approveButton = screen.getByRole('button', { name: /approve/i });
      expect(approveButton).toBeDisabled();
    });

    it('should disable approve button when processing', () => {
      const propsWithProcessing = {
        ...defaultProps,
        processingTables: new Set(['table-1']),
      };

      render(<ChatMessage {...propsWithProcessing} />);

      const approveButton = screen.getByRole('button', { name: /approve/i });
      expect(approveButton).toBeDisabled();
      expect(approveButton).toHaveTextContent('Applying...');
    });

    it('should dispatch approve event with correct data when clicked', () => {
      render(<ChatMessage {...defaultProps} />);

      const approveButton = screen.getByRole('button', { name: /approve/i });
      fireEvent.click(approveButton);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'chat:approve-update',
          detail: {
            preview: expect.objectContaining({
              headers: ['Name', 'Age'],
              rows: [['John', '25'], ['Jane', '30']],
              messageId: '1',
              tableIndex: 0,
              title: 'Test Table',
              sheetName: 'Sheet1',
              meta: expect.objectContaining({
                sheetName: 'Sheet1',
                operations: { add: 2, update: 0 },
              }),
            }),
          },
        })
      );
    });
  });

  describe('Reject button', () => {
    it('should dispatch reject event when clicked', () => {
      render(<ChatMessage {...defaultProps} />);

      const rejectButton = screen.getByRole('button', { name: /reject/i });
      fireEvent.click(rejectButton);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'chat:reject-update',
          detail: {
            preview: expect.objectContaining({
              headers: ['Name', 'Age'],
              rows: [['John', '25'], ['Jane', '30']],
              messageId: '1',
              tableIndex: 0,
              title: 'Test Table',
              sheetName: 'Sheet1',
              uid: 'table-1',
            }),
          },
        })
      );
    });

    it('should disable reject button when processing', () => {
      const propsWithProcessing = {
        ...defaultProps,
        processingTables: new Set(['reject-table-1']),
      };

      render(<ChatMessage {...propsWithProcessing} />);

      const rejectButton = screen.getByRole('button', { name: /reject/i });
      expect(rejectButton).toBeDisabled();
      expect(rejectButton).toHaveTextContent('Removing...');
    });
  });

  describe('Target display', () => {
    it('should show green target when table has sheetName', () => {
      render(<ChatMessage {...defaultProps} />);

      const targetText = screen.getByText('Sheet1');
      expect(targetText).toHaveClass('text-emerald-300');
    });

    it('should show yellow target and warning when table lacks sheetName', () => {
      const propsWithoutSheetName = {
        ...defaultProps,
        message: {
          ...defaultProps.message,
          tables: [
            {
              ...defaultProps.message.tables![0],
              meta: {
                ...defaultProps.message.tables![0].meta,
                sheetName: undefined,
              },
            },
          ],
        },
      };

      render(<ChatMessage {...propsWithoutSheetName} />);

      const targetText = screen.getByText('No target sheet specified');
      expect(targetText).toHaveClass('text-yellow-400');

      expect(screen.getByText('⚠️ This table needs a target sheet to be approved')).toBeInTheDocument();
    });
  });

  describe('Edit button', () => {
    it('should call onEdit with correct data when clicked', () => {
      render(<ChatMessage {...defaultProps} />);

      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);

      expect(mockOnEdit).toHaveBeenCalledWith({
        headers: ['Name', 'Age'],
        rows: [
          { column: 'Name', value: 'John' },
          { column: 'Age', value: '25' },
        ],
        message: 'Test data',
        messageId: '1',
        tableIndex: 0,
        title: 'Test Table',
      });
    });
  });
});
