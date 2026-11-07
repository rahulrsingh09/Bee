import React from 'react';
import { createRoute, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import { rootRoute } from './__root';
import {
  useCloneDashboard,
  downloadDashboardYaml,
  importDashboardYaml,
} from '@riviamigo/dashboards';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import { Copy, Download, Upload } from 'lucide-react';
import { DashboardPageShell } from '../components/dashboard/DashboardPageShell';

export const DASHBOARD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const searchSchema = z.object({
  edit: z.literal(1).optional(),
  // Bundled default dashboards use fixed ids such as 00000000-0000-0000-0000-000000000001,
  // which are not RFC 4122 version UUIDs, so accept any 8-4-4-4-12 hex id.
  dashboardId: z.string().regex(DASHBOARD_ID_PATTERN).optional(),
});

export const userDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/d/$slug',
  validateSearch: searchSchema,
  component: UserDashboardPageWrapper,
});

function UserDashboardPageWrapper() {
  return <ProtectedRoute><UserDashboardPage /></ProtectedRoute>;
}

function UserDashboardPage() {
  const { slug } = useParams({ from: '/d/$slug' });
  const search = useSearch({ from: '/d/$slug' });
  const navigate = useNavigate();

  const isEditMode = search.edit === 1;
  const cloneDashboard = useCloneDashboard();

  return (
    <DashboardPageShell
      navKey="dashboard"
      slug={slug}
      dashboardId={search.dashboardId}
      showEfficiencyDisplayToggle
      isEditMode={isEditMode}
      onEditModeChange={(next) => {
        navigate({
          to: '/d/$slug',
          params: { slug },
          search: next
            ? { edit: 1, ...(search.dashboardId ? { dashboardId: search.dashboardId } : {}) }
            : search.dashboardId ? { dashboardId: search.dashboardId } : {},
        });
      }}
      renderActions={(state) => {
        const { activeConfig, setLocalConfig } = state;

        async function handleClone() {
          if (!activeConfig) return;
          const cloned = await cloneDashboard.mutateAsync(activeConfig.id);
          navigate({
            to: '/d/$slug',
            params: { slug: cloned.slug },
            search: { edit: 1, dashboardId: cloned.id },
          });
        }

        async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
          const file = event.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          try {
            const imported = importDashboardYaml(text);
            setLocalConfig(imported);
            navigate({ to: '/d/$slug', params: { slug }, search: { edit: 1 } });
          } catch (err) {
            alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
          }
          event.target.value = '';
        }

        return (
          <>
            <button
              type="button"
              onClick={() => {
                void handleClone();
              }}
              disabled={!activeConfig || cloneDashboard.isPending}
              title="Duplicate dashboard"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:bg-bg-elevated disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </button>

            <button
              type="button"
              onClick={() => {
                if (activeConfig) downloadDashboardYaml(activeConfig);
              }}
              title="Export as YAML"
              aria-label="Export as YAML"
              className="inline-flex min-h-11 min-w-11 items-center justify-center p-1.5 rounded-lg border border-border hover:bg-bg-elevated transition-colors text-fg-tertiary hover:text-fg"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <label
              title="Import from YAML"
              aria-label="Import from YAML"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center p-1.5 rounded-lg border border-border hover:bg-bg-elevated transition-colors text-fg-tertiary hover:text-fg"
            >
              <Upload className="h-3.5 w-3.5" />
              <input type="file" accept=".yaml,.yml" className="sr-only" onChange={(event) => {
                void handleImport(event);
              }} />
            </label>
          </>
        );
      }}
    />
  );
}
