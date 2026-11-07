# Dependency maintenance runbook

This runbook owns JavaScript, Rust, runtime, service-image, and CI dependency updates.

## Sources of truth

- `config/dependency-baselines.json` records Node, pnpm, Rust, PostgreSQL, TimescaleDB, Redis, Garage, and image baselines.
- `pnpm-workspace.yaml` owns shared JavaScript versions through the default catalog.
- `package.json` pins pnpm and the supported Node range.
- `rust-toolchain.toml` and `apps/api/Cargo.toml` pin Rust and the crate MSRV.
- Dockerfiles and Compose files pin stable patch tags plus multi-architecture manifest digests.

Keep Lucide, Iconify, and React Icons. They serve app-native, dynamic catalog, and specialized icon-family use cases respectively. Recharts, uPlot, and react-grid-layout are also intentional specialized dependencies.

## Routine update sequence

1. Work from a clean worktree and record direct dependency, lockfile, duplicate, bundle, crate, and image-size baselines.
2. Run `pnpm deps:check` before and after changes. Shared dependencies must use `catalog:` and imports must be declared by the package that owns them.
3. Group patch and minor updates. Keep major updates isolated so migrations and rollback are reviewable.
4. Run `pnpm install --frozen-lockfile`, peer checks, typecheck, lint, tests, production build, docs build, and Storybook build.
5. Run Cargo format, Clippy, all-target checks/tests, `cargo tree --duplicates`, SQLx prepare/check, and `cargo audit --deny warnings`. Preserve the raw audit results even when a documented exception applies.
6. Build and scan clean amd64 and arm64 images. Smoke-test development and production fresh installs.
7. For PostgreSQL majors, use dump/restore into a new volume only. Validate a second recovery-package restore before release.
8. Record results in a dated dependency-modernization report under `docs/`.

## Automation policy

Dependabot monitors Cargo, npm, GitHub Actions, Dockerfiles, and Compose. Patch/minor changes are grouped; majors remain separate. CI rejects catalog drift, undeclared/unused dependencies, peer failures, lockfile drift, unsupported runtime references, high/critical npm or Rust advisories, leaked secrets, and fixable high/critical container findings. Unfixed base-image findings stay in Trivy output and require review whenever the pinned base digest changes.

Do not add unbounded advisory exceptions. Any temporary exception needs an owner, upstream link, expiry, and removal condition. `config/dependency-audit-exceptions.json` is the executable register. Native Cargo/pnpm ignore lists must remain empty. The inherited security workflow prints raw JSON before `scripts/check-dependency-audits.mjs` checks exact advisory/package/version, expiry, and npm paths; it rejects unknown findings, scanner failures, and stale exceptions. Both production and development npm dependencies are scanned. A policy pass with exceptions is **not** a clean vulnerability scan.

## Advisory review — 2026-10-05

The [dated dependency review](../dependency-review-2026-10-05.md) records source evidence, reachability, and regression checks. No application API or encrypted-data format changed.

- `age 0.12.1` accepts the published `i18n-embed-fl 0.10.1`, which replaces `proc-macro-error2` with `proc-macro-error3`. The October 1 exception for `RUSTSEC-2026-0173` is removed, not extended.
- npm published `image-size 2.0.3` and `2.0.4` on September 14. The exact `2.0.4` override replaces the incomplete `2.0.2` patch and removes both image-size ignores. The retired patch file contains only a note because the inherited Dockerfile still copies that path; the container owner can remove the COPY and note together. There is no active local package patch.
- The remaining raw results are **one RSA vulnerability** and **two high npm findings** (`braces` and disputed `http-cache-semantics`). All have narrow exceptions below. There are no Cargo informational warnings or other npm findings in the reviewed lockfiles.
- Run `node --test scripts/check-dependency-audits.test.mjs scripts/image-size-security.test.mjs` after a frozen install. Parser tests cover both CommonJS/ESM public buffer and file APIs, including zero/undersized/truncated ICNS, HEIF and JXL data and valid image dimensions.
- Dependency install scripts are restricted to esbuild's binary setup. The unnecessary core-js banner/cache postinstall is explicitly denied. Re-review any change to the allowlist; do not auto-approve newly introduced scripts.

## Release patches — 2026-10-16

