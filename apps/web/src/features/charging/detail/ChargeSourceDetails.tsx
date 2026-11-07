import React from 'react';
import type { ChargeSession } from '@riviamigo/types';
import { formatMoney, networkTitle } from './chargeDetailModel';

function sourceLabel(source: string | null | undefined, telemetryCount: number) {
  if (source === 'telemetry+rivian_api' || (source === 'rivian_api' && telemetryCount > 0)) return 'Telemetry and Rivian charging history';
  if (source === 'rivian_api') return 'Rivian charging history';
  return 'Live telemetry';
}

/** "About this data": where the charge record came from. Closed by default. */
export function ChargeSourceDetails({ session }: { session: ChargeSession }) {
  const telemetryCount = session.telemetry_sample_count ?? 0;
  const facts: Array<[string, string]> = [
    ['Source', sourceLabel(session.source, telemetryCount)],
    ['Telemetry', telemetryCount > 0 ? `${telemetryCount.toLocaleString()} readings matched` : 'No telemetry readings matched'],
    ['Network', networkTitle(session.network_vendor) ?? session.rivian_charger_type ?? 'Not known'],
  ];
  if (session.rivian_paid_total != null) facts.push(['Billed by Rivian', formatMoney(session.rivian_paid_total)]);
  if (session.is_free_session) facts.push(['Rivian billing', 'Free charge']);
  if (session.rivian_city) facts.push(['Rivian city', session.rivian_city]);

  return (
    <details className="group rounded-2xl border border-border bg-bg-surface" data-charge-source>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[15px] font-medium text-fg">
        About this data
        <span aria-hidden="true" className="text-fg-secondary transition-transform group-open:rotate-180 motion-reduce:transition-none">⌄</span>
      </summary>
      <dl className="grid gap-x-4 gap-y-2 px-4 pb-4 text-[13px] leading-[18px] sm:grid-cols-[auto_minmax(0,1fr)]">
        {facts.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className="text-fg-secondary">{label}</dt>
            <dd className="min-w-0 break-words text-fg">{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </details>
  );
}
