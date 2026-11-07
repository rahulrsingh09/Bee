import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ pathname: '/trips' }),
}));

vi.mock('../features/r-experience/useRConnection', () => ({
  useRConnection: () => ({ status: null, onlineState: 'online', feed: null, renewal: null }),
}));

import { RAppLayout } from '../features/r-experience/RAppLayout';

describe('RAppLayout primary navigation', () => {
  afterEach(() => document.body.classList.remove('rgl-drawer-open'));

  it('names each tab link with aria-label, so the name stays when the label text is hidden', () => {
    // The editor drawer hides the visible label text (r-experience.css), and the icon is aria-hidden.
    document.body.classList.add('rgl-drawer-open');
    render(<RAppLayout activeKey="activity"><p>Page</p></RAppLayout>);

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    const links = within(navigation).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual(['Now', 'Activity', 'Insights', 'Car']);
    expect(within(navigation).getByRole('link', { name: 'Activity' })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('link', { name: 'Now' })).not.toHaveAttribute('aria-current');
  });
});
