import type { SourceDiagnosticReporter, SourceRequestDiagnostic } from "cms-sources/interfaces/SourceObservability";

export const MAX_PENDING_SOURCE_DIAGNOSTICS = 256;
export const SOURCE_DIAGNOSTIC_REPORT_TIMEOUT_MS = 1_000;

const MAX_ACTIVE_SOURCE_DIAGNOSTICS = 4;

type PendingDiagnostic = {
    reporter: SourceDiagnosticReporter;
    diagnostic: SourceRequestDiagnostic;
};

type DiagnosticDispatchState = {
    pending: PendingDiagnostic[];
    active: number;
    outstanding: number;
    drainScheduled: boolean;
    disabledReporters: WeakSet<SourceDiagnosticReporter>;
    timedOutDeliveries: WeakMap<SourceDiagnosticReporter, number>;
    totals: { accepted: number; delivered: number; dropped: number; failed: number; timedOut: number };
};

let dispatchState: DiagnosticDispatchState | undefined;

export type SourceDiagnosticDispatchStats = Readonly<DiagnosticDispatchState["totals"]>;

export function enqueueSourceDiagnostic(
    reporter: SourceDiagnosticReporter,
    diagnostic: SourceRequestDiagnostic,
): boolean {
    const state = getDispatchState();
    if (state.disabledReporters.has(reporter) || state.outstanding >= MAX_PENDING_SOURCE_DIAGNOSTICS) {
        noteDrop(state, 1);
        return false;
    }
    state.outstanding += 1;
    state.totals.accepted += 1;
    state.pending.push({ reporter, diagnostic });
    scheduleDrain(state);
    return true;
}

export function sourceDiagnosticDispatchStats(): SourceDiagnosticDispatchStats {
    return { ...getDispatchState().totals };
}

function getDispatchState(): DiagnosticDispatchState {
    dispatchState ??= {
        pending: [],
        active: 0,
        outstanding: 0,
        drainScheduled: false,
        disabledReporters: new WeakSet(),
        timedOutDeliveries: new WeakMap(),
        totals: { accepted: 0, delivered: 0, dropped: 0, failed: 0, timedOut: 0 },
    };
    return dispatchState;
}

function scheduleDrain(state: DiagnosticDispatchState): void {
    if (state.drainScheduled || state.active >= MAX_ACTIVE_SOURCE_DIAGNOSTICS || state.pending.length === 0) {
        return;
    }
    state.drainScheduled = true;
    const timer = setTimeout(() => drain(state), 0);
    timer.unref?.();
}

function drain(state: DiagnosticDispatchState): void {
    state.drainScheduled = false;
    while (state.active < MAX_ACTIVE_SOURCE_DIAGNOSTICS && state.pending.length > 0) {
        const pending = state.pending.shift()!;
        state.active += 1;
        void deliver(state, pending).finally(() => {
            state.active -= 1;
            state.outstanding -= 1;
            scheduleDrain(state);
        });
    }
}

async function deliver(state: DiagnosticDispatchState, pending: PendingDiagnostic): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), SOURCE_DIAGNOSTIC_REPORT_TIMEOUT_MS);
        timer.unref?.();
    });
    const delivery = Promise.resolve()
        .then(() => pending.reporter(pending.diagnostic))
        .then(
            () => "delivered" as const,
            () => "failed" as const,
        );
    const outcome = await Promise.race([delivery, timeout]);
    clearTimeout(timer);
    if (outcome === "delivered") {
        state.totals.delivered += 1;
        return;
    }
    state.totals[outcome === "failed" ? "failed" : "timedOut"] += 1;
    noteDrop(state, 1);
    if (outcome === "timeout") {
        state.timedOutDeliveries.set(pending.reporter, (state.timedOutDeliveries.get(pending.reporter) ?? 0) + 1);
        disableReporter(state, pending.reporter);
        void delivery.then(() => recoverReporter(state, pending.reporter));
    }
}

function disableReporter(state: DiagnosticDispatchState, reporter: SourceDiagnosticReporter): void {
    state.disabledReporters.add(reporter);
    let removed = 0;
    for (let index = state.pending.length - 1; index >= 0; index--) {
        if (state.pending[index]?.reporter === reporter) {
            state.pending.splice(index, 1);
            state.outstanding -= 1;
            removed += 1;
        }
    }
    noteDrop(state, removed);
}

function recoverReporter(state: DiagnosticDispatchState, reporter: SourceDiagnosticReporter): void {
    const remaining = (state.timedOutDeliveries.get(reporter) ?? 1) - 1;
    if (remaining > 0) {
        state.timedOutDeliveries.set(reporter, remaining);
        return;
    }
    state.timedOutDeliveries.delete(reporter);
    state.disabledReporters.delete(reporter);
}

function noteDrop(state: DiagnosticDispatchState, count: number): void {
    if (count <= 0) {
        return;
    }
    const previous = state.totals.dropped;
    state.totals.dropped += count;
    if (previous !== 0 && Math.floor(previous / 64) === Math.floor(state.totals.dropped / 64)) {
        return;
    }
    const timer = setTimeout(() => warnDrop(state.totals.dropped), 0);
    timer.unref?.();
}

function warnDrop(dropped: number): void {
    try {
        console.warn(JSON.stringify({ scope: "cms-sources", kind: "source_diagnostic_drop", dropped }));
    } catch {
        // A diagnostic about lost diagnostics must remain best-effort.
    }
}
