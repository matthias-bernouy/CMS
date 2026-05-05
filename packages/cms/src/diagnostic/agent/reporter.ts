import { events, eventDurations, counters } from "./marks";

declare global {
    interface Window {
        __p9rDiag?: {
            events: typeof events;
            vitals: { LCP: number | null; INPp95: number | null; CLS: number; longtaskTotalMs: number };
        };
    }
}

function percentile(arr: number[], p: number): number | null {
    if (arr.length === 0) return null;
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
    return sorted[idx]!;
}

/**
 * Schedule the report dump on `load`. A 250ms tail gives PerformanceObserver
 * a chance to flush late-arriving entries (LCP candidates can land just
 * after `load` fires).
 */
export function scheduleReport(): void {
    addEventListener("load", () => {
        setTimeout(() => {
            const sorted = events.slice().sort((a, b) => a.t - b.t);
            const vitals = {
                LCP:             counters.lcp,
                INPp95:          percentile(eventDurations, 0.95),
                CLS:             Math.round(counters.cls * 1000) / 1000,
                longtaskTotalMs: Math.round(counters.longtaskTotalMs),
            };
            window.__p9rDiag = { events: sorted, vitals };

            console.group(`p9r diag — ${location.pathname}`);
            console.table(sorted.map(e => ({
                t:        Math.round(e.t),
                type:     e.type,
                tag:      e.tag ?? "",
                duration: e.duration !== undefined ? Math.round(e.duration * 100) / 100 : "",
                extra:    e.extra   ?? "",
            })));
            console.log("Web Vitals", vitals);
            console.log("Inspect raw:", "window.__p9rDiag");
            console.groupEnd();
        }, 250);
    });
}
