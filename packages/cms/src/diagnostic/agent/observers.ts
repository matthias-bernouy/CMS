import { mark, eventDurations, counters } from "./marks";

function safeObserve(type: string, cb: (list: PerformanceObserverEntryList) => void, opts: PerformanceObserverInit = {}): void {
    try {
        const po = new PerformanceObserver(cb);
        po.observe({ type, buffered: true, ...opts } as PerformanceObserverInit);
    } catch {
        // Entry type unsupported in this browser — skip silently.
    }
}

/**
 * Wire up every PerformanceObserver the agent needs: LCP, INP-relevant
 * `event` entries (>40ms only — below that the spec's INP can't pick them
 * up anyway), long tasks, layout-shift, and the resource entries for the
 * runtime + bloc bundles + theme stylesheet.
 */
export function startObservers(): void {
    safeObserve("largest-contentful-paint", list => {
        for (const e of list.getEntries()) {
            counters.lcp = e.startTime;
            mark("LCP", undefined, undefined, `size=${(e as any).size}`);
        }
    });

    safeObserve("event", list => {
        for (const e of list.getEntries()) {
            const dur = (e as PerformanceEventTiming).duration;
            eventDurations.push(dur);
            mark("event", (e as any).name, dur, `interaction=${(e as any).interactionId ?? "-"}`);
        }
    }, { durationThreshold: 40 } as PerformanceObserverInit);

    safeObserve("longtask", list => {
        for (const e of list.getEntries()) {
            counters.longtaskTotalMs += e.duration;
            mark("longtask", undefined, e.duration);
        }
    });

    safeObserve("layout-shift", list => {
        for (const e of list.getEntries()) {
            const ls = e as any;
            if (ls.hadRecentInput) continue;
            counters.cls += ls.value;
            mark("layout-shift", undefined, ls.value);
        }
    });

    safeObserve("resource", list => {
        for (const e of list.getEntries()) {
            const r = e as PerformanceResourceTiming;
            if (!/component\.js|\/bloc\?tag=|\/style/.test(r.name)) continue;
            mark("resource", undefined, r.duration, r.name.split("?")[0]!.split("/").pop());
        }
    });
}
