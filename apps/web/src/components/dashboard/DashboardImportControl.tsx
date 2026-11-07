import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { importDashboardYaml, materializeUserDashboardDraft, useCreateDashboard, type DashboardConfig } from '@riviamigo/dashboards';
import { ResponsiveDialog } from '@riviamigo/ui/primitives';
import { Upload } from 'lucide-react';

/** Safe dashboard import: preview first, then create a personal copy. The open dashboard never changes. */
export function DashboardImportControl() {
  const input = React.useRef<HTMLInputElement>(null);
  const titleId = React.useId();
  const create = useCreateDashboard();
  const navigate = useNavigate();
  const [draft, setDraft] = React.useState<DashboardConfig | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const read = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const imported = importDashboardYaml(await file.text());
      setDraft({ ...imported, slug: `${imported.slug}-import-${imported.id.slice(0, 8)}` });
    } catch {
      setError('This file is not a valid dashboard YAML export.');
    }
  };
  const save = async () => {
    if (!draft) return;
    setError(null);
    try {
      const saved = await create.mutateAsync(materializeUserDashboardDraft(draft));
      setDraft(null);
      await navigate({ to: '/d/$slug', params: { slug: saved.slug }, search: { edit: 1, dashboardId: saved.id } });
    } catch {
      setError('The dashboard could not be opened. Check the dashboard library before retrying.');
    }
  };
  return <>
    <label title="Import from YAML" aria-label="Import from YAML"
      className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-border p-1.5 text-fg-tertiary transition-colors hover:bg-bg-elevated hover:text-fg">
      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
      <input ref={input} type="file" accept=".yaml,.yml" className="sr-only" onChange={event => void read(event)} />
    </label>
    {error && !draft && <p role="alert" className="text-sm text-status-danger">{error}</p>}
    {draft && <ResponsiveDialog titleId={titleId} onClose={() => { if (!create.isPending) setDraft(null); }}>
      <div className="grid gap-5 p-6">
        <h2 id={titleId} className="text-xl">Import dashboard</h2>
        <p>{draft.name} · {draft.widgets.length} widgets</p>
        <p className="text-sm text-fg-secondary">Creates a personal copy. Existing dashboards stay unchanged.</p>
        {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
        <div className="flex gap-3">
          <button type="button" disabled={create.isPending} onClick={() => setDraft(null)} className="min-h-11 rounded-xl border border-border px-4">Cancel</button>
          <button type="button" disabled={create.isPending} onClick={() => void save()} className="min-h-11 rounded-xl bg-fg px-4 text-bg">Import copy</button>
        </div>
      </div>
    </ResponsiveDialog>}
  </>;
}
