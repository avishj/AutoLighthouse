<div align="center">

# ⚡ AutoLighthouse

**Maximalist Lighthouse CI for GitHub Actions. Zero config. No hosted server.**

[![CI](https://github.com/avishj/AutoLighthouse/actions/workflows/ci.yml/badge.svg)](https://github.com/avishj/AutoLighthouse/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![GitHub Action](https://img.shields.io/badge/action-AutoLighthouse-orange?logo=githubactions&logoColor=white)](https://github.com/marketplace/actions/autolighthouse)

</div>

---

Multi-URL, multi-profile Lighthouse auditing with preset-based thresholds, serverless regression detection, resource budgets, and automatic GitHub Issue lifecycle management. No LHCI server needed.

## Quick Start

```yaml
name: Lighthouse
on:
  push:
    branches: [main]
  schedule:
    - cron: "0 6 * * 1"

jobs:
  audit:
    strategy:
      matrix:
        profile: [mobile, desktop]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: avishj/AutoLighthouse@v1
        with:
          urls: |
            https://example.com
            https://example.com/pricing
          profile: ${{ matrix.profile }}

  report:
    needs: audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: avishj/AutoLighthouse@v1
        with:
          mode: report
```

Two-phase composite action. **Audit** generates a Lighthouse config from your preset + profile, runs [`treosh/lighthouse-ci-action`](https://github.com/treosh/lighthouse-ci-action) (5 runs, median aggregation), and uploads per-profile artifacts. **Report** downloads all artifacts, extracts the 6 core metrics (FCP, LCP, CLS, TBT, SI, TTI), compares against rolling history, posts a step summary, and manages a consolidated GitHub Issue.

Use a matrix strategy to run profiles in parallel, then aggregate in a single report job.

## Inputs

| Input | Default | Description |
|---|---|---|
| `mode` | `audit` | `audit` or `report` |
| `urls` | | Newline-separated URLs (required for audit) |
| `profile` | `mobile` | `mobile`, `tablet`, or `desktop` |
| `preset` | `strict` | `strict`, `moderate`, or `relaxed` |
| `runs` | `5` | Lighthouse runs per URL (median) |
| `regression-threshold` | `10` | % increase over rolling avg to flag regression |
| `consecutive-fail-limit` | `3` | Consecutive failures before persistent alert |
| `fail-on` | `error` | `error`, `warn`, or `never` |
| `budgets` | `true` | `true` for built-in, `false` to disable, or path to custom `budget.json` |
| `create-issues` | `true` | Auto-manage GitHub Issues on failure |
| `upload-artifacts` | `true` | Upload results as workflow artifacts |
| `temporary-public-storage` | `true` | Shareable report links |
| `history-path` | `.lighthouse/history.json` | Regression history path (empty string disables) |
| `cleanup-stale-paths` | `false` | Remove history for URL/profiles no longer audited |
| `stale-path-days` | `30` | Days before stale entries are removed |
| `max-history-runs` | `100` | Max runs kept per URL/profile |
| `github-token` | `${{ github.token }}` | Token for issues and history |

## Outputs

| Output | Description |
|---|---|
| `results` | JSON: per-URL metrics, pass/fail, regressions |
| `regressions` | JSON: detected regressions |
| `has-regressions` | `"true"` / `"false"` for conditional logic |

## Presets

Each preset defines **warn** and **error** tiers across all 4 Lighthouse categories and 6 core metrics. Thresholds scale per-profile (desktop is tighter than mobile).

| | Strict | Moderate | Relaxed |
|---|---|---|---|
| **Performance** (warn / error) | 0.80 / 0.60 | 0.65 / 0.45 | 0.50 / 0.30 |
| **Accessibility** (warn / error) | 0.95 / 0.90 | 0.90 / 0.85 | 0.85 / 0.80 |
| **Best Practices** (warn / error) | 0.95 / 0.90 | 0.90 / 0.85 | 0.85 / 0.80 |
| **SEO** (warn / error) | 0.95 / 0.90 | 0.90 / 0.85 | 0.85 / 0.80 |

*Mobile thresholds shown. Strict uses `lighthouse:all` assertions; moderate and relaxed use `lighthouse:recommended`.*

### Built-in Resource Budgets

On by default. Enforced at `error` level on strict preset.

| Resource | Size Budget | Count Budget |
|---|---|---|
| Total | 700 KB | 30 |
| Script | 350 KB | 10 |
| Stylesheet | 100 KB | |
| Font | 120 KB | 4 |
| Image | 100 KB | |
| Third-party | | 8 |

## Regression Detection

Metrics are tracked in a JSON history file committed to your repo (default: `.lighthouse/history.json`).

- Compares each metric against the **rolling average of the last 5 runs**
- Flags a regression when the current value exceeds the average by more than `regression-threshold` (default 10%)
- Requires at least 2 historical runs before flagging
- Tracks consecutive failures per URL/profile

Disable entirely by setting `history-path` to an empty string.

## Issue Lifecycle

When `create-issues` is enabled:

- **Failure**: opens or comments on a "Lighthouse Performance Alert" issue with assertion failures, regressions, and consecutive failure counts
- **All clear**: comments ✅ and auto-closes the issue
- Labels `lighthouse` and `performance` are auto-created

One consolidated issue per repo. Not per-URL, not per-run.

## License

[AGPL-3.0](LICENSE)

---

<div align="center">

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=avishj/AutoLighthouse&type=Date)](https://star-history.com/#avishj/AutoLighthouse&Date)

</div>