The Cargo lockfile updates `quinn-proto` from 0.11.16 to 0.11.18 and `rustls`
from 0.23.45 to 0.23.46. These patch versions address
[RUSTSEC-2026-0338](https://rustsec.org/advisories/RUSTSEC-2026-0338.html)
through RUSTSEC-2026-0342 and
[RUSTSEC-2026-0346](https://rustsec.org/advisories/RUSTSEC-2026-0346.html)
through RUSTSEC-2026-0349, respectively. No advisory exception is added or
extended. The existing RSA exception still applies, so a policy pass must not be
reported as a scan with no findings.

## Release patches — 2026-10-26

New advisories made the unchanged lockfiles fail the release audit. No
application code depends on the changed behaviour.

- Cargo: `tokio` 1.53.0 → 1.54.1, `rustls-webpki` 0.103.14 → 0.103.16,
  `webpki-roots` and `webpki-root-certs` 1.0.9 → 1.0.11, and `ctutils`
  0.4.2 → 0.4.6. These address RUSTSEC-2026-0386, -0382, -0381, -0383 and
  -0385.
- npm catalog: `vite` 8.3.5, `vitest` and `@vitest/coverage-v8` 4.1.12,
  Storybook 10.6.3, and `zod` 4.6.7.
- npm overrides: `body-parser` 1.20.9, `fast-uri` 3.1.9,
  `follow-redirects` 1.16.1, `launch-editor` 2.14.2,
  `serialize-javascript` 7.1.3, `undici` 7.30.1 and `zod` 4.6.7. The exact
  `zod` override also replaces the 4.4.3 copy that lint tools resolved.
- The `braces` exception (GHSA-vfj7-8cjw-p6xm) is removed because the
  advisory is no longer reported.
- Two Cargo advisories have no compatible fix, so they have new bounded
  exceptions; see the register below. A policy pass is still not a clean scan.

## Maintenance register

This register records accepted maintenance debt that is not release-blocking.
Each entry needs an owner, evidence, a due date, and a closure check. Do not
use it to waive a security, privacy, data-integrity, or availability defect.

| Priority | Item                                                                      | Owner               | Evidence and current control                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Due date   | Closure evidence                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3       | RSA vulnerability, private-key operation not reached: `RUSTSEC-2023-0071` | Release maintainer  | Rechecked October 5: the active reverse dependency is `openidconnect 4.0.1` → `rsa 0.9.10`. Provider ID-token verification reaches `RsaPublicKey::verify`, not RSA private-key signing/decryption. Riviamigo's separate private-key operations use AWS-LC. [RustSec still reports no patched version](https://rustsec.org/advisories/RUSTSEC-2023-0071.html); the existing deadline is unchanged.                                                                                                          | 2026-12-31 | Remove the exception when a fixed release exists or RSA is removed. Any new caller/private-key use requires immediate review; rerun raw audit and reverse-tree checks.                             |
| P3       | Timing variability in unused secret paths: `RUSTSEC-2026-0387`            | Release maintainer  | `crypto-bigint 0.5.5` comes through `elliptic-curve 0.13` (P-256/P-384) from `age 0.12.1` and `openidconnect 4.0.1`, the latest releases. Riviamigo uses only age X25519 identities and OIDC client-secret authentication, so the curve code verifies public ID-token signatures only. The fix (0.7.6) needs `elliptic-curve 0.14`.                                                                                                                                                                        | 2026-12-31 | Remove when age and openidconnect move to `elliptic-curve 0.14` or the dependency is removed. An EC private-key operation, an age P-256 recipient, or `private_key_jwt` invalidates the exception. |
| P3       | Unmaintained build-time parser: `RUSTSEC-2026-0374`                       | Release maintainer  | `basic-toml 0.1.10` is used only at compile time by `i18n-config 0.4.8` through age's `i18n-embed-fl` macros, to parse the i18n.toml files bundled in those crates. No vulnerability is reported, and it never parses runtime or user input.                                                                                                                                                                                                                                                               | 2026-12-31 | Remove when i18n-config or age stops depending on it, or when a vulnerability is reported.                                                                                                         |
| P3       | Unmaintained test-only archiver: `RUSTSEC-2026-0440`                     | Release maintainer  | `astral-tokio-tar 0.6.4` is a dev-dependency through `testcontainers 0.27.3`, which packs Docker build contexts in integration tests. No vulnerability is reported. It is not in the release binary and never reads runtime or user input. `testcontainers 0.28.0` still requires it. | 2026-12-31 | Remove when testcontainers stops depending on it, or when a vulnerability is reported.                                                                                                             |
| P3       | Docs build-time merge helper: `GHSA-gcqx-w48m-w2h4`                      | Release maintainer  | `deepmerge 4.3.1` (the latest release, with no fix) is used only while the documentation site builds, through Docusaurus → SVGR → SVGO, to merge options from repository configuration. It does not ship in the web app or API and never merges user input. | 2026-12-31 | Remove when a fixed release is published or SVGR stops depending on it.                                                                                                                            |
| P3       | Asset optimization                                                        | Frontend maintainer | No source-backed performance budget or image/asset optimization evidence is currently recorded. The artwork workflow validates fallback correctness, not total transfer-size optimization.                                                                                                                                                                                                                                                                                                                 | 2026-10-01 | Record a repeatable baseline, optimize the identified assets without visual regression, and attach desktop/mobile verification.                                                                    |
| P3       | Unproven dead exports                                                     | Frontend maintainer | `pnpm deps:check` invokes Knip, but the current repository has no reviewed export-by-export disposition proving all reported candidates are safe to remove.                                                                                                                                                                                                                                                                                                                                                | 2026-10-01 | Attach reviewed Knip output, remove confirmed dead exports with focused tests, and document any intentional public/package exports.                                                                |

Review this register during dependency maintenance and release preparation. If a
date passes without closure, either resolve the entry or explicitly reassess its
priority and risk in a pull request; do not silently extend it.
