import React from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { CarFront, ChartColumn, House, List } from 'lucide-react';
import type { VehicleStatus } from '@riviamigo/types';
import { RMark } from './RMark';
import { useRConnection } from './useRConnection';

export type RTabKey = 'now' | 'activity' | 'insights' | 'car';

/** Release 1 tab model. Activity opens the trips list until the Activity page ships. */
export const rNavigation = [
  { key: 'now', label: 'Now', to: '/', icon: House },
  { key: 'activity', label: 'Activity', to: '/trips', icon: List },
  { key: 'insights', label: 'Insights', to: '/insights', icon: ChartColumn },
  { key: 'car', label: 'Car', to: '/vehicle-health', icon: CarFront },
] as const satisfies ReadonlyArray<{ key: RTabKey; label: string; to: string; icon: React.ElementType }>;

const within = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Maps a URL to its tab. Detail pages keep the tab of the list they open from. */
export function rNavigationTab(pathname: string): RTabKey {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '') return 'now';
  if (within(path, '/trips') || /^\/charging\/[^/]+$/.test(path)) return 'activity';
  if (['/insights', '/charging', '/battery', '/efficiency', '/d', '/settings/charts', '/explore'].some(base => within(path, base))) {
    return 'insights';
  }
  return 'car';
}

export interface RFreshness {
  state: 'live' | 'stale';
  label: string;
  at: string;
}

function age(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} days`;
}

/** Top-bar freshness: the age of the latest vehicle status, or how long no data came in. */
export function rFreshness(
  status: Pick<VehicleStatus, 'last_updated' | 'telemetry_stale'> | null | undefined,
  now = Date.now(),
): RFreshness | null {
  const at = status?.last_updated;
  const time = at ? new Date(at).getTime() : Number.NaN;
  if (!at || !Number.isFinite(time)) return null;
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (status?.telemetry_stale) return { state: 'stale', label: `No data for ${age(Math.max(1, minutes))}`, at };
  return { state: 'live', label: minutes < 1 ? 'Updated just now' : `Updated ${age(minutes)} ago`, at };
}

function useMinuteClock() {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function RFreshnessIndicator({ status }: { status: VehicleStatus | null }) {
  const freshness = rFreshness(status, useMinuteClock());
  if (!freshness) return <span className="r-freshness" aria-hidden="true" />;
  return (
    <p className="r-freshness" data-state={freshness.state}>
      <span className="r-freshness-dot" aria-hidden="true" />
      <time dateTime={freshness.at}>{freshness.label}</time>
    </p>
  );
}

export function RAppLayout({ children, activeKey, footer }: {
  children: React.ReactNode;
  activeKey: string;
  /** Optional page-level content after the page body, for example the Car tab Settings entry. */
  footer?: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const connection = useRConnection();
  const active = rNavigationTab(pathname);
  return (
    <div className="r-app" data-area={activeKey}>
      <a className="r-skip-link" href="#r-content">Skip to content</a>
      <header className="r-header">
        <Link to="/" aria-label="R overview" className="r-brand"><RMark /></Link>
        <nav className="r-navigation" aria-label="Primary navigation">
          {rNavigation.map(({ key, label, to, icon: Icon }) => (
            <Link key={key} to={to} aria-label={label} aria-current={active === key ? 'page' : undefined}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <RFreshnessIndicator status={connection.status} />
      </header>
      <main id="r-content" className="r-main" tabIndex={-1}>
        {connection.onlineState === 'connecting' && <p className="r-connection-status" role="status">
          Reconnecting live updates · Showing last recorded readings.
        </p>}
        {connection.feed && <p className="r-notice" role="alert">{connection.feed.title}.{' '}
          <Link to="/vehicle-health">Check vehicle health</Link></p>}
        {connection.renewal && <p className="r-notice">
          <Link to="/settings" search={{ section: 'vehicles' }}>{connection.renewal.message}</Link>
        </p>}
        <div className="r-page" key={pathname}>{children}{footer}</div>
      </main>
    </div>
  );
}
