---
title: Extended Vehicle Telemetry
description: Enable Rivian-reported connectivity, efficiency, mass, and parked-energy readings.
---

# Extended Vehicle Telemetry

Riviamigo runs an integrated, isolated Parallax acquisition subsystem inside each vehicle worker. It adds
privacy-filtered vehicle readings to the compact Connectivity and Signal
Freshness panels at the top of Health, plus a Rivian-reported Parked Energy
breakdown to Phantom Drain.

The subsystem ships as part of the normal API process. It
uses its own WebSocket, persistence path, reconnect loop, health state, and
bounded lease, so failure cannot block canonical vehicle acquisition. Set
`PARALLAX_ENABLED=false` only as an emergency rollback; no separate container
or launcher is required.

The Parked Energy card distinguishes the two available perspectives:

- **Rivian reported:** vehicle-calculated energy attributed to vehicle systems,
  climate, Gear Guard, and outlets.
- **Riviamigo battery-change estimate:** the existing calculation from
  validated parked-session battery and range changes.

The two sources are displayed separately because their windows and measurement
methods differ. Riviamigo does not silently substitute one for the other.

Health keeps the integrated acquisition state visible in the compact top panels, including
never-observed, starting, connected, reconnecting, stale, disabled,
duplicate-owner, and error states. The Health summary includes vehicle Wi-Fi,
unit-aware estimated efficiency, unit-aware vehicle mass, optional cold-weather
impact, and acquisition diagnostics. The Connectivity panel presents
Connectivity as separate Wi-Fi signal, throughput, and Wi-Fi status metrics.
Acquisition is the integrated Parallax subsystem's separate Rivian GraphQL WebSocket state:
Connected means its handshake, subscription, and heartbeat are active, while
Error means its latest token, socket, subscription, or heartbeat attempt
failed and will be retried. A subscription can stay open and still stop
delivering frames. When no frame arrives for 15 minutes, the collector
subscribes again. This also happens while a parked vehicle is quiet, and it
is not an error. Error does not by itself indicate a vehicle fault
or canonical telemetry failure; the Health info tooltip explains this alongside
the latest frame and diagnostic counts.
Legacy charging-session and repair-journal details are not part of that compact
summary. When Parallax acquisition is unavailable,
canonical telemetry and Riviamigo's derived Phantom Drain history continue
normally.

Connectivity collection excludes network names and hardware identifiers.
Values such as mass and learned efficiency are labeled as Rivian estimates,
not independently measured specifications.

## Vehicle state readings and trips

The same allowlisted Parallax subscription requests power, GNSS, odometer,
gear, closures and locks, tire state, and cabin readings for every enrolled vehicle
model. Validated readings join the ordinary vehicle status and telemetry
history. Availability still depends on what that vehicle and Rivian send. A
missing or unrecognized value does not become an inferred state, and Parallax
readings do not start or end charging sessions.

Parallax also reports when a door, gate, frunk, or window is moving. The
vehicle status page then shows **Opening…** or **Closing…** for that closure
until it settles. When Rivian only reports that a closure is ajar, the
direction comes from its last settled state: a closure that was closed is
opening, and one that was open is closing. This motion is live only and is not
stored in telemetry history; the stored value is simply "not closed".

Power state keeps the freshness rule of its source. Parallax reports state when
it changes, so the latest recognized Parallax state stays current until a newer
state arrives. Legacy periodic `vehicleState` power samples are considered
fresh for at most two minutes. When both sources contribute, the newest
accepted sample by source timestamp controls the cached state and its freshness
rule follows that sample's source. Unrecognized power values remain unknown and
do not become sleep or drive decisions.

A Parallax state that is not awake (for example Sleep) stops being current
when the odometer increases at a plausible driving rate, and the increase
began after that state was reported. The power state then becomes unknown
until the vehicle reports a newer one. A delayed non-awake frame observed
before the odometer reading that released the state is not accepted; a delayed
awake frame observed during that movement is. GNSS movement alone does not release the state,
because a parked fix can drift.

