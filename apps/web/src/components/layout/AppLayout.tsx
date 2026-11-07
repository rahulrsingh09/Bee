import { CredentialRenewalNotice, GitHubReleasesLink } from './UpstreamLayoutNotices';
import React from 'react';
import { getFeedHealthIssue, resolveVehicleOnlineState, shouldEmitFeedHealthToast } from './vehicleConnection';
export { getFeedHealthIssue, resolveVehicleOnlineState, shouldEmitFeedHealthToast } from './vehicleConnection';
import { useNavigate } from '@tanstack/react-router';
import {
  Sidebar,
  StatusBar,
  ThemeToggle,
  AmbientOrbs,
  getBatteryIcon,
  DEFAULT_NAV_ITEMS,
  type NavItem,
} from '@riviamigo/ui/primitives';
import { getUnitSystem } from '@riviamigo/ui/lib/utils';
import {
  useAuth,
  useCurrentVehicleStatus,
  useMe,
  useResolvedVehicleSelection,
  useVehicleStatus,
} from '@riviamigo/hooks';
import { isVehicleCharging } from '@riviamigo/types';
import { BatteryCharging, Loader2, LogOut, Settings, TriangleAlert, UserCog, Wifi, WifiOff } from 'lucide-react';
import { GiRestingVampire } from 'react-icons/gi';
import { TbCarSuv } from 'react-icons/tb';
import { FaTruckPickup } from 'react-icons/fa6';
import { emitToast } from '../feedback/toast';
import { useThemePreferenceController } from '../../hooks/useThemePreferenceController';
import { useGithubReleaseCheck } from '../../hooks/useGithubReleaseCheck';
import {
  getRivianCredentialRenewalNotice,
} from '../../lib/rivianCredentialRenewal';

interface AppLayoutProps {
  children: React.ReactNode;
  activeKey: string;
}

export { RAppLayout as AppLayout } from '../../features/r-experience/RAppLayout';

