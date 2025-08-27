import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimpleButton from '../../app/components/SimpleButton';

describe('SimpleButton', () => {
  it('should render with the correct label', () => {
    render(<SimpleButton label="Click me" />);

    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('should render with primary variant by default', () => {
    render(<SimpleButton label="Primary Button" />);

    const button = screen.getByTestId('simple-button');
    expect(button).toHaveClass('bg-blue-600', 'text-white');
  });

  it('should render with secondary variant when specified', () => {
    render(<SimpleButton label="Secondary Button" variant="secondary" />);

    const button = screen.getByTestId('simple-button');
    expect(button).toHaveClass('bg-gray-200', 'text-gray-900');
  });

  it('should be enabled by default', () => {
    render(<SimpleButton label="Enabled Button" />);

    const button = screen.getByTestId('simple-button');
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveClass('opacity-50', 'cursor-not-allowed');
  });

  it('should be disabled when disabled prop is true', () => {
    render(<SimpleButton label="Disabled Button" disabled />);

    const button = screen.getByTestId('simple-button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('opacity-50', 'cursor-not-allowed');
  });

  it('should call onClick when clicked and not disabled', async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();

    render(<SimpleButton label="Clickable Button" onClick={handleClick} />);

    const button = screen.getByTestId('simple-button');
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should not call onClick when disabled', async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();

    render(<SimpleButton label="Disabled Button" onClick={handleClick} disabled />);

    const button = screen.getByTestId('simple-button');
    await user.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should show visual feedback when clicked', async () => {
    const user = userEvent.setup();

    render(<SimpleButton label="Feedback Button" />);

    const button = screen.getByTestId('simple-button');

    // Initially should not have scale-95 class
    expect(button).not.toHaveClass('scale-95');

    // Click the button
    await user.click(button);

    // Should show visual feedback
    await waitFor(() => {
      expect(button).toHaveClass('scale-95');
    });

    // After timeout, should reset
    await waitFor(
      () => {
        expect(button).not.toHaveClass('scale-95');
      },
      { timeout: 200 }
    );
  });

  it('should have proper accessibility attributes', () => {
    render(<SimpleButton label="Accessible Button" />);

    const button = screen.getByRole('button', { name: 'Accessible Button' });

    // Should be focusable
    expect(button).toHaveAttribute('tabIndex', '0');

    // Should have proper focus styles
    expect(button).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-offset-2');
  });

  it('should handle keyboard interaction', async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();

    render(<SimpleButton label="Keyboard Button" onClick={handleClick} />);

    const button = screen.getByTestId('simple-button');

    // Focus the button
    button.focus();
    expect(button).toHaveFocus();

    // Press Enter
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledTimes(1);

    // Reset mock
    handleClick.mockClear();

    // Press Space
    await user.keyboard(' ');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should handle rapid clicks appropriately', async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();

    render(<SimpleButton label="Rapid Click Button" onClick={handleClick} />);

    const button = screen.getByTestId('simple-button');

    // Click multiple times rapidly
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(3);
  });

  it('should maintain button text during interactions', async () => {
    const user = userEvent.setup();

    render(<SimpleButton label="Consistent Text" />);

    const button = screen.getByTestId('simple-button');

    // Text should be consistent
    expect(button).toHaveTextContent('Consistent Text');

    // Click and check text is still there
    await user.click(button);
    expect(button).toHaveTextContent('Consistent Text');

    // Text should remain after visual feedback
    await waitFor(() => {
      expect(button).toHaveTextContent('Consistent Text');
    });
  });
});
