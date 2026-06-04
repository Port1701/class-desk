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
