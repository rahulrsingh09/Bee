import React from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { RAppLayout } from '../r-experience/RAppLayout';

/** Release 1 Insights hub: one row per insight area, then the dashboard library. Lifetime is added when its page exists. */
export const insightsDestinations = [
  { title: 'Cost', detail: 'Charges, energy added and what they cost', to: '/charging' },
  { title: 'Battery', detail: 'Battery health, level and range', to: '/battery' },
  { title: 'Parked loss', detail: 'Battery the car loses while parked', to: '/battery/phantom-drain' },
  { title: 'Efficiency', detail: 'mi/kWh trends, temperature and trip comparisons', to: '/efficiency' },
] as const;

export function InsightsHub() {
  return (
    <RAppLayout activeKey="insights">
      <div className="r-page-heading"><h1>Insights</h1><p>What your Rivian costs, how the battery is, and how you drive.</p></div>
      <nav className="r-directory" aria-label="Insights">
        {insightsDestinations.map(item => (
          <Link key={item.title} to={item.to}>
            <span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight aria-hidden="true" />
          </Link>
        ))}
        <Link to="/settings" search={{ section: 'dashboards' }}>
          <span><strong>Custom dashboards</strong><small>Your saved layouts and views</small></span><ArrowRight aria-hidden="true" />
        </Link>
      </nav>
    </RAppLayout>
  );
}
