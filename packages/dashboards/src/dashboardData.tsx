import React from 'react';
import {
  useBatteryHealth,
  useChargingSummary,
  useCurrentVehicleStatus,
  useEfficiencySummary,
  useMetricBatch,
} from '@riviamigo/hooks';
import type {
  BatteryHealthSummary,
  ChargingSummary,
  EfficiencySummary,
  MetricBatchMetricRequest,
  MetricSeriesPoint,
  MetricValueResponse,
  VehicleStatus,
} from '@riviamigo/types';
import { getWidgetForInstance } from './registry';
import type { DashboardDataRequirements, WidgetInstance, WidgetCtx } from './registry';

export type { DashboardDataRequirements } from './registry';

export interface DashboardMetricData {
  value?: MetricValueResponse;
  series: MetricSeriesPoint[];
}

/** The provider queries that a tile can read from. */
export type DashboardDataSource = 'batch' | 'status' | 'batteryHealth' | 'chargingSummary' | 'efficiencySummary';

/**
 * A source has failed when its read returned an error and no earlier data
 * exists. Background reads do not toast, so the tile shows this error itself.
 */
export type DashboardDataFailures = Readonly<Record<DashboardDataSource, boolean>>;

export interface DashboardDataSnapshot {
  hasProvider: true;
  values: ReadonlyMap<string, MetricValueResponse>;
  series: ReadonlyMap<string, MetricSeriesPoint[]>;
  metrics: ReadonlyMap<string, DashboardMetricData>;
  status?: VehicleStatus | null;
  batteryHealth?: BatteryHealthSummary;
  chargingSummary?: ChargingSummary;
  efficiencySummary?: EfficiencySummary;
  isRefreshing: boolean;
  failed: DashboardDataFailures;
  /** Refetches only the sources that have failed. */
  retry: () => void;
}

const NO_FAILURES: DashboardDataFailures = {
  batch: false,
  status: false,
  batteryHealth: false,
  chargingSummary: false,
  efficiencySummary: false,
};

interface ProviderQueryState {
  data?: unknown;
  isError?: boolean;
  refetch?: () => unknown;
}

function hasFailed(query: ProviderQueryState, required: boolean) {
  return required && query.isError === true && query.data == null;
}

class DashboardDataStore {
  private snapshot: DashboardDataSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.snapshot = {
      hasProvider: true,
      values: new Map(),
      series: new Map(),
      metrics: new Map(),
      isRefreshing: false,
      failed: NO_FAILURES,
      retry: () => {},
    };
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setSnapshot(snapshot: DashboardDataSnapshot) {
    this.snapshot = snapshot;
  }

  notify() {
    this.listeners.forEach((listener) => listener());
  }
}

const DashboardDataContext = React.createContext<DashboardDataStore | null>(null);

export function collectDashboardDataRequirements(widgets: readonly WidgetInstance[]): DashboardDataRequirements {
  const metricRequests = new Map<string, MetricBatchMetricRequest>();
  const result: DashboardDataRequirements = {};

  for (const instance of widgets) {
    const definition = getWidgetForInstance(instance);
    const requirements = definition?.dataRequirements?.(instance);
    if (!requirements) continue;

    result.status ||= requirements.status === true;
    result.batteryHealth ||= requirements.batteryHealth === true;
    result.chargingSummary ||= requirements.chargingSummary === true;
    result.efficiencySummary ||= requirements.efficiencySummary === true;
    for (const request of requirements.metrics ?? []) {
      const current = metricRequests.get(request.metric);
      metricRequests.set(request.metric, {
        metric: request.metric,
        include_latest: current
          ? current.include_latest !== false || request.include_latest !== false
          : request.include_latest !== false,
        include_series: current
          ? current.include_series === true || request.include_series === true
          : request.include_series === true,
      });
    }
  }

  const metrics = [...metricRequests.values()].sort((left, right) => left.metric.localeCompare(right.metric));
  return metrics.length > 0 ? { ...result, metrics } : result;
}

