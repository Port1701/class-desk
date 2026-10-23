# Agent Decision Log (Append-Only)

This file tracks all significant decisions, implementations, and learnings throughout the project lifecycle.

**Format for each entry:**

```markdown
## YYYY-MM-DD HH:MM PT - Entry Title

**Type:** [Decision | Implementation | Documentation | Bug Fix | Refactor]
**Change:** What was changed/decided
**Context:** User prompt or situation that triggered this
**Rationale:** Why this choice was made
**Alternatives Considered:** Other options (if applicable)
**Impact:** Time/complexity/features affected
**Time Spent:** Actual time investment
**Learnings:** Insights or patterns discovered
```

<!-- New log entries go below this line -->

## 2026-06-04 11:59 PT - Migrate from Dependabot to Renovate

**Type:** Decision
**Change:** Removed `.github/dependabot.yml` (three per-directory npm configs) and added a single root-level `renovate.json`; closed all 16 open Dependabot PRs.
**Context:** User requested replacing Dependabot with Renovate, pattern-matched off the template-claude-nextjs-node repo, and closing all open Dependabot PRs.
**Rationale:** Renovate auto-discovers all package.json files in the monorepo and groups every update (including lockfile maintenance) into a single weekly PR (Mondays 9am ET), versus Dependabot's per-directory configs producing many separate PRs.
**Alternatives Considered:** Keeping Dependabot with tighter grouping — rejected because Dependabot cannot group across directories into one PR.
**Impact:** Dependency-update PR volume drops from ~16 open PRs to 1 grouped PR per cycle.
**Time Spent:** ~10 minutes
**Learnings:** Renovate opened its onboarding "Configure Renovate" PR (#62) as soon as the app saw the repo; it auto-closes once renovate.json lands on main via PR #61.

## 2026-09-02 13:13 PT - Migrate Railway config-as-code to infrastructure as code

**Type:** Decision
**Change:** Replaced `apps/api/railway.json` with `.railway/railway.ts` (Railway IaC via the `railway` npm SDK) declaring the `API` service (Nixpacks builder, root directory `apps/api`, start command, `/health` healthcheck, `ON_FAILURE` restart), the `Redis` database, and every dashboard variable name as `preserve()`. Added `.railway/railway.test.ts` (Vitest, the repo's first test runner) pinning the rendered shape, root scripts `typecheck:iac` (part of `npm run typecheck`), `test`, and `iac:plan`, Biome coverage of `.railway/**`, and un-ignored `.railway/` so the file is committed.
**Context:** Railway deprecated config-as-code; `railway.json` / `railway.toml` stop being read on 2026-12-01, and a service cannot be owned by both systems at once.
**Rationale:** One project-scoped file with a plan/apply diff replaces a per-service file Railway merged silently at deploy time. `nixpacks.toml` stays: the IaC selects the `NIXPACKS` builder, which still reads it. Redis is a `database()` node with the official image on `/data` because that is what the dashboard's "Add Redis" provisions; its volume is not declared because a `volume()` line plans the live volume's region and size to whatever the file says.
**Alternatives Considered:** `railway config migrate` (needs a linked project; this template has no Railway deployment, and the read-only agent guard denies it). The `redis()` helper (provisions railwayapp/redis on /bitnami, a different image and mount than the dashboard's). Declaring the volume (probed: a bare `volume()` plans region and size to null).
**Impact:** No deployed change until an engineer runs `railway link`, `npm run iac:plan`, and `railway config apply`. Root devDependencies gain `railway` and `vitest`.
**Time Spent:** ~1.5 hours
**Learnings:** The CLI evaluates the file as an ES module, so a `"type": "commonjs"` in the nearest package.json breaks planning. Omit means delete for services, domains, and variables, but a `preserve()`d name with no value in Railway plans nothing. Top-level `healthcheck`/`healthcheckTimeout` merge into `deploy`. Verified read-only by planning a scratch copy against a linked sibling project's dev environment; nothing was applied.

## 2026-09-23 14:32 PT - Remove Renovate

**Type:** Decision
**Change:** Deleted root `renovate.json` and removed its entry from the README's project-structure tree.
**Context:** User requested uninstalling Renovate from every repo they had installed it in.
**Impact:** No automated dependency-update PRs. The Renovate GitHub App installation is removed separately in GitHub settings; deleting the config alone does not uninstall the app.

## 2026-10-22 22:37 PT - Safe dependency upgrades for the October 2026 advisories

**Type:** Implementation
**Change:** Patch/minor upgrades to 20 direct dependencies across the root, `apps/api`, and `apps/web` manifests (23 manifest entries; among them next 16.4.2, react/react-dom 19.3.1, express 5.3.0, biome 2.6.2 with its `biome.json` schema), lockfiles refreshed, non-forced `npm audit fix` applied to both apps, and the Node floor raised to 24.22.1 (`engines` in all three manifests and `.nvmrc`).
**Context:** Advisories affecting resolved packages: Next.js (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr, GHSA-p3m5-59mp-jv5r; first patched in 16.4.1), sharp/librsvg (GHSA-wq5f-xc86-pv6w, patched in 0.35.5), follow-redirects (patched in 1.16.1), vite (GHSA-587h-7wmj-h5pm and two siblings, cleared by the resolved 8.3.5), and body-parser (GHSA-v422-hmwv-36x6, patched in 2.3.0). The Node.js 2026-10-21 security release fixes seven CVEs on 24.x in 24.22.1.
**Rationale:** Every in-range fix was taken and no direct dependency crossed a major. Three transitive packages did, pulled in by in-range parents: content-type 1→2 and content-disposition 1→2 (express 5.3.0, body-parser 2.4.0) and eslint-visitor-keys 5 (under @typescript-eslint 8.72.0). `npm audit` moved root 4→0, api 40→31 (10 high), web 26→11 (8 high), with zero criticals left.
**Alternatives Considered:** Forcing the remaining fixes. Each needs a major or overriding an upstream exact pin (`protobufjs@8.0.1` under `@langfuse/otel` → `@opentelemetry/otlp-transformer@0.217.0`; tsc-alias, tailwind 4, eslint-config-next), so they are left as separate changes.
**Impact:** `engines` does not choose the deploy runtime. Vercel takes the latest 24.x; Railway's nixpacks `nodejs_24` takes whatever 24.x its nixpkgs snapshot ships, so confirm 24.22.1 or later in the build log.
**Learnings:** An advisory ID cited by one third-party writeup may not exist in the GitHub Advisory Database or OSV; confirm each ID with `gh api advisories/<GHSA>` before citing it.
