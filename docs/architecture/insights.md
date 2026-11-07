---
title: Insights rules
description: Deterministic insight rules, their gates, and the insights API contract.
---

# Insights rules

Insights are short facts about a drive, a charge, or the vehicle now. Each
insight comes from one fixed rule. No language model makes a number.

- The API runs the rules and returns typed results.
- The front end turns each result into one fixed sentence template.
- A rule returns nothing when its gate is not met. The app shows no guess.

The rules live in `apps/api/src/services/insights.rs`. The route is
`apps/api/src/routes/insights.rs`. The TypeScript contract is
`packages/types/src/insights.ts`, and the hook is `useInsights` in
`packages/hooks/src/useInsights.ts`.

## API

```text
GET /v1/vehicles/{vehicle_id}/insights?scope=now
GET /v1/vehicles/{vehicle_id}/insights?scope=trip:{trip_id}
GET /v1/vehicles/{vehicle_id}/insights?scope=charge:{charge_id}
```

- `scope` is optional. The default is `now`.
- Access: a signed-in member of the vehicle (`require_vehicle_read_access`).
  The route is not on the integration API key allowlist, so an API key gets
  403.
- A trip or charge that does not belong to the vehicle gets 404.
- An unknown scope gets a validation error.
- The route is in the authenticated read rate-limit class.

Response:

```json
{
  "insights": [
    {
      "id": "route_comparison:trip:7b0c…",
      "kind": "route_comparison",
      "severity": "info",
      "values": { "this_mi_per_kwh": 3.3, "usual_mi_per_kwh": 3.0, "pct_diff": 10.0, "rank": 2, "count": 5 },
      "baseline": { "method": "median", "window": "earlier_drives_same_route", "count": 5 },
      "sample_size": 5,
      "evidence": [{ "type": "trip", "id": "7b0c…" }]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Stable id, `{kind}:{scope}`. |
| `kind` | The rule. One kind gives one sentence pattern. |
| `severity` | `info` or `attention`. "Needs a look" uses `attention`. |
| `values` | Rule output. The shape depends on `kind`. Values are not rounded; the front end formats them. |
| `baseline` | How the rule made its comparison value, or `null` when the rule has no baseline. |
| `sample_size` | The number of items the rule used (drives, days, parks, curve points, charges). |
| `evidence` | Links to the data: `trip`, `charge`, `vehicle`, or `parked_period` with id `{start}/{end}` in RFC 3339. |

The `now` scope returns the attention rules first.

## Release 1 rules

| Kind | Scope | Gate | Values | Severity |
|---|---|---|---|---|
| `route_comparison` | trip | 5 or more earlier drives with the same start and end | `this_mi_per_kwh`, `usual_mi_per_kwh` (median), `pct_diff`, `rank`, `count` | info |
| `days_of_range` | now | 14 or more days with data in the last 30 whole local days, and a median above 0 | `range_mi`, `median_daily_mi`, `days`, `days_with_data` | info |
| `high_parked_loss` | now | 7 or more earlier parks; latest loss 2 or more battery points and 2 or more times the median | `loss_pct`, `usual_loss_pct`, `ratio`, `duration_hours`, `started_at`, `ended_at` | attention |
| `charge_shape` | charge | DC charge with 8 or more measured curve points | `peak_kw`, `peak_soc`, `peak_minute`, `low_kw`, `low_soc`, `phases` | info |
| `usual_dc_band` | charge | DC charge and 3 or more earlier DC charges with a battery-% curve | `bands` (p10 to p90 kW per 1% battery), `sessions`, `within_band_pct`, `compared_bins` | info |
| `missing_price` | now | 1 or more charges with no price in the last 90 days | `count`, `window_days` | info |
| `stale_data` | now | No telemetry for more than 6 hours | `hours`, `last_seen_at` | attention |

### Rule details

**Route comparison.** A trip end matches by saved place id. An end without a
saved place matches by coordinates rounded to 3 decimal places (about 110 m).
The rule reads the 200 most recent earlier drives on the route. Efficiency is
`1000 / efficiency_wh_per_mile`. `rank` 1 is the best of `count + 1` drives,
this drive included.

**Days of range.** Range now is the latest `distance_to_empty_mi` in the last
30 days. A day with data has telemetry or a drive. A day with telemetry and no
drive counts as 0 miles. Days use the app time zone. `days` is range now
divided by the median daily miles.

**High parked loss.** The rule uses the validated parked periods of the Parked
page (`fetch_idle_drain_periods`): 6 hours or longer, in the last 90 days, the
100 most recent. The latest period is compared with the median loss of the
earlier periods. `ratio` is `null` when the median loss is 0.

**Charge shape.** The curve source follows the session chart order: telemetry
power when the vehicle sends it, else the recorded Parallax and Rivian points.
The rule does not use the battery-% estimate, because an insight describes
measured power only. Points above 300 kW are ignored. The peak phase is the
unbroken run of points around the peak within 3% of the peak kW. The climb
phase is before it and the taper phase is after it. `low_kw` is the lowest
power at or after the peak. A recorded point with no battery % gets one
interpolated by time between the session start and end battery %.

**Usual DC band.** The rule reads the 12 most recent earlier DC charges. Each
charge gives a mean kW for each whole battery percent. A battery percent shows
in `bands` only when 3 or more charges cover it. `within_band_pct` is the share
of this charge's battery percents that are inside p10 to p90.

**Missing price.** A charge has no price when its `cost_method` is `unknown`,
or when an older row has no method and no cost. Evidence lists the 50 most
recent such charges; `count` is the full number.

**Stale data.** The rule reads the latest telemetry timestamp. A vehicle with
no telemetry gets no insight.

## Add a rule

1. Write the rule as a pure function on plain inputs in `services/insights.rs`.
   Return `None` when the gate is not met.
2. Add a unit test with a pass case and a gate-not-met case.
3. Add a loader that reads data with a runtime `sqlx::query` and calls the rule.
4. Add the kind and its values type to `packages/types/src/insights.ts`.
5. Add the rule to the table on this page.
