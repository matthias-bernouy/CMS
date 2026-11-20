import { statistics } from "../../harness/measurements/statistics";
import type { Reading } from "../client/reader";
import type { ScenarioId } from "../plan";

export type Sample = Reading & {
    scenario: ScenarioId;
    phase: string;
    epoch: number;
    measured: boolean;
    work?: unknown;
};
export type Finding = { scenario: ScenarioId | "preparation" | "cleanup"; code: string; detail: string };

/** Failed timed attempts remain in latency distributions; priming and preparation never enter them. */
export function summarize(samples: readonly Sample[]) {
    const groups = new Map<string, Sample[]>();
    for (const sample of samples.filter((row) => row.measured)) {
        const key = `${sample.scenario}:${sample.phase}`;
        groups.set(key, [...(groups.get(key) ?? []), sample]);
    }
    return [...groups].map(([id, rows]) => {
        const timing = (field: "headersMs" | "firstByteMs" | "totalMs") => {
            const values = rows.map((row) => row[field]).filter((value): value is number => value !== null);
            return values.length ? statistics(values) : null;
        };
        return {
            id,
            attempts: rows.length,
            failures: rows.filter((row) => row.failure || row.status !== 200).length,
            cache: Object.fromEntries(
                [...new Set(rows.map((row) => row.cache))].map((cache) => [
                    String(cache),
                    rows.filter((row) => row.cache === cache).length,
                ]),
            ),
            headersMs: timing("headersMs"),
            firstByteMs: timing("firstByteMs"),
            totalMs: timing("totalMs"),
            p95Evidence:
                rows.length < 20
                    ? "Small sample: descriptive percentile, not a stable P95 estimate"
                    : "Shared-host diagnostic; no isolated-runner regression claim",
        };
    });
}
export function stylePaths(html: string, origin: string) {
    return [
        ...new Set(
            [...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/giu)]
                .filter(([tag]) => /\brel="stylesheet"/iu.test(tag))
                .map(([, href]) => new URL(href!.replaceAll("&amp;", "&"), origin))
                .filter((url) => url.origin === origin && url.pathname.startsWith("/_content/"))
                .map((url) => url.pathname + url.search),
        ),
    ];
}