export function UpstreamAppLayout({ children, activeKey }: AppLayoutProps) {
  const releaseCheck = useGithubReleaseCheck();
  const navigate = useNavigate();
  const accessToken = useAuth((s) => s.accessToken);
  const logout = useAuth((s) => s.logout);
  const { effectiveVehicleId, vehicleSelectionReady, vehicles } = useResolvedVehicleSelection();
  const me = useMe();
  const canAccessUsers = me.data?.role === 'admin' || me.data?.role === 'super_user';
  const liveVehicleId = vehicleSelectionReady ? effectiveVehicleId : null;
  const liveAccessToken = vehicleSelectionReady ? accessToken : null;
  const {
    status: liveStatus,
    connected,
    connectionState,
  } = useVehicleStatus(liveVehicleId, liveAccessToken);
  const { data: currentStatus } = useCurrentVehicleStatus(liveVehicleId);
  const status = currentStatus ?? liveStatus;
  const themeController = useThemePreferenceController();
  const [unitSystem, setUnitSystem] = React.useState(() => getUnitSystem());
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('rm-sidebar-collapsed') === 'true';
  });

  const setPersistedSidebarCollapsed = React.useCallback((nextCollapsed: boolean) => {
    setSidebarCollapsed(nextCollapsed);
    localStorage.setItem('rm-sidebar-collapsed', String(nextCollapsed));
  }, []);

  // Stable reference so both addEventListener and removeEventListener receive the
  // same function identity even if React re-renders between the two calls.
  const handleUnitsChange = React.useCallback(() => {
    setUnitSystem(getUnitSystem());
  }, []);

  const feedHealthIssue = getFeedHealthIssue(currentStatus);
  const renewalNotice = getRivianCredentialRenewalNotice(currentStatus);
  React.useEffect(() => {
    if (!liveVehicleId || !feedHealthIssue || !connected) return;

    const storageKey = `rm-feed-health-toast:${liveVehicleId}:${feedHealthIssue.key}`;
    const emitIfDue = () => {
      if (!shouldEmitFeedHealthToast(localStorage, storageKey)) return;
      emitToast({
        title: feedHealthIssue.title,
        message: feedHealthIssue.message,
        variant: 'error',
      });
    };

    emitIfDue();
    const interval = window.setInterval(emitIfDue, 60_000);
    return () => window.clearInterval(interval);
  }, [
    connected,
    feedHealthIssue?.key,
    feedHealthIssue?.message,
    feedHealthIssue?.title,
    liveVehicleId,
  ]);

  React.useEffect(() => {
    window.addEventListener('rm-units-change', handleUnitsChange as EventListener);
    window.addEventListener('storage', handleUnitsChange);
    return () => {
      window.removeEventListener('rm-units-change', handleUnitsChange as EventListener);
      window.removeEventListener('storage', handleUnitsChange);
    };
  }, [handleUnitsChange]);

  const onlineState = resolveVehicleOnlineState({
    liveVehicleId,
    vehicleSelectionReady,
    connectionState,
    connected,
    feedHealthIssue,
  });
  const compactBatteryLevel =
    typeof status?.battery_level === 'number' ? status.battery_level : undefined;
  const compactIsCharging = isVehicleCharging(status);
  const showCompactBattery = compactBatteryLevel !== undefined && onlineState === 'online';
  const compactBatteryIcon = showCompactBattery
    ? compactIsCharging
      ? { Component: BatteryCharging, variant: 'charging' }
      : getBatteryIcon(compactBatteryLevel)
    : undefined;
  const collapsedFooterRow =
    '-mx-1 grid w-[calc(100%+0.5rem)] grid-cols-[24px_24px] items-center justify-between';
  const collapsedSettingsRow = releaseCheck.updateAvailable
    ? collapsedFooterRow
    : '-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-center';
  const collapsedStatusRow = compactBatteryIcon
    ? collapsedFooterRow
    : 'flex w-full items-center justify-center';
  const collapsedFooterCell = 'flex h-8 w-6 items-center justify-center';
  const sidebarItems = React.useMemo<NavItem[]>(() => {
    const firstVehicleModel = vehicles[0]?.model?.toUpperCase() ?? '';
    const overviewIcon = firstVehicleModel.includes('R1T') ? (
      <FaTruckPickup className="h-[1.125rem] w-[1.125rem]" />
    ) : (
      <TbCarSuv className="h-[1.125rem] w-[1.125rem]" />
    );
    const inBatterySection = activeKey === 'battery' || activeKey.startsWith('battery.');
    return DEFAULT_NAV_ITEMS.map((item) => {
      if (item.key === 'dashboard') {
        return {
          ...item,
          icon: overviewIcon,
        };
      }
      if (item.key !== 'battery' || !inBatterySection) return item;
      return {
        ...item,
        children: [
          {
            key: 'battery.phantom-drain',
            label: 'Parked loss',
            href: '/battery/phantom-drain',
            icon: <GiRestingVampire className="h-3.5 w-3.5" />,
          },
        ],
      };
    }).concat(
      canAccessUsers
        ? [
            {
              key: 'users',
              label: 'Users',
              href: '/users',
              icon: <UserCog className="h-[1.125rem] w-[1.125rem]" />,
              pinToBottom: true,
            },
          ]
        : []
    );
  }, [activeKey, vehicles, canAccessUsers]);

  async function handleLogout() {
    await logout();
    navigate({ to: '/login' });
  }

  return (
    <div className="min-h-screen bg-bg-page text-fg" data-unit-system={unitSystem}>
      <AmbientOrbs />

      <Sidebar
        activeKey={activeKey}
        onNavigate={(href) => navigate({ to: href })}
        items={sidebarItems}
        mobileHeaderSlot={<ThemeToggle mode={themeController.mode} onModeChange={themeController.onModeChange} disabled={themeController.isPending} variant="ghost" className="h-11 w-11" ariaLabel="Theme options" />}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setPersistedSidebarCollapsed}
        bottomSlot={({ collapsed, mobile, closeMobileNavigation }) =>
          mobile ? (
            <div className="flex flex-col gap-3">
              {renewalNotice ? (
                <CredentialRenewalNotice
                  notice={renewalNotice}
                  onClick={() => {
                    navigate({ to: '/settings' });
                    closeMobileNavigation(false);
                  }}
                />
              ) : null}
              <StatusBar
                onlineState={onlineState}
                socPercent={status?.battery_level ?? undefined}
                isCharging={isVehicleCharging(status)}
                rangeEstimateMi={status?.range_miles ?? undefined}
                className="h-12 px-4"
                size="menu"
              />

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    navigate({ to: '/settings' });
                    closeMobileNavigation(false);
                  }}
                  aria-label="Open settings"
                  className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-4 text-sm font-medium text-fg-secondary transition-colors hover:bg-bg-elevated hover:text-fg"
                >
                  <Settings className="h-5 w-5 shrink-0" />
                  <span>Settings</span>
                </button>
                <GitHubReleasesLink
                  size="mobile"
                  updateAvailable={releaseCheck.updateAvailable}
                  currentVersion={releaseCheck.version.data?.version ?? null}
                  latestVersion={releaseCheck.status.latestVersion}
                />
              </div>

              <button
                type="button"
                onClick={async () => {
                  closeMobileNavigation(false);
                  await handleLogout();
                }}
                aria-label="Sign out"
                className="flex h-12 w-full items-center gap-3 rounded-lg px-4 text-sm font-medium text-fg-secondary transition-colors hover:bg-bg-elevated hover:text-fg"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          ) : collapsed ? (
            <div className="flex w-full flex-col gap-2">
              <div className={collapsedStatusRow} data-collapsed-status-row>
                <div
                  className={collapsedFooterCell}
                  title={`Vehicle status: ${
                    onlineState === 'online'
                      ? 'Online'
                      : onlineState === 'connecting'
                        ? 'Reconnecting...'
                        : onlineState === 'unhealthy'
                          ? 'Feed unhealthy'
                          : onlineState === 'error'
                            ? 'Connection failed'
                            : 'Offline'
                  }`}
                  aria-label="Vehicle status"
                >
                  {onlineState === 'connecting' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  ) : onlineState === 'online' ? (
                    <Wifi className="h-4 w-4 text-status-positive" />
                  ) : onlineState === 'unhealthy' ? (
                    <TriangleAlert className="h-4 w-4 text-status-danger" />
                  ) : onlineState === 'error' ? (
                    <WifiOff className="h-4 w-4 text-status-danger" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-fg-tertiary" />
                  )}
                </div>
                <div
                  className={collapsedFooterCell}
                  title={
                    showCompactBattery
                      ? `Battery status: ${Math.round(compactBatteryLevel)}%`
                      : 'Battery status unavailable'
                  }
                  aria-label="Battery status"
                >
                  {compactBatteryIcon && (
                    <compactBatteryIcon.Component
                      className={`h-5 w-5 ${
                        compactBatteryIcon.variant === 'charging'
                          ? 'text-accent'
                          : (compactBatteryLevel ?? 0) > 50
                            ? 'text-status-positive'
                            : (compactBatteryLevel ?? 0) > 20
                              ? 'text-status-warning'
                              : 'text-status-danger'
                      }`}
                      data-battery-icon={`battery-${compactBatteryIcon.variant}`}
                    />
                  )}
                </div>
              </div>

              {renewalNotice ? (
                <CredentialRenewalNotice
                  compact
                  notice={renewalNotice}
                  onClick={() => navigate({ to: '/settings' })}
                />
              ) : null}

              <div className={collapsedSettingsRow}>
                <button
                  type="button"
                  onClick={() => navigate({ to: '/settings' })}
                  title="Settings"
                  aria-label="Open settings"
                  className="flex h-8 w-6 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Settings className="h-4 w-4 shrink-0" />
                </button>
                <GitHubReleasesLink
                  size="collapsed"
                  updateAvailable={releaseCheck.updateAvailable}
                  currentVersion={releaseCheck.version.data?.version ?? null}
                  latestVersion={releaseCheck.status.latestVersion}
                />
              </div>

              <div className={collapsedFooterRow}>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign out"
                  aria-label="Sign out"
                  className="flex h-8 w-6 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-bg-elevated hover:text-fg"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                </button>
                <ThemeToggle mode={themeController.mode} onModeChange={themeController.onModeChange} disabled={themeController.isPending} variant="ghost" className="h-8 w-6" iconClassName="h-5 w-5" ariaLabel="Theme options" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {renewalNotice ? (
                <CredentialRenewalNotice
                  notice={renewalNotice}
                  onClick={() => navigate({ to: '/settings' })}
                />
              ) : null}
              <StatusBar
                onlineState={onlineState}
                socPercent={status?.battery_level ?? undefined}
                isCharging={isVehicleCharging(status)}
                rangeEstimateMi={status?.range_miles ?? undefined}
                compact={collapsed}
              />

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => navigate({ to: '/settings' })}
                  title="Settings"
                  aria-label="Open settings"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-fg-tertiary transition-colors hover:bg-bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">Settings</span>
                </button>
                <GitHubReleasesLink
                  updateAvailable={releaseCheck.updateAvailable}
                  currentVersion={releaseCheck.version.data?.version ?? null}
                  latestVersion={releaseCheck.status.latestVersion}
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign out"
                  aria-label="Sign out"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-fg-tertiary transition-colors hover:bg-bg-elevated hover:text-fg"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">Sign out</span>
                </button>
                <ThemeToggle mode={themeController.mode} onModeChange={themeController.onModeChange} disabled={themeController.isPending} variant="ghost" className="h-8 w-8" ariaLabel="Theme options" />
              </div>
            </div>
          )
        }
      />

      {/* Main content: offset by sidebar width on lg+ */}
      <main
        className={`rm-app-main transition-all duration-200 ${sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-64'}`}
      >
        <div className="rm-app-content p-4 pt-14 sm:p-6 sm:pt-14 lg:p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
