import type { ScheduledTriggerClaimRequest } from "../../../interfaces/ScheduledTrigger";
import { executeScheduledClaim } from "./execute";
import {
    DEFAULT_SCHEDULED_TRIGGER_CLAIM_LIMIT,
    DEFAULT_SCHEDULED_TRIGGER_LEASE_BUFFER_MS,
    DEFAULT_SCHEDULED_TRIGGER_POLL_MS,
    MAX_SCHEDULED_TRIGGER_TIMEOUT_MS,
} from "./limits";
import type {
    ScheduledTriggerLogger,
    ScheduledTriggerRunResult,
    ScheduledTriggerRunner,
    ScheduledTriggerRunnerOptions,
    ScheduledTriggerTimer,
} from "./types";

const DEFAULT_TIMER: ScheduledTriggerTimer = {
    set: (callback, delayMs) => setTimeout(callback, delayMs),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const DEFAULT_LOGGER: ScheduledTriggerLogger = {
    info: (message) => console.info(message),
    warn: (message) => console.warn(message),
    error: (message) => console.error(message),
};

export function startScheduledTriggers(options: ScheduledTriggerRunnerOptions): ScheduledTriggerRunner {
    const timer = options.timer ?? DEFAULT_TIMER;
    const configured = { ...options, logger: options.logger ?? DEFAULT_LOGGER };
    const owner = options.workerId ?? `cms-runtime:${options.randomUUID?.() ?? crypto.randomUUID()}`;
    let stopped = false;
    let handle: unknown;
    let running: Promise<unknown> | undefined;

    const request = (): ScheduledTriggerClaimRequest => {
        return {
            owner,
            now: (options.now ?? (() => new Date()))().toISOString(),
            leaseMs: MAX_SCHEDULED_TRIGGER_TIMEOUT_MS + DEFAULT_SCHEDULED_TRIGGER_LEASE_BUFFER_MS,
            limit: options.claimLimit ?? DEFAULT_SCHEDULED_TRIGGER_CLAIM_LIMIT,
            makeId: options.randomUUID ?? (() => crypto.randomUUID()),
        };
    };

    const schedule = () => {
        if (!stopped) {
            handle = timer.set(() => {
                void tick()
                    .catch((error) => configured.logger.error(`Scheduled trigger polling failed: ${String(error)}`))
                    .finally(schedule);
            }, options.pollMs ?? DEFAULT_SCHEDULED_TRIGGER_POLL_MS);
        }
    };
    const tick = async () => {
        if (running) {
            return running;
        }
        running = options.triggers
            .claimDueScheduledTriggers(request())
            .then((claims) => Promise.all(claims.map((claim) => executeScheduledClaim(configured, claim))));
        try {
            return await running;
        } finally {
            running = undefined;
        }
    };

    const ready = tick().then(() => undefined);
    void ready.then(schedule).catch(() => undefined);
    return {
        ready,
        async runNow(triggerId: string): Promise<ScheduledTriggerRunResult> {
            const trigger = await options.triggers.getTrigger(triggerId);
            if (!trigger) {
                return emptyResult(triggerId, "missing");
            }
            if (trigger.event.kind !== "schedule") {
                return emptyResult(triggerId, "invalid");
            }
            if (!trigger.enabled) {
                return emptyResult(triggerId, "disabled");
            }
            const claim = await options.triggers.claimScheduledTriggerNow(triggerId, request());
            return claim
                ? executeScheduledClaim(configured, claim)
                : emptyResult(triggerId, "already_running", trigger.scheduleState?.running?.runId);
        },
        async stop() {
            stopped = true;
            if (handle !== undefined) {
                timer.clear(handle);
            }
            await running;
        },
    };
}

function emptyResult(
    triggerId: string,
    status: ScheduledTriggerRunResult["status"],
    runId = "",
): ScheduledTriggerRunResult {
    return { triggerId, runId, status, durationMs: 0 };
}
