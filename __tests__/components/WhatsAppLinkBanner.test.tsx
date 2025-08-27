import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WhatsAppLinkBanner from '../../app/components/WhatsAppLinkBanner';

// Mock Next.js Link component
jest.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({ children, href, className, ...props }: any) => (
      <a href={href} className={className} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock Firebase Provider
jest.mock('../../app/providers/FirebaseProvider', () => ({
  useFirebase: jest.fn(),
}));

const { useFirebase } = require('../../app/providers/FirebaseProvider');

describe('WhatsAppLinkBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render nothing when user is not logged in', () => {
    (useFirebase as jest.Mock).mockReturnValue({
      user: null,
      waId: null,
    });

    const { container } = render(
      <MemoryRouter>
        <WhatsAppLinkBanner />
      </MemoryRouter>
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when user has waId', () => {
    (useFirebase as jest.Mock).mockReturnValue({
      user: { uid: 'user123', email: 'user@example.com' },
      waId: 'wa123',
    });

    const { container } = render(
      <MemoryRouter>
        <WhatsAppLinkBanner />
      </MemoryRouter>
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render banner when user is logged in but has no waId', () => {
    (useFirebase as jest.Mock).mockReturnValue({
      user: { uid: 'user123', email: 'user@example.com' },
      waId: null,
    });

    render(
      <MemoryRouter>
        <WhatsAppLinkBanner />
      </MemoryRouter>
    );

    expect(screen.getByText('Link your WhatsApp for seamless messaging!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to settings.' })).toBeInTheDocument();
  });

  it('should render banner when waId is undefined', () => {
    (useFirebase as jest.Mock).mockReturnValue({
      user: { uid: 'user123', email: 'user@example.com' },
      waId: undefined,
    });

    render(
      <MemoryRouter>
        <WhatsAppLinkBanner />
      </MemoryRouter>
    );

    expect(screen.getByText('Link your WhatsApp for seamless messaging!')).toBeInTheDocument();
  });

  it('should have correct link href', () => {
    (useFirebase as jest.Mock).mockReturnValue({
      user: { uid: 'user123', email: 'user@example.com' },
      waId: null,
    });

    render(
      <MemoryRouter>
        <WhatsAppLinkBanner />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: 'Go to settings.' });
    expect(link).toHaveAttribute('href', '/whatsapp-setup');
  });

  it('should have correct CSS classes', () => {
    (useFirebase as jest.Mock).mockReturnValue({
      user: { uid: 'user123', email: 'user@example.com' },
      waId: null,
    });

    const { container } = render(
      <MemoryRouter>
        <WhatsAppLinkBanner />
      </MemoryRouter>
    );

    const bannerDiv = container.firstChild;
    expect(bannerDiv).toHaveClass('bg-blue-600', 'text-white', 'text-center', 'p-2');

    const paragraph = screen.getByText(/Link your WhatsApp/).closest('p');
    expect(paragraph).toHaveClass('text-sm');

    const link = screen.getByRole('link', { name: 'Go to settings.' });
    expect(link).toHaveClass('font-bold', 'underline', 'hover:text-blue-200');
  });

  it('should render link text correctly', () => {
    (useFirebase as jest.Mock).mockReturnValue({
      user: { uid: 'user123', email: 'user@example.com' },
      waId: null,
    });

    render(
      <MemoryRouter>
        <WhatsAppLinkBanner />
      </MemoryRouter>
    );

    // Check that the link text is present
    const link = screen.getByRole('link', { name: 'Go to settings.' });
    expect(link).toHaveTextContent('Go to settings.');
  });
});
