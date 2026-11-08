# Riviamigo Brand And Visual System

## Audience

Frontend contributors and reviewers making shared UI decisions.

## Source Of Truth

This document is the canonical visual system reference for Riviamigo. Update it when reusable patterns, tokens, icon usage, spacing, page composition, or copy conventions change.

## Private fork: R experience

This fork presents **R** as its only interface. The upstream reference below is
retained for synchronization; these R rules take precedence for the running fork.
There is no appearance gallery, Theme Studio entry or interface selector.

- Use the R mark, neutral surfaces and quiet borders. Each tab has one job: Now
  answers "is my car OK", Activity lists what the car did, Insights holds the
  analysis pages, and Car holds vehicle health and Settings. See
  [R navigation](#r-navigation) and [Now](#now).
- Use neutral surfaces, restrained borders and `--r-signal`. Cove teal, lime,
  caliper gold and supporting cool series colors form the fixed R data palette.
  Status colors retain their meaning. R overrides belong in the existing token
  owner, `packages/ui/src/tokens/globals.css`; saved account themes must not change
  automatic chart or sensor colors. Explicit chart-color overrides remain valid.
- R contrast tokens. The R blocks in `globals.css` own these values for both modes:
  - `--rm-border-control` is the edge of every input, select and date-range
    trigger. It is at least 3:1 against page, surface and elevated
    (WCAG 2.2 1.4.11). Do not use `--rm-border-default` as the only edge of a
    control. Cards and dividers can keep `--rm-border-default` because their
    edge is decoration (1.4–1.9:1).
  - Inputs, selects and the date-range trigger use `border.control`
    (`--rm-border-control`). Outside R the value falls back to
    `--rm-border-strong`: `var(--rm-border-control, var(--rm-border-strong))`.
  - `--rm-text-disabled` is at least 4.5:1 on surface and elevated. Also show
    the disabled state with a second cue, for example no hover change and
    `aria-disabled`.
  - `--rm-bg-overlay` is the dialog scrim. Dark mode uses page ink at 72%.
    Light mode uses primary ink at 40%, so the page stays visible below the
    dialog.
  - The focus ring, `--rm-control-focus-ring`, is primary ink and is more than
    15:1 on page and surface.
- Number color rule: show values in primary ink (`--rm-text-primary`). Use
  color only for status dots and chart marks. Do not color a value by its
  sensor, series or tile accent.
- R chart series:
  - `--rm-series-01` to `-04` are signal, cove, water and caliper. AC charging is
    cove (`--rm-charging-ac`) and DC charging is caliper (`--rm-charging-dc`)
    in every chart, legend and dot.
  - Water is lighter and bluer in dark mode and deeper blue in light mode, so
    it is not mistaken for cove. Light-mode signal is a darker green for the
    same reason.
  - `--rm-series-05` to `-16` alternate cool and warm hues at a chroma of at
    least 0.10 (OKLCH). Their lightness is in the validator band, and each
    color is at least 4.5:1 on page and surface, so it can be text or a line.
    Series 05, 06 and 09 are `--rm-chart-violet`, `--rm-chart-rose` and
    `--rm-chart-indigo`.
  - Every adjacent pair from 01 to 16 passes the dataviz palette validator in
    both modes: OKLab ΔE at least 15 for normal vision and at least 8 under
    protan and deutan simulation (Machado 2009). Pairs that are not adjacent
    can be close, so a chart shows a maximum of 4 series and labels them
    directly. A map with more routes uses labels and highlight.
  - When you change a series value, run the validator on series 01–08 and
    01–16 with the R surface (`#101212` dark, `#ffffff` light) before you
    merge.
- Efficiency bars use the chart accent in both layouts; untagged categories
  remain neutral. Column headers, values, distance and speed metadata follow
  the selected units.
- Vehicle artwork in R. Never show the wrong model as the owner's car.
  - An R2 turns only through the owner's real Rivian account images
    (`vehicle.images`), in this order: front, front three-quarter, side, rear
    three-quarter, rear. Overhead and charging images are excluded. The car
    rests on the side image. The images cross-fade from one angle to the next.
    A double-tap or the Home key returns to the side image.
  - With fewer than 2 owner images, the car is one still image with no turn
    control. With no owner image, the R2 shows its packaged Catalina Cove,
    21-inch-wheel artwork as that still image.
  - The bundled 72-frame 360° pack shows an R1S body. It is a fallback for
    other models only, and is never shown for an R2. In release 1 no surface
    calls it; it is kept as a documented fallback. See
    [Vehicle orbit tint](./frontend/vehicle-orbit-tint.md).
  - Rivian configurator frames are not used. The Rivian terms of use do not
    allow copying them into the app.
  - Keep the complete silhouette visible and preserve the image aspect ratio.
    Nothing covers the car: no hint text, no toy buttons, no status chips.
  - The stage subtitle uses the real model, trim and color.
- Settings use grouped full-width rows, in two desktop columns and one mobile
  column. Hover covers the whole row through its divider.
- Light/dark uses the existing account preference and applies to the car stage,
  menus, dialogs, charts and authentication pages. The R top bar has no mode
  control.
- Pointer use leaves no colored focus frame. Keyboard focus and skip navigation
  remain visible; retain existing dialog focus management.
- Page entry takes 220 ms. Reduced motion removes all animation and
  transitions. Do not animate page backgrounds through white.
- On phones, headings and actions form intentional separate rows. When a vehicle
  picker is present, allow the date control onto another row instead of scrolling
  or squeezing the header; retain 44px touch targets. Sensor titles,
  notes and units remain readable without uppercase truncation or numeric halos.
  Charging chart layout uses actual content width, retaining at least 11px labels
  and space for its toolbar. Selected-trip tagging places a full-width picker
  above labeled touch actions.
- Select pickers render above surrounding content, keep a 12px viewport inset,
  flip above the trigger when space below is limited and scroll their options.
  Long option labels wrap. Escape closes the picker before its parent dialog;
  keyboard focus returns to the trigger.
- Preserve canonical charts, settings operations, permissions and map panning.
- Parked loss uses compact summaries and expandable parked-period cards below
  768px. Each card leads with date, duration, battery loss, hourly drain and sleep;
  its details retain the desktop table's readings and unknown-state explanations.
  Search, sorting and pagination remain available. Desktop keeps the table.
  Parked-energy windows occupy a complete row on phones, with three fully visible
  labels and 44px targets.
  External Connections wraps provider names in visible rows; Jobs uses labeled
  mobile rows with its Run action in view instead of a horizontally scrolled table.
- Rich time-series plots measure the actual card width, including below 320px.
  Keep readable axis text; Parked loss uses concise percentage ticks and
  preserves daily loss/session calculations. Embedded plots support touch tap
  and horizontal scrubbing while allowing vertical page scrolling. Tooltips stay
  within the card; wrapping legends reserve their measured height.
- Custom dashboards (`/d/<slug>`) keep their saved geometry and
  constrained-widget scrolling. The dashboard library is in Settings →
  Dashboards; Insights does not link to it. Editing keeps add and
  remove, sizes and options. Dashboard tools keep duplication, export and
  import. An imported dashboard opens as a personal copy after confirmation.
- Multi-trip maps assign colors before filtering selection so a route keeps its
  color when other routes are added or removed. Use sixteen token-based colors,
  numbered route keys with dates and destinations, and a tap-to-highlight action
  that dims other routes without clearing the selection. The key scrolls within
  its own bounded area on mobile. There is no fixed selection cap; colors repeat
  after sixteen routes, so labels and highlighting remain necessary.

### R navigation

- The R shell has four tabs: Now (`/`), Activity, Insights (`/insights`) and
  Car (`/vehicle-health`). In release 1, Activity opens the trips list
  (`/trips`). The phone dock and the desktop pill navigation show the same four
  tabs, each with its icon and its label. Labels are always visible.
- A detail page keeps the tab of the list that opens it:
  - Activity: `/trips`, a trip (`/trips/<id>`) and a charge
    (`/charging/<id>`).
  - Insights: `/insights` and its tabs, `/charging`, the `/battery` and
    `/efficiency` redirects, custom dashboards (`/d/<slug>`) and `/settings/charts`.
  - Car: `/vehicle-health` and the other Settings pages.
- Up to 900 px wide, the tabs are a dock at the bottom of the screen. The dock
  is 66 px tall, at most 410 px wide, and sits above the safe area. Each tab is
  at least 44 px wide and 54 px tall. The page has bottom padding equal to the
  dock height and its offset, so the dock never covers page content. Wider
  screens show the tabs as a pill row in the top bar.
- The top bar shows only the R mark (a link to Now) and the data freshness:
  "Updated 2 min ago", or an amber dot and "No data for 3 h" when telemetry is
  stale. The top bar has no theme, Settings or Sign out icons.
- Insights has five tabs in a one-line segmented control: Cost, Charging,
  Battery, Efficiency and Lifetime (`/insights/<tab>`; `/insights` opens Cost).
  `/battery`, `/battery/phantom-drain` and `/efficiency` redirect to their tab.
  Insights has no custom-dashboard or chart-editor entry. See
  [Insights charts](#insights-charts).
- Settings is a labelled row at the bottom of the Car tab. Sign out is in
  Settings → Account.
- `/explore` redirects to `/insights`. There is no Explore tab.
- The R dock replaces the upstream full-screen navigation sheet that is
  described in [Responsive Control Surfaces](#responsive-control-surfaces).

### Now

Now (`/`) answers "is my car OK". The order is fixed:

1. The status title (`h1`).
2. One line of status chips (lock, plug, charge schedule). The chips are never
   over the car.
3. The car in its own area, turning through the owner's real Rivian images.
   There is no hint text and there are no toy buttons.
4. The Battery % and Range heroes, with the limit bar and "enough for about
   N days". That sentence shows only when its rule fires.
5. The Odometer card, with "This week" and 7 day bars.
6. "Needs a look", only when a rule fires.
7. The Today/Latest rail: the latest drive, charge and park.

Now has no charts, no period picker and no chart picker. Motion runs on the
first view of a session only. It uses transform and opacity only. With reduced
motion, there is no motion.

### Trip detail

- Trip detail is map first. On a phone the map is full width and a summary
  sheet covers its lower edge. At 1024 px and wider, the map and charts are on
  the left and the summary is on the right.
- One sample is shared by the map dot, the replay scrubber and readout, the
  power and elevation charts, and the speed band. Tap or drag on any of them to
  select a sample; the selection stays. Horizontal touch gestures select
  samples and vertical gestures scroll the page.
- Play replays the drive in 10 s and never starts by itself.
- Charts have one axis, and time axes read "0 min, 10 min".
- Temperature, cabin, elevation change, tires and drive mode are one
  Conditions list.
- The elevation chart shows only for a change of more than 100 ft.
- Trip speed, elevation, temperature and pressure follow unit preferences.

See [R integration](./architecture/r-experience.md) for module boundaries.

## Adjacent Docs

- [`./index.md`](./index.md)
- [`./frontend/dashboard-architecture.md`](./frontend/dashboard-architecture.md)
- [`./contributing.md`](./contributing.md)

## Identity

| Item        | Guidance                                        |
| ----------- | ----------------------------------------------- |
| Name        | Riviamigo                                       |
| Tagline     | _Your Rivian, deeply understood._               |
| Personality | Precise, premium, technical                     |
| Visual mood | More instrument cluster than generic SaaS admin |

## Tokens

Token values live in `packages/ui/src/tokens/globals.css`.

Rules:

- Use semantic tokens only.
- Do not add raw hex, named colors, `rgb()`, or arbitrary Tailwind palette colors.
- If a needed color does not exist, add a token first and then use it semantically.
- `scripts/local-ci.mjs` enforces this rule across production web, UI, dashboard,
  and hook code. Its allowlist is limited to token definitions, approved palette
  tables, CSS variable reads, chart token seams, and test fixtures.

## Account-backed appearance and themes

Appearance mode and theme selection are independent account settings. V2 reads
and writes use `/v2/auth/preferences/theme` with an ETag; `/v1/auth/preferences`
continues to project `theme_mode` and the classic/RAD base for compatibility.
The selected value is either a built-in theme ID or an exact, published custom
revision. Publishing a newer revision never silently changes an account's
selection.

Settings → Appearance is the theme-selection surface, with a gallery of built-in
and owned custom themes. Light/Dark/System is also available from the desktop
sidebar (expanded or collapsed) and mobile navigation. The desktop mode
control is icon-only, right-aligned beside Sign out; mobile keeps an icon-only
header shortcut, visible both with navigation closed and inside the open menu. All mode controls update the
same account preference and preserve the selected theme and custom revision.
Footer status, battery percentage, range, Settings, and Sign out share 14px
labels with the same UI font and weight. Status and utility icons share a 16px
box on desktop and a 20px box on mobile. Numeric telemetry uses tabular figures
without switching font families. All connection states use this same sizing.
Theme Studio owns custom interface and chart overrides plus the brand-asset
status surface. Trusted brand-paint editing remains locked until the runtime can apply
validated paint slots to the inherited artwork.
Draft previews are scoped unless the user explicitly enters the visibly labeled,
memory-only full-app preview. No theme state is stored in `localStorage`.
Classic-dark is applied before authentication and after logout/account changes.

`packages/themes` owns the semantic catalog, Classic and RAD definitions,
inheritance validation, all sixteen ordered chart-series slots, legacy aliases,
brand manifests, deterministic generated artifacts, and registry hash. Run
`pnpm themes:generate` after source changes and `pnpm themes:check` in review.
Production components consume semantic tokens; raw colors and named utility
colors are rejected by `pnpm colors:check` outside the documented owner files.

The RAD built-in is app-specific visual direction inspired by Rivian's white,
gold, orange, teal, and green RAD identity. Its saturated gold, vermilion,
teal, and white treatment includes sixteen unrepeated chart-series colors in
each mode. Dark mode uses gold controls on teal surfaces; light mode uses a
near-white canvas with concentrated gold, red-orange, teal, and blue accents.
Its values are accessible Riviamigo choices,
not a claim about exact Rivian brand colors. Both modes cover surfaces, text,
borders, states, charging and drive modes, overlays, shadows, focus treatments,
charts, and maps.
RAD light mode uses `#FCFCFA` for the page, white elevated surfaces, and
`#F8FAF9` for secondary surfaces so gold, red-orange, teal, and blue remain
distinct without tinting the whole interface. Automatic dashboard sensor chips
use stable data-category slots. Energy uses `series-01`, counts use `series-02`,
range and miles use `series-03`, and efficiency uses `series-04`; adjacent cycle
summaries use a later slot when they sit beside a count card;
battery health, degradation, capacity, cost, share, rate, and limit categories
continue through the later series slots in their shared sensor definitions. The
RAD light slots are intentionally vivid: gold, red-orange, teal, and blue lead the
primary dashboard categories. Their light-mode numeric values use a readable
companion derived from the same slot, while icons, sprites, and decorative
borders keep the vivid series color. These are data categories, not status
indicators: Classic keeps automatic sensor chips monochrome, and Success,
Warning, Danger, and Info remain independent semantic tokens.
Ordered series alternate hue families, and consecutive trip routes consume the
six map colors in order before repeating. Explicit route colors still take
precedence.

Chart definitions persist theme-independent tokens or literal light/dark custom
colors. New categorical series use `series-01` through `series-16`; legacy names
remain valid. The shared color field groups theme series in a swatch-bearing
accent picker alongside semantic colors, and opens the controlled ColorPicker
for visual OKLCH authoring plus Hex, RGB, HSL, and
OKLCH inputs. Edited colors persist as deterministic sRGB hex. After sixteen
series, renderers cycle colors and add distinct line/point patterns.

Application brand consumers resolve through the runtime asset snapshot backed by
the theme registry. The generated asset manifest records every variant and its
checksum. RAD masters live in `packages/themes/src/rad-assets.mjs` and generate
self-contained SVG logo, wordmark, compact icon, and small-size favicon assets.
The lettering is outlined; no fonts, raster images, or external files are needed.
`pnpm themes:generate` regenerates them and `pnpm themes:check` detects drift.
Classic retains its original raster-backed artwork. Custom brand-paint editing
remains locked; new geometry alone does not add runtime paint-slot support.
Review RAD artwork at favicon, sidebar, login, and high-resolution sizes.
The documentation site remains static Classic and account-independent.

## Typography

- Display and headings: Space Grotesk
- Body and UI copy: Inter
- Monospace: JetBrains Mono

Common usage:

- Page title: `text-2xl font-bold font-display`
- Section title: `text-base font-semibold`
- Card label: `text-[11px] font-semibold uppercase tracking-widest text-fg-tertiary`
- Body: `text-sm`
- Meta or hint: `text-xs text-fg-tertiary`

## Core Layout Rules

- Preserve shared shell behavior through `PageLayout`, `AppLayout`, and dashboard shell seams.
- Prefer existing primitives and shared dashboard widgets over route-local card systems.
- Keep route files thin; visual composition belongs in components and shared seams, not branching routes.
- Use consistent card radius, padding, and surface hierarchy across pages.
- The Settings page header is “Settings” with the subtitle “Your vehicle, places and account.” The running version is an **About** row below the settings directory: the version (instance name), with “Up to date”, the newer version in the warning color, or the update-check state beneath it. When the update-check state is not known yet, the row shows no subtitle line. Keep it exclusive to Settings and link it to GitHub Releases in a new tab; missing build metadata reads “Unknown version.”

## Icon And Control Rules

- Preserve icon family consistency inside a page and within shared admin/dashboard surfaces.
- Use the full battery glyph for the Battery destination (the Insights row and the Battery pages); reserve level-specific battery glyphs for live status indicators.
- Prefer icon-plus-label patterns already established by shared primitives instead of inventing one-off controls.
- The sidebar footer places the GitHub Releases download icon at the far right of the Settings row, at the Settings icon's size. Keep both icons together when collapsed and in the mobile navigation drawer; preserve touch-sized link targets and visible keyboard focus. The icon renders only while a newer release exists, in the warning color with a rich tooltip showing the current and latest versions; otherwise the footer shows Settings alone.
- Keep control order stable when editing existing flows unless the redesign intentionally updates the documented pattern.
- Text inputs and textareas use the active theme surface for normal, focused, selected, and browser-autofilled values. The caret and selection use the accent token; browser-default autofill colors are not part of the product palette.
- New-password inputs keep their real requirement directly below the field. Start neutral, show unmet requirements while the user types, and use the positive status treatment only once every displayed rule is satisfied; do not make users discover password policy through a failed submission.
- Dashboard toolbar controls use the elevated surface consistently across vehicle selection, efficiency toggles, date-range triggers, and compact leading filters. Keep neighboring controls on the same 44px height, and place page-specific leading actions before vehicle selection.
- Compact Health telemetry uses the same card, line, icon, and efficiency-toggle language as dashboard surfaces. Group the top panel under Connectivity with separate Wi-Fi signal, throughput, and Wi-Fi status metrics; use the shared Material Wi-Fi statusbar icon series, expose numeric dBm and throughput values, and let selected unit preferences control efficiency and mass values.
- Dashboard management rows use matching secondary icon-plus-label buttons for Open, Edit, and Export. Action groups wrap on small screens without shrinking below touch-safe targets; destructive Reset, Delete, and Restore actions remain visually distinct.
- Long-running destructive operations use a confirmation dialog with explicit impact copy and a typed phrase, followed by one viewport-bounded progress surface. Run compatibility or safety preflight before enabling the destructive action and summarize blockers in the dialog. Report byte progress only when measurable and use named phases for server work; keep validation failures, rollback state, and recovery actions visible instead of implying false precision.
- User-facing choice menus use the shared `SelectPicker` surface with a checkmarked selected state, keyboard navigation, and in-app dismissal; native browser select menus are not part of the product UI.
- Boolean settings use the compact shared `Switch` primitive with native button keyboard behavior and `role="switch"`; do not substitute oversized route-local toggles or checkboxes.
- Authentication settings lead with sign-in options (SSO, password login, and automatic SSO), followed by provider connection, account access, and advanced provider options. Show environment ownership where it explains a disabled control; omit repeated saved-state badges. Client-secret replacement or removal stays pending until the form's single Save settings action succeeds.
- Account invitations show the site's available sign-in methods beside the invited email, default to all currently available methods, and explain the selected account policy before the administrator creates the one-time link. Activation shows only methods permitted by the invitation and currently available on the site.
- Chart-assignment badges use the shared tag icon and deterministic token colors. Keep the assignment editor icon-only, chip-height, and immediately adjacent to the badge group; enabled state belongs at the bottom-right of the chart card, apart from ordinary actions.
- Dashboard edit mode uses compact icon controls directly on each widget. Keep edit and move controls visibly present with subdued default contrast, strengthen them on hover/focus/selection, and never make pointer hover the only way to discover or activate them.
- Resizable dashboard widgets use a persistent subtle corner handle in edit mode. Fixed-size widgets use a lock indicator and must not expose a resize hit target.
- Theme selection is an account-backed Settings → Appearance interaction, not a
  shell/sidebar toggle. Keep mode and theme as separate responsive controls,
  show loading/conflict/rollback/error states, and pin custom selections to an
  immutable published revision.

## Responsive Control Surfaces

- Shared control surfaces must be mobile-friendly by default. Validate the real interaction at small-screen breakpoints in the same change.
- On desktop, compact settings surfaces should anchor to their trigger instead of covering unrelated content.
- On mobile, the same shared surface should fall back to a bottom sheet or modal with safe-area padding, clear dismissal, and stacked full-width controls.
- Chart assignment and chart confirmation dialogs are opaque portalled surfaces: constrained dialogs on desktop and full-viewport, safe-area-aware dialogs on mobile. They trap and restore focus, lock background scrolling, keep the heading/actions reachable, and scroll only the choice or content region.
- The chart editor places its wide production preview before a narrower single-column form on desktop and stacks preview before controls on mobile. Section navigation may scroll horizontally, but form content and save actions must remain viewport-reachable.
- The chart editor is curve-first. Its ordinary sections are Basics, Curves, Display, and Advanced; source bindings and raw domain fields are implementation details, not primary navigation. The editor derives a compatible shared domain from the chosen curves, keeps incompatible curves searchable with a plain explanation, and puts uncommon data controls in progressive disclosure inside the affected curve. Every curve uses the same card and offers independent mark, fill, color, axis, order, legend, removal, and data controls; changes must update the production preview immediately.
- Chart settings use one centered, viewport-bounded modal on desktop and mobile. Keep its sections scrollable inside the dialog, keep the header visible, and group display/curve controls and per-axis range controls in collapsible sections. Lay paired numeric range fields out as two distinct columns. Entering Manual range mode seeds empty fields from the chart's currently rendered axis range.
- Upstream layout only (R uses the dock in [R navigation](#r-navigation)): mobile primary navigation is a full-screen sheet, not a scaled-down desktop rail. Keep destination navigation at the top and vehicle/account utilities at the bottom; use an explicit close control, preserve focus on dismissal, and provide at least 44px touch targets (56px for primary destinations).
- In the collapsed desktop sidebar, center the vehicle connection indicator when no live battery indicator is available; use the two-column status layout only when both indicators are present.
- The dashboard editor follows this rule as a bounded bottom panel on mobile and must reserve enough document space to keep widget controls scrollable above it.
- Conditional dashboard previews use a compact labeled segmented control in the shared editor drawer. The selected state uses the existing accent treatment, while both choices remain readable and touch-safe on mobile.
- Compact controls still need touch-safe hit targets, readable labels, and enough spacing for numeric inputs, segmented toggles, and sliders.
- Every interactive element has a hit area of at least 44 × 44 CSS px at 390px and 1280px. Inline text links inside sentences are exempt. `Input`, `SelectPicker` (both sizes), the date-range trigger, search fields, table pagination buttons, and the efficiency toggle are 44px tall. Date picker month buttons and day cells have a 44 px hit area. A control that must stay visually smaller (sensor help icon, table row link, tag count button, trip checkbox) keeps its look and gets the full target from its own `::before` (absolute, centred, no `pointer-events: none`) or, for checkboxes, from a 44px input that draws a 16px box (`TripSelectCheckbox`). Do not use a child element for the hit area; the UX audit counts only the element and its pseudo-elements.
- Reusable settings panels should stay within shared seams such as `packages/ui`, dashboard widgets, or shared shell controls rather than route-local popovers.

## Shared Component Patterns

### Cards

- Standard cards use the existing surface, border, and radius system.
- Prominent cards should still look like part of Riviamigo, not a special-case microsite.
- Compact card badges should use the shared `Badge` primitive instead of ad hoc border pills.
- Only show timeframe badges when the timeframe itself adds meaning. For battery and charging summary cards, omit `Current` labels and use a small `Lifetime` badge only on lifetime-scoped history cards.
- Multi-day time-series axes use concise calendar-date labels with no repeated dates. Preserve exact timestamps in the hover tooltip; only intraday axes show clock times.
- A tile never shows "-". With no value it hides, or shows one short reason or action line (Total Cost: "Add a home price" → Settings → Places). The editor always shows the tile with its reason. Loading is a skeleton line with `aria-busy`. Numbers use primary ink; the series color is only for the icon, sprite and border. Help icons have a 44 × 44 hit area. A tile whose read fails shows "Could not load · Retry" and never hides. The trips and charging tables do the same instead of an empty state.
- In view mode, a hidden sensor tile collapses its grid cell, and an empty chart row takes its own height. The editor keeps the saved size. See `collapseHiddenWidgets` in [Dashboard architecture](./frontend/dashboard-architecture.md).
- Range-scoped sensor cards must display a server-calculated value for the selected dashboard timeframe, never the last point from their background sparkline. Use the shared tooltip trigger beside a compact domain-specific label when a derived value needs a short explanation.

### Charts

- Fixed and assignment-driven dashboard catalogs use one shared chart frame. Overview must retain the same picker, settings, plot spacing, mobile viewer, focus behavior, and production renderer as the same chart on Battery, Charging, Efficiency, or Trips.
- Dashboard sensor sprites and time-series charts use the editor-selected curve color. For sensor cards, the sensor "Accent color" sets the metric icon, sprite, and border. It does not change the number, which stays in primary ink. Automatic returns the card to its theme-assigned slot. Canvas renderers must resolve theme tokens such as `var(--rm-accent)` before drawing.
- The shared display control is **Display filter**, not geometric curve smoothing. Its time-window choices are `Raw`, `15 min`, `1 hr`, `6 hr`, `24 hr`, `3 days`, and `7 days`; sprites default to `24 hr` and dashboard charts to `15 min`. Dashboard filtering and curve smoothness apply to every compatible curve in the active chart. A bar sprite sums its source values into non-overlapping time bins, so activity totals remain truthful while the card is easier to read; `Raw` remains available when individual events matter.
- Eligible line and area views expose **Curve smoothness** with three independently persisted positions: `Straight`, `Gentle` (the default), and `Smooth`. This renderer-only path shaping preserves recorded timestamps, tooltip values, point counts, and null-gap behavior. `Straight` draws hard point-to-point corners. `Gentle` blends halfway from those straight controls toward the shape-preserving curve. `Smooth` uses the full irregular-time-aware curve for the strongest rounded, hilly appearance. Both curved positions keep Bezier handles inside each timestamp segment and cannot rise above or fall below its adjacent recorded values. Bars, scatter, stepped charts, non-smoothable supporting series, and categories bypass smoothing; surfaces without chart settings do not expose the control.
- Ordinary quantitative bars use the shared filled-bar treatment from `CHART_BAR_STYLE`: semantic chart colors, quiet gridlines, consistent width/opacity, and rounded tops where the renderer supports them. Outline-only bars are not the default dashboard treatment.
- "Time at each speed" (trip detail) shows one bar per 10 mph band, in minutes, and one coverage line inside the trip duration ("Speed recorded for 30 of 30 min."). A GPS estimate is named in that line. The Drive Chart displays GPS averages as dots with their averaging windows; its speed series retain missing values in both paths and tooltips independently of power-series gap settings.
- Dense categorical and daily bar charts preserve every mark and full interaction target while adaptively reducing only visible text. X-axis labels use the established chart font, retain the first and last categories when they fit, and choose the densest evenly distributed non-overlapping set with at least 12 px between labels. Bar-value labels are selected by descending value with 6 px collision padding so the most useful values remain visible. Do not aggregate, rotate, truncate, scroll, or narrow the default time range to solve label collisions. Recharts axes default to `preserveStartEnd` with a 40 px minimum tick gap; small specialized categories such as the rotated Speed Histogram may document an exception.
- Every interactive bar chart must expose the date/category and formatted metric value on hover. Stacked bars must also provide a legend and keep hover/click hit-testing on the full bar rather than individual visual segments. Daily charge-session composition clips the full stack to one rounded outer silhouette so its segments remain flush and visually consistent.
- Timeline interval bars follow the same filled-bar treatment and expose the complete bar as a 44px keyboard/touch hit target. Their horizontal position and width always use the interval's actual timestamps. Overlapping intervals are stacked into visual lanes, not summed; reserve a compact bottom band (about 30% of the plot) so interval context does not overpower a primary trend. Hover and focus show the trip route, time, duration, and distance, and Enter/Space activates the trip.
- Keep chart geometry semantically appropriate: daily totals may use one filled series, while daily charge-session composition remains a stacked AC/DC/Unknown view.
- Charging-curve analysis uses dense power-colored evidence points, fading from accent orange at lower power to green at higher power. Its single compact comparison button overlays the chart rather than consuming chart height and cycles a smooth local-regression trend line through Observed, Best observed, and Off; the default is the representative observed regression, a best-observed mode must name its upper-quartile method, and estimated history must remain visibly distinct and excluded from both summaries.
- The charge detail curve ("How it charged") is one line on one kW y-axis, in the charge type color (`--rm-charging-dc` or `--rm-charging-ac`). The x-axis is battery % by default; the **Battery % | Time** toggle morphs the same points between battery % and minutes. On first view the line draws, then the peak marker, the taper shading and the lowest point appear, in that order. Reduced motion shows that final state at once. The usual DC band is a neutral fill behind the line in battery % view only. Phase cards (Climb, Peak, Taper) select one sentence for the story line above the plot. Drag or arrow keys read kW · battery % · minute in a tooltip that stays inside the card. Minutes count from the session start, the same origin as the API `charge_shape` phases and peak, so a first reading after the start sits right of 0 min. A charge with no curve shows one compact row.
- Every charge price shows its method: Billed by Rivian, Your home rate, Place rate, Your price (with the derived ¢/kWh), Free, No price or Price pending. An unpriced charge has an attention-bordered cost box with a **Total paid | Rate per kWh** segmented control, a preview line ("= 50¢ per kWh for 28.6 kWh" or "= $14.30") and one optional checkbox that saves the rate to a saved place at that charger. For an existing place the checkbox reads "Use this rate at <place>", and Save first shows a confirm step: "This sets <place> to <rate>/kWh. Past automatic charges at <place> are priced again with this rate." The Home place and a time-of-use place are not offered; the box says where to change them (Settings → Places). A partial failure (the cost saved, the place rate did not) stays in the box with **Try again** and **Close**. The amount accepts one decimal comma ("14,30") and rejects a thousands comma with a message.
- A pinned dashboard chart is one card: the title and an optional insight sentence are inside the card, above the plot. The card has one "⋯" button (label "Chart options", 44 px hit area) with "Chart settings" and "Full screen". Do not add icon-only buttons next to it. Chart controls keep the global keyboard focus ring; do not remove it with `outline-none` or `ring-0` overrides.
- Chart errors stay in their card: "Unable to load chart data." and "Retry". A chart that still loads after 15 s shows "Still loading · Retry". A chart with no data in the period is a compact empty row (at most 64 px) with the chart name, the reason, and when it shows. A chart failure never shows a toast; see [Toasts](#toasts).
- "Full screen" opens the dashboard chart viewer on every screen size. The expanded viewer is an opaque, safe-area-aware fullscreen surface: its picker and close controls are anchored to opposite viewport edges so they do not consume chart height. They fade after the viewer first becomes available and return on a chart tap or Enter/Space, while the viewer uses a solid accent rotate prompt with large iconography before landscape exploration. The viewer must prevent page scroll, overscroll, and background interaction until it closes.
- Time and numeric charts support horizontal range selection, touch-first pan and pinch exploration in the viewer, and a conditional top-right icon-only reset control that returns to the full range. Categorical charts keep full category/value detail and touch-safe selection rather than simulating a meaningless zoom level.

### Vehicle artwork

- Rivian API artwork remains the primary source. Local model artwork is the final fallback for missing image metadata, protected-image fetch failures, browser image errors, and demo/test vehicles. Packaged fallbacks support R1S, R1T, and R2; the legacy R2S model value resolves to the same R2 artwork while existing `r2s/` asset URLs remain stable. Unsupported models keep the neutral vehicle icon.
- The R2 turn uses the owner's own Rivian image set (`resolveVehicleArtwork(…).angles`: front, front three-quarter, side, rear three-quarter, rear; overhead excluded). It rests on the side image and never uses the bundled 360° frames. Fewer than 2 owner images give one still image. An owner angle that fails to load is dropped; with fewer than 2 angles left, only the side image shows. The bundled orbit (`RVehicleOrbit`) has no caller in release 1 and is kept as a documented fallback for other models; see [Vehicle orbit tint](./frontend/vehicle-orbit-tint.md).
- Resolve every consumer through `resolveVehicleArtwork(images, model, usage)` and render protected sources through `AuthenticatedVehicleArtwork` using its returned `fallback`. Do not hard-code route-local paths or implement a second placement picker.
- Surface priority is part of the contract: Overview uses API overhead then the model overview; Charging uses API side-charging then the model charging composition; Health uses an explicit hero or three-quarter image, plain side, front, then the model health hero; Settings uses API side, model side, then the neutral icon. Local artwork never invents open-door or charging overlays.
- Source renders under `assets/vehicles_generated` are not presentation assets. Regenerate the transparent, normalized files under `apps/web/public/vehicle-images/fallbacks` with `scripts/build_vehicle_fallback_artwork.py`.
- The semantic canvases are stable contracts: `overview` is a 640×1440 portrait overhead image rotated by the shared overview frame; `charging` is a 1200×900 charge-port-end composition with no API crop transform; `health` is a 1600×900 three-quarter hero; `vehicle-card` is a 1200×560 plain side view stored as `side.webp`.
- API and local charging artwork intentionally use different presentation rules. Put fallback-only class and style changes in `fallbackProps` instead of adding model-specific CSS guesses to route code. R1 source crops focus on the front charge port, while the R2 source crop focuses on its rear charge port.
- Keep the transparent canvas and visible bounds consistent across models. Validate changes on both light and dark surfaces and run the artwork build in check mode before review.

### Toasts

The toast container is one permanent `aria-live="polite"` region, so every toast is announced.

- A toast is only for an owner action (save, delete) and for session expiry.
  The feed-health alert in [Runtime Health Indicators](#runtime-health-indicators)
  is the one other toast, with its own cooldown.
- A background read shows its error in its own card.
- Errors use `role=alert`; other toasts use `role=status`.
- Auto-dismiss is 7 s and pauses on hover and focus.
- Duplicates merge and show a count.
- A maximum of 3 toasts are visible.

### Empty, loading, and error states

- Use `<EmptyState>` and `<Skeleton>` from shared primitives when they fit.
- Error states should use the established inline treatment rather than plain text.
- Loading and empty states must match the surrounding page tone and spacing.
- Shared status sensors should not drift between `Needs data`, raw `undefined`, and placeholder dashes. Value tiles follow the tile rule in [Cards](#cards). Status sensors use the blue `Unavailable` chip for never-seen data, and prefer last-known values plus a small `Last updated ...` line when historical data exists.

### Page composition

- Start from shared shell/layout primitives.
- Use ambient decoration sparingly and keep it `aria-hidden`.
- Accent color is for interaction, emphasis, and active state, not decorative noise.

### Documentation site

- `apps/docs` consumes `@riviamigo/ui/tokens/globals.css` directly and maps Docusaurus/Infima variables to the shared semantic tokens. Do not create a documentation-only color palette.
- Keep Space Grotesk headings, Inter body copy, JetBrains Mono code, the orange accent, shared surfaces, borders, radii, shadows, and focus rings aligned with the application.
- Documentation must support light, dark, and system modes through the same token values used by the app. Theme-specific selectors must include Docusaurus's `data-theme` attributes.
- Section landing cards clarify audience and reading order without becoming a separate marketing system. Technical pages remain direct, readable, and content-first.
- Desktop navigation and the mobile drawer expose the same Overview, Getting Started, User Guide, Operations, Development, and Reference structure. At approximately 390px, controls remain touch-safe, search remains reachable, and content never relies on horizontal scrolling.
- Documentation search uses the app tokens for its trigger, detached text-entry field, panel, focus ring, and selected results; the search UI must not fall back to the plugin's default purple palette.
- The documentation site contains no analytics, tracking pixels, cookies, or hosted search service. Production search is generated locally with the static site.

## Copy Tone

- Precise, not marketing-heavy.
- Technical but readable.
- Prefer direct status language over celebratory or vague system messages.
- Respect user unit preferences; never hard-code imperial-only wording.

## Do And Do Not

### Do

- reuse shared primitives before building route-local UI
- update this document when a reusable visual rule changes
- check spacing, icon consistency, control ordering, and state treatments during review

### Do not

- add raw colors
- create one-off visual systems for single pages that should match the rest of the app
- treat “close enough” styling as acceptable when the app already has a documented pattern
## Runtime Health Indicators

Vehicle connection chrome must distinguish browser/API connectivity from the
upstream Rivian telemetry feed. A green **Online** state is valid when the local
live connection is open and the selected vehicle has no collector or
authentication failure. Missing credentials, an unhealthy collector, or a
silent WebSocket feed use the shared danger-tone **Feed unhealthy** state.
Telemetry-age warnings such as an old parked battery or range snapshot remain
informational freshness details and do not imply that the feed is disconnected.

Runtime feed failures also emit an error toast with a 15-minute per-vehicle,
per-reason cooldown. Persistent failures may remind the user after the cooldown,
but status polling and page reloads must not create toast storms. Reauthentication
messages direct the user to **Settings → Vehicles**.

Estimated Rivian credential renewal is advisory chrome, not a feed-health
failure. Within seven days of the 180-day estimate, show a warning-tone action
in the expanded, collapsed, and mobile sidebar while preserving a healthy green
**Online** state when telemetry is working. The vehicle settings card repeats
the estimated date and recommendation beside the existing login-repair action.
Copy must say **estimated**, **renewal**, or **recommended** rather than claiming
that Rivian guarantees an expiration date.

### Telemetry-only fork typography and controls

The fork does not load Google Fonts. Existing font stacks fall back to locally
available/system fonts, keeping the same type scale and design tokens. Schedule
widgets retain their read views and a read-only notice; vehicle-write controls
are unavailable at every viewport width. Artwork uses local cached or packaged
images only.

## Gateway map status

External Connections reflects an enabled deployment-managed map provider without
offering ineffective edit or disable controls. Its request-count field directs
the owner to Cloudflare usage, rather than presenting API counters as map usage.
Other optional services retain their disabled status.

### Overlay ownership and capture confirmation

`ResponsiveDialog` and `SelectPicker` share `OverlayPortal`; selectors inside a
modal keep their menu in that dialog so keyboard focus stays within the active
surface. Replacing an ingestion capture uses the same responsive dialog, with
Cancel focused first and an explicit Start new capture action. Cancelling keeps
the existing capture and restores focus to its trigger.

Trip inspection selects a sample on a tap or horizontal scrub; a vertical touch
scroll preserves the existing shared selection. Comparison keys use the app time
zone and scroll within compact saved widgets without covering the map.

### Copy glossary and trip list

User-facing copy follows the release-1 glossary (one term per meaning).
`tools/forbidden_copy.sh` in the release review folder checks it.

- Battery, not SoC, SOC or State of charge. Show a range as “75% → 68%”, with
  the “→” character, not “->”, “⇨” or an arrow icon.
- Efficiency, not Consumption or “Avg. Eff.”, for mi/kWh and Wh/mi.
- Parked loss, not Phantom drain, as a title. The Parked loss page names
  “Phantom drain” once, as a subtitle above its lead text.
- Live stream, not Parallax. Battery thermal, not HV Thermal. 12 V battery,
  not 12V Health. Software, not Current SW.
- Temperatures read “72 °F” or “22 °C”, with the degree sign.
- A rate-limit error reads “Too many requests. Try again in a minute.”
- Bundled chart series labels, axis units and empty copy are part of the
  chart contract that the API validates. They keep their existing text until
  a data migration changes saved charts.

The trip list opens a trip from the whole row (desktop) or the whole card
(phone). There is no separate details button. A leading checkbox selects a trip
for the map and for tag edits. Numbers use tabular figures in the app font, not
monospace. The Mode chip and column show only for a mode that is not the
default (All-Purpose). Phones show no Rows select; the paging buttons stay.

### Insights charts

Insights cards use one chart kit (`apps/web/src/features/insights/chartKit.tsx`)
and styles scoped with `ri-` (`insights.css`).

- Every chart shows a tooltip on hover or tap. A chart with a table has
  "Show as table". "Expand" opens the chart full screen with its table;
  Escape or Close returns focus to the button.
- Place colors are the dataviz palette: Home blue, Office orange, Other aqua,
  each with a light and a dark step. Battery-level charts use the accent.
- Values in the efficiency unit follow the unit switch (Wh/mi, mi/kWh,
  kWh/100 mi). Trips under 3 mi are left out of efficiency.
- The Places card tags a place Home, Office or Other. The tag applies to every
  charge at the place: it sets the place flags and copies the Home or Office
  rate, then links each charge to the place so the server prices it again.
- The parked-battery card is titled "Parked loss".

### Default analytics

Default analytics use individual, editable chart cards instead of hiding the
entire set behind a picker. Battery, Charging and Efficiency show their
specialized graphs by default. Related cards share a two-column desktop grid
where the chart permits it; mobile stacks full-width cards without scaling down
labels. Keep the optional chart catalog for additional assigned charts. Pinned
chart titles appear once. Now shows no charts.

The single vehicle lock icon (the first Now status chip) reflects the overall
lock reading independently of physical door position. It is not a button and
opens no modal. The shackle turns when a known lock reading changes;
reduced motion makes that change immediate. Unknown readings use the question
icon and an explicit accessible label. There is no door-status modal or
individual closure UI.

On the dashboard vehicle widget, while charging, a restrained highlight
travels across the Battery bar three times when the charging state appears. The percentage, remaining range, charge limit
and estimated completion remain readable throughout. Reduced motion disables
the highlight. A connected cable alone must not trigger the charging animation.