When power state is unknown, a trip starts only when the odometer increases by
at least 0.05 miles and the speed is above the moving threshold. Smaller
differences come from unit conversion, not motion. If the first such increase
was at most 15 minutes earlier and no gear shift is known, the trip starts
there, with the reading and battery level from that point. This keeps an R2
drive recorded when the Parallax stream is quiet and the legacy stream reports
only odometer, GNSS, and battery values. Such a trip ends after five stopped
minutes, or when the vehicle reports Sleep.

Trip processing uses the vehicle's direct numeric speed when one is present.
Only when direct speed is absent can shared telemetry fusion estimate speed:
it uses successive plausible GNSS fixes after enough movement is observed, or
an increasing odometer when GNSS has not yet shown movement. The source value
is kept intact; an estimate is not written back as a vehicle-reported speed.
Trip distance starts from the odometer reading at the detected shift into
gear, so early odometer steps are retained. When that backdates the start,
the trip also starts at the shift time and at the last location seen while
parked, so duration, average speed, and start places such as Home match the
distance. A shift more than 15 minutes before the first detected motion is
not used, so a missed drive is not attributed to a later trip. Old fixes, implausible jumps, and
parked odometer readings are excluded from trip detection. Historical replay
does not retain power-source provenance. It treats power-only rows as
change-only frames and richer power rows as periodic telemetry. A legacy
power-only row is indistinguishable, so this remains a replay limitation;
live fusion uses the actual sample source.

## Charging sessions

Riviamigo uses one rule to mark a charging session as AC or DC on every page.
A rate of 20 kW or more is DC, because AC charging cannot go above 19.2 kW.
Home sessions stay AC, and a type that Rivian reports is kept. The R2 sends no
charge power on the canonical stream, so its peak comes from Rivian's own
charging graph, which Parallax sends once a minute. One unusual reading on an
AC session is ignored until a second reading confirms it.

A session ends when the charger reports that it is done or unplugged. When the
vehicle stops reporting charging without such a signal, the session ends at
the last charging reading. A rising state of charge also counts as charging.
The session also ends at that reading when a new odometer reading shows that
the vehicle moved at least 1 mile. Idle or driving time after a charge does not
lengthen the session or change its end state of charge, peak or energy.

The **How it charged** card on a charge page shows the charge power (kW)
against the battery % or, with the **Time** toggle, against minutes. It has one
y-axis. For an R2 it uses Rivian's per-minute graph, so a DC fast charge shows
its climb, peak and taper. On a DC charge with 8 or more measured points, three
phase cards (Climb, Peak, Taper) come from the charge shape insight, with one
sentence for each phase. When 3 or more earlier DC charges have a battery-%
curve, a gray band shows your usual DC curve (p10 to p90). Drag across the
chart, or use the arrow keys, to read the kW, battery % and minute of a point.
With reduced motion, the chart shows its final state at once. The taper
sentence also gives an estimated reason when power changed:

- **Normal taper:** power falls steadily as the battery fills.
- **Charger limit:** power falls and then recovers. A battery does not do this,
  so the charger probably limited the rate, for example by sharing power with
  another car.

Rivian does not send a reason for a slower charge, so the sentence is an
estimate from the curve shape. A charge with no power curve shows one row with
the peak kW when it is known.

### Charge cost

The Cost tile on a charge page shows the price and the rule that set it:
**Billed by Rivian**, **Your home rate** or **Place rate**, **Your price**,
**Free**, **No price** or **Price pending**. When a charge has no price, owners
and managers see **Add the cost of this charge**. **Edit** opens the same box
for any charge.

1. Select **Total paid** or **Rate per kWh**.
2. Enter the amount. The line below shows the other value, for example
   "= 50¢ per kWh for 28.6 kWh" or "= $14.30".
3. Optional: select **Use this rate for my next charges at this charger**. This
   adds a saved place at the charge location with that per-kWh rate, or saves
   the rate to the saved place that holds the charge. A time-of-use plan on
   that place is replaced.
4. Select **Save cost**.

The app saves a rate as a total: rate × the energy added, rounded to cents.
The charge then shows **Your price** with the rate. Per-network rates are not
available.

