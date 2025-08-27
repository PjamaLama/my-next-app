import React from 'react';
import { render, screen } from '@testing-library/react';
import WhatsAppComingSoonBanner from '../../app/components/WhatsAppComingSoonBanner';

describe('WhatsAppComingSoonBanner', () => {
  it('should render the WhatsApp integration banner', () => {
    render(<WhatsAppComingSoonBanner />);

    // Check that the main banner text is present
    expect(screen.getByText('WhatsApp Integration')).toBeInTheDocument();
    expect(screen.getByText('Direct messaging coming soon!')).toBeInTheDocument();
  });

  it('should have the correct CSS classes', () => {
    const { container } = render(<WhatsAppComingSoonBanner />);

    // Check that the main container has the expected classes
    const mainDiv = container.firstChild;
    expect(mainDiv).toHaveClass('text-center', 'text-xs', 'text-gray-400', 'mt-3');

    // Check that the banner has gradient and border classes
    const bannerDiv = mainDiv?.firstChild;
    expect(bannerDiv).toHaveClass(
      'bg-gradient-to-r',
      'from-blue-600/20',
      'to-purple-600/20',
      'border',
      'border-blue-500/30',
      'rounded-md',
      'p-2',
      'inline-block'
    );

    // Check that the title has the correct styling
    const titleDiv = bannerDiv?.firstChild;
    expect(titleDiv).toHaveClass('text-blue-300', 'font-medium', 'text-xs', 'mb-0.5');

    // Check that the subtitle has the correct styling
    const subtitleDiv = titleDiv?.nextSibling;
    expect(subtitleDiv).toHaveClass('text-blue-200/70', 'text-xs', 'leading-tight');
  });

  it('should have proper accessibility structure', () => {
    const { container } = render(<WhatsAppComingSoonBanner />);

    // The banner should be properly structured with semantic elements
    expect(container.firstChild).toBeInTheDocument();

    // Check that the text content is properly structured
    const titleElement = screen.getByText('WhatsApp Integration');
    const subtitleElement = screen.getByText('Direct messaging coming soon!');

    // Both text elements should be visible
    expect(titleElement).toBeVisible();
    expect(subtitleElement).toBeVisible();
  });

  it('should render consistently across renders', () => {
    const { rerender } = render(<WhatsAppComingSoonBanner />);

    // First render
    expect(screen.getByText('WhatsApp Integration')).toBeInTheDocument();

    // Re-render and check consistency
    rerender(<WhatsAppComingSoonBanner />);
    expect(screen.getByText('WhatsApp Integration')).toBeInTheDocument();
    expect(screen.getByText('Direct messaging coming soon!')).toBeInTheDocument();
  });
});
