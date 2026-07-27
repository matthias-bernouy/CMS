import {
    garbageCollectFsIntegrationRegistryCandidateObjects,
    type FsIntegrationRegistryCandidateGarbageCollectionResult,
    type GarbageCollectFsIntegrationRegistryCandidateObjectsConfig,
} from "@bernouy/cms-integration-registry/fs";
import type { RepositoryCandidateGarbageCollectionLogEntry } from "../observability/contracts";
import type { RepositoryCandidateRuntimeConfig } from "./config";
import {
    candidateGarbageCollectionElapsed,
    candidateGarbageCollectionErrorCode,
    candidateGarbageCollectionObservation,
} from "./garbageCollectionObservation";

export type CandidateGarbageCollectionPolicy = Pick<
    RepositoryCandidateRuntimeConfig,
    | "candidateGarbageCollectionIntervalMs"
    | "candidateObjectGracePeriodMs"
    | "candidateTerminalRetentionMs"
    | "candidatePruneAuditRetentionMs"
>;

export type CandidateGarbageCollectionSchedule = (
    task: () => Promise<void>,
    delayMs: number,
) => Readonly<{ cancel(): void }>;

export type ProductionCandidateGarbageCollectorConfig = CandidateGarbageCollectionPolicy &
    Readonly<{
        root: string;
        now?: () => Date;
        durationNow?: () => number;
        schedule?: CandidateGarbageCollectionSchedule;
        collect?: (
            config: GarbageCollectFsIntegrationRegistryCandidateObjectsConfig,
        ) => Promise<FsIntegrationRegistryCandidateGarbageCollectionResult>;
        observe?: (entry: RepositoryCandidateGarbageCollectionLogEntry) => void;
    }>;

export class ProductionCandidateGarbageCollector {
    readonly #now: () => Date;
    readonly #durationNow: () => number;
    readonly #schedule: CandidateGarbageCollectionSchedule;
    readonly #collect: NonNullable<ProductionCandidateGarbageCollectorConfig["collect"]>;
    #timer: Readonly<{ cancel(): void }> | undefined;
    #inFlight: Promise<void> | undefined;
    #started = false;
    #stopped = false;

    constructor(private readonly config: ProductionCandidateGarbageCollectorConfig) {
        this.#now = config.now ?? (() => new Date());
        this.#durationNow = config.durationNow ?? Date.now;
        this.#schedule = config.schedule ?? scheduleUnrefTimeout;
        this.#collect = config.collect ?? garbageCollectFsIntegrationRegistryCandidateObjects;
    }

    async start(): Promise<FsIntegrationRegistryCandidateGarbageCollectionResult> {
        if (this.#started) {
            throw new Error("Candidate garbage collection has already started");
        }
        this.#started = true;
        try {
            const result = await this.#run("startup");
            this.#scheduleNext();
            return result;
        } catch (error) {
            this.#stopped = true;
            throw error;
        }
    }

    async stop(): Promise<void> {
        this.#stopped = true;
        this.#timer?.cancel();
        this.#timer = undefined;
        await this.#inFlight;
    }

    #scheduleNext(): void {
        if (this.#stopped) {
            return;
        }
        this.#timer = this.#schedule(async () => {
            this.#timer = undefined;
            const run = this.#run("periodic").then(
                () => undefined,
                () => undefined,
            );
            this.#inFlight = run;
            await run;
            if (this.#inFlight === run) {
                this.#inFlight = undefined;
            }
            this.#scheduleNext();
        }, this.config.candidateGarbageCollectionIntervalMs);
    }

    async #run(trigger: "startup" | "periodic"): Promise<FsIntegrationRegistryCandidateGarbageCollectionResult> {
        const timestamp = this.#now().toISOString();
        const startedAt = this.#durationNow();
        try {
            const result = await this.#collect({
                root: this.config.root,
                now: timestamp,
                gracePeriodMs: this.config.candidateObjectGracePeriodMs,
                terminalRecordGracePeriodMs: this.config.candidateTerminalRetentionMs,
                auditRetentionMs: this.config.candidatePruneAuditRetentionMs,
            });
            this.#observe(
                candidateGarbageCollectionObservation(
                    trigger,
                    timestamp,
                    candidateGarbageCollectionElapsed(this.#durationNow() - startedAt),
                    result,
                ),
            );
            return result;
        } catch (error) {
            this.#observe(
                candidateGarbageCollectionObservation(
                    trigger,
                    timestamp,
                    candidateGarbageCollectionElapsed(this.#durationNow() - startedAt),
                    undefined,
                    candidateGarbageCollectionErrorCode(error),
                ),
            );
            throw error;
        }
    }

    #observe(entry: RepositoryCandidateGarbageCollectionLogEntry): void {
        try {
            this.config.observe?.(entry);
        } catch {
            // Observability must not decide whether garbage collection succeeds.
        }
    }
}

function scheduleUnrefTimeout(task: () => Promise<void>, delayMs: number) {
    const timer = setTimeout(() => void task(), delayMs);
    timer.unref();
    return Object.freeze({ cancel: () => clearTimeout(timer) });
}
