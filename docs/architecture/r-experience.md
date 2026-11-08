# R experience integration

## Ownership

This private fork exposes R (the approved Option B) as its only interface.
There is no user-facing interface switch. Retained upstream source supports
updates and compatibility tests; it does not allocate another deployed service.
R compiles into the existing web app, not a plugin server or separate host.

`apps/web/src/features/r-experience` owns composition, navigation, settings
discovery, the vehicle stage, motion and scoped CSS. Existing hooks own auth,
account preferences, vehicle selection, cache keys and API transport. Existing
dashboard/settings controllers retain editing, permissions, queries and mutations.
The canonical bundled-chart renderer is unchanged. Only analytics matching the
bundled widget geometry use compact R spacing. Now (`/`) is its own page in
`apps/web/src/features/now`, not a dashboard. Custom dashboard pages and editing
mode retain saved positions and sizes.

| Shared seam | Purpose |
| --- | --- |
| `routes/__root.tsx` | Apply R across routes, authentication and portals |
| `features/r-experience/RAppLayout.tsx` | The four tabs, the active-tab map (`rNavigationTab`) and the top-bar freshness (`rFreshness`) |
| `features/now` | The Now page at `/` |
| `features/insights/InsightsHub.tsx` and `routes/insights.tsx` | The Insights hub at `/insights` |
| `components/layout/AppLayout.tsx` | Export R under the existing layout contract |
| `components/layout/vehicleConnection.ts` | Neutral helpers shared with retained upstream layout |
| `components/dashboard/DashboardPageShell.tsx` | Pass existing state/actions to R composition |
| `components/dashboard/dashboardShellTypes.ts` | Shared types without a module/controller cycle |
| `features/settings/SettingsPage.tsx` | R directory around existing sections and authority |
| Health and chart editor composition | R identity while preserving workflows; `/vehicle-health` renders `RVehicleHealth`, which reuses the status helpers exported by the retained `VehicleHealthPage` |
| `routes/settings.themes.$themeId.tsx` | Redirect retired appearance URLs |
| Card, PageLayout, MetricTabs and WidgetHost attributes | Stable styling hooks |
| `WidgetPresentationProvider` | Scoped vehicle presentation without changing widget definitions, data requirements, saved configuration or canonical charts |
| `packages/ui/src/tokens/globals.css` | R overrides in the canonical token owner |
| `DataPaletteProvider` and `useChartColorPairs` | Fixed R data colors without changing stored account themes or explicit chart colors |
| TripMapChart and trip-detail composition | Optional point inspection; proxy policy unchanged |
| SelectPicker | Shared viewport placement and keyboard dismissal across settings and dashboard menus |