export function DashboardDataProvider({
  ctx,
  requirements,
  children,
}: {
  ctx: WidgetCtx;
  requirements: DashboardDataRequirements;
  children: React.ReactNode;
}) {
  const storeRef = React.useRef<DashboardDataStore | undefined>(undefined);
  if (!storeRef.current) storeRef.current = new DashboardDataStore();
  const store = storeRef.current;
  const metrics = requirements.metrics ?? [];
  const lifetime = !ctx.from && !ctx.to;
  const batch = useMetricBatch(ctx.vehicleId, metrics, ctx.from, ctx.to, lifetime, ctx.tripTagFilter);
  const status = useCurrentVehicleStatus(requirements.status ? ctx.vehicleId : null);
  const batteryHealth = useBatteryHealth(requirements.batteryHealth ? ctx.vehicleId : null);
  const chargingSummary = useChargingSummary(
    requirements.chargingSummary ? ctx.vehicleId : null,
    ctx.from,
    ctx.to,
  );
  const efficiencySummary = useEfficiencySummary(
    requirements.efficiencySummary ? ctx.vehicleId : null,
    ctx.from,
    ctx.to,
    ctx.tripTagFilter,
  );
  const failedBatch = hasFailed(batch, metrics.length > 0);
  const failedStatus = hasFailed(status, requirements.status === true);
  const failedBatteryHealth = hasFailed(batteryHealth, requirements.batteryHealth === true);
  const failedChargingSummary = hasFailed(chargingSummary, requirements.chargingSummary === true);
  const failedEfficiencySummary = hasFailed(efficiencySummary, requirements.efficiencySummary === true);
  const { refetch: refetchBatch } = batch;
  const { refetch: refetchStatus } = status;
  const { refetch: refetchBatteryHealth } = batteryHealth;
  const { refetch: refetchChargingSummary } = chargingSummary;
  const { refetch: refetchEfficiencySummary } = efficiencySummary;
  const retry = React.useCallback(() => {
    const sources: Array<[boolean, (() => unknown) | undefined]> = [
      [failedBatch, refetchBatch],
      [failedStatus, refetchStatus],
      [failedBatteryHealth, refetchBatteryHealth],
      [failedChargingSummary, refetchChargingSummary],
      [failedEfficiencySummary, refetchEfficiencySummary],
    ];
    for (const [sourceFailed, refetch] of sources) {
      if (sourceFailed) void refetch?.();
    }
  }, [
    failedBatch,
    failedStatus,
    failedBatteryHealth,
    failedChargingSummary,
    failedEfficiencySummary,
    refetchBatch,
    refetchStatus,
    refetchBatteryHealth,
    refetchChargingSummary,
    refetchEfficiencySummary,
  ]);
  const failed = React.useMemo<DashboardDataFailures>(
    () => failedBatch || failedStatus || failedBatteryHealth || failedChargingSummary || failedEfficiencySummary
      ? {
          batch: failedBatch,
          status: failedStatus,
          batteryHealth: failedBatteryHealth,
          chargingSummary: failedChargingSummary,
          efficiencySummary: failedEfficiencySummary,
        }
      : NO_FAILURES,
    [failedBatch, failedStatus, failedBatteryHealth, failedChargingSummary, failedEfficiencySummary],
  );

  const snapshot = React.useMemo<DashboardDataSnapshot>(() => {
    const values = new Map((batch.data?.values ?? []).map((value) => [value.metric, value]));
    const series = new Map((batch.data?.series ?? []).map((entry) => [entry.metric, entry.points]));
    const metrics = new Map<string, DashboardMetricData>();
    for (const metric of new Set([...values.keys(), ...series.keys()])) {
      const value = values.get(metric);
      metrics.set(metric, { ...(value ? { value } : {}), series: series.get(metric) ?? [] });
    }
    return {
    hasProvider: true,
    values,
    series,
    metrics,
    ...(requirements.status && status.data ? { status: status.data } : {}),
    ...(requirements.batteryHealth && batteryHealth.data ? { batteryHealth: batteryHealth.data } : {}),
    ...(requirements.chargingSummary && chargingSummary.data ? { chargingSummary: chargingSummary.data } : {}),
    ...(requirements.efficiencySummary && efficiencySummary.data ? { efficiencySummary: efficiencySummary.data } : {}),
    isRefreshing: batch.isFetching || status.isFetching || batteryHealth.isFetching
      || chargingSummary.isFetching || efficiencySummary.isFetching,
    failed,
    retry,
    };
  }, [
    failed,
    retry,
    batch.data,
    batch.isFetching,
    status.data,
    status.isFetching,
    batteryHealth.data,
    batteryHealth.isFetching,
    chargingSummary.data,
    chargingSummary.isFetching,
    efficiencySummary.data,
    efficiencySummary.isFetching,
    requirements.status,
    requirements.batteryHealth,
    requirements.chargingSummary,
    requirements.efficiencySummary,
  ]);

  store.setSnapshot(snapshot);
  React.useEffect(() => {
    store.notify();
  }, [snapshot, store]);

  return <DashboardDataContext.Provider value={store}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardDataSelector<T>(selector: (snapshot: DashboardDataSnapshot) => T): T | undefined {
  const store = React.useContext(DashboardDataContext);
  const selectorRef = React.useRef(selector);
  selectorRef.current = selector;
  const subscribe = React.useCallback((listener: () => void) => store?.subscribe(listener) ?? (() => {}), [store]);
  const getSnapshot = React.useCallback(
    () => (store ? selectorRef.current(store.getSnapshot()) : undefined),
    [store],
  );
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useDashboardMetric(metric: string | null) {
  return useDashboardDataSelector((snapshot) => metric ? snapshot.metrics.get(metric) : undefined);
}

export function useDashboardDataAvailable() {
  return React.useContext(DashboardDataContext) !== null;
}