## Recover a missed drive

Riviamigo compares stored telemetry with recorded trips for the last 7 days.
It replays the stored readings through the same trip detection as live capture.
A drive of at least 1 mile that no trip covers appears on **Vehicle health** as
a **Possible missed drive**, with its time, distance, duration and battery use.
Trips shows a banner that opens it. Drives that ended in the last 15 minutes, or
that are still in progress, are left to live capture.

1. Open **Vehicle health**.
2. Check the time and distance of the missed drive.
3. Select **Recover trip**, then **Confirm recovery**.

Recovery saves one trip from the stored odometer, GPS and battery readings and
links those readings to it, in one database transaction. It never changes or
overlaps a recorded trip. If a trip already covers the drive, nothing is saved
and the app reports that the drive is no longer listed. While a live trip is still being
saved, recovery asks you to try again in a minute. Only owners and managers can
recover; API keys cannot. Recorded speed is not available for such a drive, so
its speed chart uses the GPS estimate. Address, weather and route details fill
in through the normal background enrichment.

**Dismiss** hides the card on that device only. A missed drive also stops
appearing after 7 days. Trips cannot be deleted from the app, so check the drive
before you confirm it.

When Parallax stops sending frames and the odometer later shows movement,
Vehicle health also shows a notice and reports the data connection as
**Partial**. Riviamigo keeps renewing the subscription and records drives from
the odometer meanwhile. No notice appears while Parallax is disabled.

## Investigate missing readings

When a maintainer asks for evidence about a missing reading, record an
**ingestion capture** and share the downloaded file:

1. In **Settings → Raw data → Ingestion capture**, an owner or manager selects
   **Start capture** for the affected non-demo vehicle. Recording starts
   immediately and stops on its own after one hour.
2. Reproduce the problem: open and close the doors, drive, plug in, or wait
   for the update that goes missing. A sleeping vehicle may send nothing.
3. Select **Stop**, then **Download**. The file is named
   `riviamigo-capture-<model>-<start time>.jsonl`, with one JSON object per
   line.
4. Share the file with the maintainer as it is. It is safe to share.

Each vehicle keeps only its most recent capture. Starting a new one replaces
the previous file, and a stopped capture is deleted after 24 hours.

A capture file contains:

- a header line with the app version, vehicle model, capture window, event
  counts by kind, and whether any events were dropped or the 50,000-event limit
  was reached;
- `parallax_envelope`: every Parallax frame with its topic, source timestamp
  and age, decode outcome, whether it reached the canonical worker, the decoded
  values, and the raw payload bytes (except GNSS and network frames). Body
  frames also list each closure or lock position with the field it maps to, or
  `null` when Riviamigo does not know the position;
- `parallax_connection` and `legacy_connection`: subscribe, close, and
  connection-renewal events for both Rivian streams;
- `legacy_frame`: each legacy WebSocket update with every reported field, its
  value, and Rivian's timestamp, so it can be lined up against Parallax;
- `ingestion`: what the worker did with each sample: its source, values,
  whether it was stored or suppressed as a duplicate, the state it implies,
  and whether charge and power lifecycle signals were updated;
- `trip`: the trip detector's power and speed choices, GNSS and odometer
  evidence, start decision, and transition;
- `poll`: each Rivian GraphQL fetch (vehicle-state baseline, vehicle details,
  wallboxes, charge history, charging schedule) with its outcome. The startup
  fetches run when the vehicle's worker starts, so they appear only in a
  capture that spans an API restart. The baseline's fields also appear as a
  `legacy_frame` with message type `baseline`.

Captures never include coordinates, credentials, the VIN, the vehicle ID, or
vehicle and account names. GNSS frames record only that a location was present.

Operators can still follow API output with
`docker compose --env-file .env -f compose/docker-compose.yml logs -f riviamigo`,
but diagnostic detail now goes to the capture rather than the log. See the
[maintainer runbook](../runbooks/r2-ingestion-diagnostics.md) for reading a
capture, and the [API reference](../api-access.md) for the session-only capture
endpoints.