Now uses actual existing vehicle status, trips, charges, parks and insight
rules. Selected-vehicle identity and placeholder checks prevent displaying
another vehicle's cached readings. Missing readings remain unknown, not zero.
The order and the motion rules are in [`docs/branding.md`](../branding.md#now).
Now has no period picker and no dashboard tools. A single vehicle lock icon
(in the Doors tile) reflects the overall `doors_locked` reading, with an
accessible label. Missing or unavailable readings show an unknown icon.
It is not a button or a vehicle command; there is no door/frunk/gate modal,
open count or individual indicator. Do not infer the overall lock state from
individual closure fields.

The bundled Dashboard (`/d/dashboard`) is now a normal custom dashboard page.
Its R2 vehicle widget keeps the stage and compact status summaries, and the
presentation provider also applies inside dashboard copies and editing
previews. Other models retain their model-specific artwork.

Assigned chart catalogs initialize their selection after saved favorites load.
Without a saved favorite, the configured chart is selected and starred by
default. Changing that favorite leaves independently pinned graph cards intact.

The bundled distance sensor uses `trip_miles` as total trip distance instead of
cumulative `total_miles`. View, export and editing use the same saved config.
Import validates existing YAML and creates a uniquely named personal copy
through the existing dashboard API after the user confirms. Unit subscriptions
retain the full preference object so changing efficiency display updates cards,
charts and tables without a reload.

R fixes all series, status, map and drive-mode tokens in both appearance modes.
Its data palette provider selects categorical sensor slots consistently and reads
custom-picker defaults from those same CSS tokens. Stored Classic, RAD and custom
account themes remain compatible but do not select ordinary R chart colors.
Explicit colors saved on individual charts remain intentional overrides.

The daily charging SVG renderer measures its content width before laying out
labels. Phone chart cards reserve space for controls and axes without shrinking
desktop typography. Selected-trip tag controls wrap into a full-width picker and
a separate labeled action row; their existing mutations and permissions are
unchanged.

## Routes and settings

The R shell has four tabs: Now (`/`), Activity (`/trips`), Insights
(`/insights`) and Car (`/vehicle-health`): a bottom bar below 960 px and a left
rail with Settings at the bottom from 960 px. `rNavigationTab()` maps every URL
to one area: trips and a charge detail select Activity; the Insights hub,
`/charging`, Battery and Efficiency select Insights; `/settings`, `/connect` and
`/users` select Settings; everything else selects Car. `/explore`, `/d/<slug>`,
`/admin/dashboards` and `/settings/charts/*` redirect to `/insights`;
`/settings/themes/*` redirects to `/settings`. The first-run steps live on
`/connect` and `/connect/otp`. Release 2 replaces Activity with the merged log and adds the new
Insights pages. The full rules are in
[`docs/branding.md`](../branding.md#r-navigation).
Battery overview and Parked loss share a visible section navigation. Exact
section-route matching prevents the overview link from remaining active on
Parked loss. The Car tab (`RVehicleHealth`) passes `RSettingsEntry` to the
`RAppLayout` `footer` slot, so Settings is a labelled row at the bottom of Car.

System dashboard baseline 9 adds nine pinned charts to the bundled Dashboard, five Battery charts,
four Charging charts and four Efficiency charts. The existing catalog remains
for additional assigned charts. Every original Overview chart type is pinned on
at least one default page. Pinned widgets use a single assigned chart slug with
`showPicker: false`; they keep the effective chart's saved definition and canonical
renderer, ignore favorites for other slugs, and never substitute another chart
when the requested one is unavailable. They are normal, removable widgets, not
managed composition injected into personal layouts.

The canonical JSON defaults and API mirrors remain synchronized. On API startup,
the existing baseline mechanism updates system defaults once; this also replaces
previous administrator edits to those system defaults. Personal dashboards are
not replaced or populated with the new pinned charts. Their existing managed
catalog migration is unchanged. Restore system default uses the same new baseline.
Chart requests remain deferred until close to the viewport and use the existing
query cache; no additional polling, collector or data service is enabled.

Settings retain Vehicles, Dashboards, Charts, Units & time, Places, Charging,
External connections, API access, Jobs, Raw data, Backups, Account and
Authentication. Existing roles determine availability. Map controls move to
Units & time. `?section=appearance` opens Units & time; `/settings/themes/:id`
redirects to the directory. Stored theme records and light/dark preference remain
compatible with upstream, but R overrides the interface palette and exposes no
theme chooser. The R top bar has no light/dark control. Sign out is in
Settings → Account. The running version is the About row in the Settings
directory.

The R route-coverage contract enumerates every registered route, including auth,
focused editors and compatibility URLs. An upstream route addition requires a
coverage decision. Browser tests exercise the normal shell, focused chart
editing, map inspection and authentication separately.

## Artwork and motion

Never show the wrong model as the owner's car (owner decision, 2026-11-07).

- An R2 turns only through the owner's real Rivian account images
  (`vehicle.images`, from Rivian's mobile images). `resolveVehicleArtwork(…).angles`
  returns them in turning order: front, front three-quarter, side, rear
  three-quarter, rear; overhead is excluded. `RVehicleAngles` rests on the side
  image and cross-fades between angles.
- With fewer than 2 owner images, the car is one still image with no turn
  control. Without owner images, the owner's R2 Performance shows the packaged
  Catalina Cove, 21-inch-wheel, black-interior artwork. This is an explicit
  owner configuration, not inferred telemetry.
- The bundled 72-frame rotation pack (3,460,102 bytes) shows an R1S body. It is
  a fallback for other models only and is never shown for an R2. In release 1
  no surface calls the bundled orbit; it is kept as a documented fallback. Its paint tint
  is described in [Vehicle orbit tint](../frontend/vehicle-orbit-tint.md).
- Rivian configurator frames are not bundled. The Rivian terms of use do not
  allow copying them or automated access.
- Health and Settings → Vehicles share `RConfiguredVehicleArtwork`. Other
  vehicles use the existing authenticated artwork resolver and fallback.
  Artwork is presentation, not a live sensor reading.

On Now, the count-up, bar fill, card rise and the 20° car glide run on view,
and not at all with reduced motion. The live charging view reads
`GET /vehicles/{id}/live-session`, the open charge session and its curve. The
live driving view reads the vehicle status (live stream and poll) and, when the
server has it, `GET /vehicles/{id}/active-trip`; without it, the trip so far
comes from the odometer since the last trip. There is no CDN, remote model
request or new animation dependency. Assets use the existing app
origin/security policy. Leaving the viewport, hiding the tab or unmounting
stops motion.

## Security and cost boundaries

Now has no dashboard editing. The Settings dashboard library (Insights →
Custom dashboards) still opens the canonical editor.
Direct edit routes wait for the saved API configuration before creating a draft;
they must not capture the bundled fallback while a saved layout is loading.

Phantom Drain opts into the shared table's responsive row renderer. Mobile cards
use the same sorted row model and page data as the desktop table; desktop column
controls remain intact. Canonical charts still own drain aggregation. Shared
rich charts measure their real width and legend height, and enable touch-only
scrubbing on embedded plots without changing desktop zoom or fullscreen gestures.

The sign-in form reads named fields at submission so browser-filled credentials
cannot diverge from older React state. Password bytes are preserved exactly.
Cloudflare Access and the app's existing password verification remain separate;
this form correction does not reset accounts or change either access policy.

API private-deployment modules, private gateway, database catalog adapter,
origin gate and release guards do not depend on R. R adds no credentials,
endpoints, permissions, migrations, workers, databases or cloud services.
No free-tier policy exception is added.

Retaining source does not allocate another service. Asset transfer still counts
against existing request/egress usage. Rotation is deferred; authenticated
gateway caching is unchanged, so reloads can transfer assets again. This is not
a claim of unlimited free bandwidth. Actual allocation must pass the unchanged
Northflank `free_policy` and billing checks before deployment; a local build does
not prove future billing will stay zero.

## Upstream synchronization

Use the existing fork-upstream-sync, candidate CI and protected promotion path.
Do not use automatic “prefer ours” merge drivers. The sync gate stops when
upstream touches any fork-modified path, even if Git can merge the text. Module
isolation reduces overlap; shared seams still need review.

1. Fetch upstream and identify the exact candidate; skip integrated commits.
2. Inspect overlap at the UI and security seams.
3. Preserve upstream auth, cache scoping, canonical charts and settings behavior.
4. Run build, package/script tests, browser/route coverage, color/dependency and
   security-route checks, plus unchanged deployment guards.
5. Review desktop/mobile, dark/light and failure-path behavior.
6. Promote only through existing protected CI and verified release.

Deployment is a separate action after review. The existing frontend CI job runs the full browser suite, with no new CI job
or deployment resource. The sync and promotion policy is unchanged.
