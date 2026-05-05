/**
 * In-memory event log shared across the diagnostic agent's pieces. Bundled
 * into the IIFE alongside the rest of the agent — this isn't a singleton
 * across the whole runtime, only within a single inlined script execution.
 */
export type DiagEvent = {
    t:         number;
    type:      string;
    tag?:      string;
    duration?: number;
    extra?:    string;
};

export const events: DiagEvent[] = [];
export const eventDurations: number[] = [];
export const counters = { cls: 0, lcp: null as number | null, longtaskTotalMs: 0 };

export function mark(type: string, tag?: string, duration?: number, extra?: string): void {
    events.push({ t: performance.now(), type, tag, duration, extra });
}
