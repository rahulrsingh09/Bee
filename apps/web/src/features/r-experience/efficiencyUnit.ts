import React from 'react';

/**
 * Stub from the insights node. The now node owns this file; keep its exports when the real one lands.
 * The efficiency unit applies everywhere and persists per browser (local storage).
 */
export type EfficiencyUnit = 'wh_mi' | 'mi_kwh' | 'kwh_100mi';

export interface EfficiencyUnitSpec {
  label: string;
  decimals: number;
  /** True when a lower number is better (energy per distance). */
  lowerIsBetter: boolean;
  /** Converts Wh/mi into this unit. */
  fromWhMi: (whMi: number) => number;
}

export const EFFICIENCY_UNITS: Record<EfficiencyUnit, EfficiencyUnitSpec> = {
  wh_mi: { label: 'Wh/mi', decimals: 0, lowerIsBetter: true, fromWhMi: v => v },
  mi_kwh: { label: 'mi/kWh', decimals: 2, lowerIsBetter: false, fromWhMi: v => 1000 / v },
  kwh_100mi: { label: 'kWh/100 mi', decimals: 1, lowerIsBetter: true, fromWhMi: v => v / 10 },
};

export const EFFICIENCY_UNIT_ORDER: readonly EfficiencyUnit[] = ['wh_mi', 'mi_kwh', 'kwh_100mi'];

const STORAGE_KEY = 'r-efficiency-unit';
const CHANGE_EVENT = 'r-efficiency-unit-change';

function isUnit(value: unknown): value is EfficiencyUnit {
  return value === 'wh_mi' || value === 'mi_kwh' || value === 'kwh_100mi';
}

export function readEfficiencyUnit(): EfficiencyUnit {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isUnit(value) ? value : 'wh_mi';
  } catch {
    return 'wh_mi';
  }
}

export function writeEfficiencyUnit(unit: EfficiencyUnit) {
  try { window.localStorage.setItem(STORAGE_KEY, unit); } catch { /* storage can be blocked */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The user's efficiency unit and a setter. Every caller updates when one of them changes the unit. */
export function useEfficiencyUnit() {
  const [unit, setState] = React.useState<EfficiencyUnit>(readEfficiencyUnit);
  React.useEffect(() => {
    const sync = () => setState(readEfficiencyUnit());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const setUnit = React.useCallback((next: EfficiencyUnit) => {
    setState(next);
    writeEfficiencyUnit(next);
  }, []);
  return { unit, setUnit, spec: EFFICIENCY_UNITS[unit] } as const;
}
