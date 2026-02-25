import type { HistoryEntry, Metrics, MetricKey, Regression } from "./types";
import { METRIC_KEYS } from "./types";

const MIN_RUNS_FOR_REGRESSION = 2;

/** Calculate the average value of a metric across history runs. */
function calculateAverage(runs: HistoryEntry["runs"], metric: MetricKey): number | null {
  const values = runs.map((r) => r.metrics[metric]).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Detect regressions by comparing current metrics against rolling average from history. */
export function detectRegressions(
  metrics: Metrics,
  entry: HistoryEntry | undefined,
  thresholdPercent: number,
  windowSize: number = 5,
): Regression[] {
  const runs = entry?.runs ?? [];
  const recent = runs.slice(-windowSize);

  if (recent.length < MIN_RUNS_FOR_REGRESSION) return [];

  const regressions: Regression[] = [];
  for (const metric of METRIC_KEYS) {
    const current = metrics[metric];
    if (current == null) continue;

    const avg = calculateAverage(recent, metric);
    if (avg == null) continue;

    if (current > avg * (1 + thresholdPercent / 100)) {
      regressions.push({
        metric,
        current,
        avg,
        percentChange: avg > 0 ? `${(((current - avg) / avg) * 100).toFixed(1)}%` : "—",
      });
    }
  }

  return regressions;
}
