/*
 * STUB from the activity node. The now node owns this file and ships the real
 * implementation. Keep the exported names and signatures compatible.
 */
import React from 'react';

export type EfficiencyUnit = 'whmi' | 'mikwh' | 'kwh100';

export const EFFICIENCY_UNITS: Record<EfficiencyUnit, { label: string; digits: number; lowerIsBetter: boolean; fromWhPerMile: (value: number) => number }> = {
  whmi: { label: 'Wh/mi', digits: 0, lowerIsBetter: true, fromWhPerMile: (value) => value },
  mikwh: { label: 'mi/kWh', digits: 2, lowerIsBetter: false, fromWhPerMile: (value) => 1000 / value },
  kwh100: { label: 'kWh/100 mi', digits: 1, lowerIsBetter: true, fromWhPerMile: (value) => value / 10 },
};

const STORAGE_KEY = 'r-efficiency-unit';
const CHANGE_EVENT = 'r-efficiency-unit-change';

function isUnit(value: unknown): value is EfficiencyUnit {
  return value === 'whmi' || value === 'mikwh' || value === 'kwh100';
}

export function readEfficiencyUnit(): EfficiencyUnit {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isUnit(value) ? value : 'whmi';
  } catch {
    return 'whmi';
  }
}

export function writeEfficiencyUnit(unit: EfficiencyUnit) {
  try {
    window.localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // Storage can be unavailable in private windows. The choice then lasts for this page only.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Formats a Wh/mi value in the unit, without the unit label. */
export function formatEfficiencyValue(whPerMile: number | null | undefined, unit: EfficiencyUnit) {
  if (whPerMile == null || !Number.isFinite(whPerMile) || whPerMile <= 0) return null;
  const spec = EFFICIENCY_UNITS[unit];
  return spec.fromWhPerMile(whPerMile).toLocaleString('en-US', { minimumFractionDigits: spec.digits, maximumFractionDigits: spec.digits });
}

/** The efficiency unit chosen by the owner: Wh/mi, mi/kWh or kWh/100 mi. It is kept per browser. */
export function useEfficiencyUnit() {
  const [unit, setState] = React.useState<EfficiencyUnit>(readEfficiencyUnit);
  React.useEffect(() => {
    const update = () => setState(readEfficiencyUnit());
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  const setUnit = React.useCallback((next: EfficiencyUnit) => writeEfficiencyUnit(next), []);
  return { unit, setUnit, label: EFFICIENCY_UNITS[unit].label, format: (whPerMile: number | null | undefined) => formatEfficiencyValue(whPerMile, unit) };
}
