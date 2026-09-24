/**
 * Wait after operation acceptance. Poll after pollIntervalMs, then at that interval, with a final
 * attempt clamped to timeoutMs. Stop earlier on completion; at most ceil(timeoutMs / pollIntervalMs) polls.
 */
export interface ConformanceCompletion {
    readonly timeoutMs: number;
    readonly pollIntervalMs: number;
}

/** Re-run a successful sync query until its assertions pass; the first attempt is immediate. */
export interface ConformanceEventually {
    readonly maxAttempts: number;
    readonly intervalMs: number;
}

/**
 * Walk pages, applying authored checks to every page. Preserve all input except cursorInput.
 * The required nullable output cursor uses null as the only terminal marker. Fail on a repeated
 * non-null cursor or failure to terminate within maxPages; uniqueBy also forbids duplicate identities
 * within or across pages. These declarations do not execute requests or aggregate captures.
 */
export interface ConformancePagination {
    readonly itemsPath: string;
    readonly cursorPath: string;
    readonly cursorInput: string;
    readonly maxPages: number;
    /** A guaranteed non-null string or integer path relative to each item; empty selects the item. */
    readonly uniqueBy?: string;
}

export interface ConformanceCallControls {
    /** Scenario-local logical key for keyed commands; omission instructs the runner to generate a fresh key. */
    readonly invocationKey?: string;
    /**
     * Reinvoke an earlier successful call with identical target, actor, key and authored input.
     * Assert the same result and, for operations, the same operation ID. Side-effect readback remains
     * a separately authored verification call; matching responses alone do not prove deduplication.
     */
    readonly replayOf?: string;
    /** Required for operation success. An error with completion means a final failure after acceptance;
     * without completion it means the initial operation request was rejected. */
    readonly completion?: ConformanceCompletion;
    readonly eventually?: ConformanceEventually;
    readonly pagination?: ConformancePagination;
}
