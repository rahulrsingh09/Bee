import React from 'react';
import { cn } from '@riviamigo/ui/lib/utils';
import type { ChargeKind } from './chargeDetailModel';

/** A titled card; `action` sits at the right of the title row. */
export function ChargeCard({ title, action, children, className, attention = false, ...rest }: {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  attention?: boolean;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn('min-w-0 rounded-2xl border bg-bg-surface p-4', attention ? 'border-status-warning' : 'border-border', className)}
      {...rest}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className="whitespace-nowrap text-[15px] font-medium leading-5 text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export interface ChargeTileProps {
  label: string;
  value: string | null;
  unit?: string | undefined;
  context?: string | null | undefined;
  attention?: boolean | undefined;
}

/** One number with a label and one context line. A tile without a value is not shown. */
export function ChargeTile({ label, value, unit, context, attention = false }: ChargeTileProps) {
  if (value == null) return null;
  return (
    <div className={cn('min-w-0 rounded-2xl border bg-bg-surface p-4', attention ? 'border-status-warning' : 'border-border')} data-charge-tile={label}>
      <p className="text-xs leading-4 text-fg-secondary">{label}</p>
      <p className="mt-0.5 truncate text-[22px] font-[450] leading-7 tabular-nums text-fg">
        {value}
        {unit ? <small className="ml-1 text-[13px] font-normal text-fg-secondary">{unit}</small> : null}
      </p>
      {context ? <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{context}</p> : null}
    </div>
  );
}

/** Battery bar: the added part from the start to the end battery %. */
export function BatteryBar({ start, end, kind }: { start: number; end: number; kind: ChargeKind | null }) {
  const left = Math.max(0, Math.min(100, Math.min(start, end)));
  const right = Math.max(0, Math.min(100, Math.max(start, end)));
  return (
    <div
      role="img"
      aria-label={`Battery from ${Math.round(start)}% to ${Math.round(end)}%`}
      className="relative mt-3 h-3.5 overflow-hidden rounded-full bg-bg-elevated"
      data-charge-battery-bar
    >
      <span className="absolute inset-y-0 left-0 bg-border-strong" style={{ width: `${left}%` }} />
      <span
        className={cn('absolute inset-y-0', kind === 'ac' ? 'bg-charging-ac' : 'bg-charging-dc')}
        style={{ left: `${left}%`, width: `${Math.max(0.5, right - left)}%` }}
      />
    </div>
  );
}
