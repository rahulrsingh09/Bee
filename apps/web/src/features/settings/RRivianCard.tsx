import React from 'react';
import { Link } from '@tanstack/react-router';
import {
  useChargeBackfillStatus, useCurrentVehicleStatus, useResolvedVehicleSelection, useTriggerChargeBackfill, useVehicles,
} from '@riviamigo/hooks';
import type { BackfillStatus } from '@riviamigo/hooks';
import type { Vehicle, VehicleStatus } from '@riviamigo/types';
import { formatAppDate } from '@riviamigo/ui/lib/dateTime';
import { getRivianCredentialRenewalNotice } from '../../lib/rivianCredentialRenewal';
import { rWhen } from '../r-experience/RAppLayout';
import { RIconCheck, RIconWarn } from '../r-experience/RShellIcons';

/** True when Rivian asked for a new sign-in. */
export function rRivianNeedsReconnect(vehicle: Pick<Vehicle, 'auth_state' | 'renewal_state'> | undefined, status?: Pick<VehicleStatus, 'auth_state' | 'renewal_state'> | null) {
  return [vehicle, status].some(item => item?.auth_state === 'needs_reauth' || item?.renewal_state === 'reauth_required');
}

/** One line about the charging-history backfill. */
export function rBackfillLine(backfill: BackfillStatus | undefined, pending: boolean): string {
  if (pending || backfill?.status === 'running') return 'Fetching charges from Rivian…';
  if (backfill?.status === 'error') return 'The last recovery failed. Try again.';
  const missing = backfill?.missing_source_count ?? (backfill?.rivian_session_count != null
    ? Math.max(0, backfill.rivian_session_count - backfill.local_session_count) : null);
  const when = backfill?.history_backfilled_at ? rWhen(backfill.history_backfilled_at) : null;
  if (missing != null && missing > 0) return `Rivian lists ${missing} ${missing === 1 ? 'charge' : 'charges'} that R does not have.${when ? ` Last checked ${when}.` : ''}`;
  if (when) return `Last checked ${when}. Nothing missing.`;
  return 'After a reconnect, R fetches them from Rivian on its own.';
}

export function RRivianCard() {
  const { effectiveVehicleId } = useResolvedVehicleSelection();
  const { data: vehicles } = useVehicles();
  const vehicle = vehicles?.find(item => item.id === effectiveVehicleId);
  const status = useCurrentVehicleStatus(effectiveVehicleId ?? null).data ?? null;
  const backfill = useChargeBackfillStatus(effectiveVehicleId ?? null);
  const recover = useTriggerChargeBackfill(effectiveVehicleId ?? null);
  const canManage = vehicle?.membership_role === 'owner' || vehicle?.membership_role === 'manager';

  if (!vehicle) {
    return (
      <section id="rivian" className="r-card r-pad r-rise" style={{ '--i': 2 } as React.CSSProperties} aria-labelledby="settings-rivian-title">
        <div className="r-ctitle"><h2 id="settings-rivian-title">Rivian account</h2><span className="r-muted">Not connected</span></div>
        <p className="r-note">Connect your Rivian account so R can read your car.</p>
        <Link to="/connect" className="r-btn r-gap-top">Connect Rivian</Link>
      </section>
    );
  }

  const lost = rRivianNeedsReconnect(vehicle, status);
  const renewal = getRivianCredentialRenewalNotice(status ?? vehicle);
  const connectedAt = vehicle.credential_issued_at ?? vehicle.created_at;
  const refreshed = rWhen(status?.last_updated);
  const running = recover.isPending || backfill.data?.status === 'running';
  return (
    <section id="rivian" className="r-card r-pad r-rise" style={{ '--i': 2 } as React.CSSProperties} aria-labelledby="settings-rivian-title">
      <div className="r-ctitle">
        <h2 id="settings-rivian-title">Rivian account</h2>
        {lost ? <span className="r-warnc"><RIconWarn />Reconnect needed</span> : <span className="r-okc"><RIconCheck />Connected</span>}
      </div>
      <div className="r-muted r-small">
        {connectedAt ? `Connected ${formatAppDate(connectedAt, { year: undefined })}` : 'Connected'}{refreshed ? ` · last refresh ${refreshed}` : ''}
      </div>
      {renewal && !lost && <p className="r-note">{renewal.message}</p>}
      <p className="r-note">If trips or charges stop updating, reconnect. Rivian sends a code to your phone or email.</p>
      {canManage && <Link className="r-btn r-btn-ghost r-gap-top" to="/connect" search={{ mode: 'refresh', vehicle_id: vehicle.id }}>Reconnect</Link>}
      <div className="r-trow r-gap-top r-trow-top">
        <div>
          <div>Missed charges</div>
          <div className="r-trow-sub" role="status" aria-live="polite">{rBackfillLine(backfill.data, recover.isPending)}</div>
          {recover.isError && <div className="r-form-error" role="alert">Recovery did not start. Try again.</div>}
        </div>
        {canManage && (
          <button type="button" className="r-btn r-btn-ghost r-btn-sm" disabled={running || lost} onClick={() => recover.mutate()}>
            {running ? <span className="r-spinner" aria-label="Recovering" /> : 'Recover now'}
          </button>
        )}
      </div>
    </section>
  );
}
