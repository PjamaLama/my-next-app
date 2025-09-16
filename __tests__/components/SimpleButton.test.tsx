import React from 'react';
import { render, screen } from '@testing-library/react';
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
  });

  it('should be disabled when disabled prop is true', () => {
    render(<SimpleButton label="Disabled Button" disabled />);
    const button = screen.getByTestId('simple-button');
    expect(button).toBeDisabled();
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

  it('should have proper accessibility attributes', () => {
    render(<SimpleButton label="Accessible Button" />);
    const button = screen.getByRole('button', { name: 'Accessible Button' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('focus:outline-none', 'focus:ring-2');
  });
});
