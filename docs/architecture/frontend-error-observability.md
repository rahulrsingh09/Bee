# Frontend Error Observability

Riviamigo reports actionable browser failures through one local diagnostic seam.
The browser does not send product analytics or diagnostic payloads to a remote
service.

## Diagnostic contract

`@riviamigo/ui/lib/clientDiagnostics` owns `reportClientError()` and the global
browser handlers. Records use stable event names and include only safe context:
area, operation, HTTP status/code, provider, style, resource kind, and request
ID when available. Authorization headers, response bodies, query strings,
vehicle identifiers, and map tile coordinates are redacted.

Repeated reports for the same error are deduplicated for a short interval so a
MapLibre tile failure, transport failure, and React Query failure do not flood
the console. Existing feature-level error states and toasts remain responsible
for user-facing recovery guidance.

## Toast rule

The transport sends a toast only for a mutation failure and for `AUTH_EXPIRED`.
A mutation 404 names the action, for example "Could not save the charge cost".

- `shouldToastFailure()` in `packages/hooks/src/api/transport.ts` applies the
  rule. A `GET`, `HEAD` or `OPTIONS` request is a background read. A read-only
  `POST` (`/v1/metrics/batch`) is also a background read.
- A background read never sends a toast. The component that made the read
  shows the error in its own card, for example "Unable to load chart data."
  and "Retry".
- The session-expired toast shows one time. A new token or sign-in resets it.
- The feed-health alert (`useRConnection`) is a separate toast with a
  15-minute cooldown for each vehicle and reason. It is not a transport toast.
- The diagnostic record is the same for every failure, with or without a toast.
- Queries do not retry on 401, 403, `AUTH_EXPIRED`, 404 or 429. Other failures
  retry up to 2 times (`shouldRetryQuery()` in `apps/web/src/queryClient.ts`).

The toast pattern (roles, 7 s auto-dismiss, merge and the limit of 3) is in
[`docs/branding.md`](../branding.md#toasts).

## Coverage

- `QueryCache` and `MutationCache` report failures after their normal retry
  policy completes.
- The API transport reports normal request failures, network failures, and
  first-party proxy responses that are not successful.
- `TripMapChart` reports MapLibre style and resource errors, including the
  sanitized resource class and provider context.
- The app bootstrap reports uncaught errors, unhandled promise rejections,
  resource-load failures, and CSP violations. The app error boundary records
  render failures and provides a reload action.
- Direct catches are either reported with an operation context or documented as
  expected control flow, such as aborts, logout cleanup, restore restarts,
  optional browser capabilities, and storage fallback.

## Map failure interpretation

`Map configuration unavailable` means the authenticated basemap configuration
request failed. `Map tiles unavailable` means MapLibre received a non-aborted
style or resource error after configuration was available. Expected request
aborts while MapLibre replaces a style do not create an error state. The two paths have separate
retry behavior and separate diagnostic events.

Server-side OpenFreeMap logs use the propagated request ID and record the
provider failure class, upstream status, resource class, cache state, and
duration without logging credentials, response bodies, or tile coordinates.
