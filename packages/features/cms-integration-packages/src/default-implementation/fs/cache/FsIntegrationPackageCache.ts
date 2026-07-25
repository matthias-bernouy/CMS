import type { ResolvedIntegrationPackage } from "../../../interfaces/source";
import { cleanupAbandonedStaging, removeCacheTree } from "./cleanup";
import { initializeCacheLayout, type IntegrationPackageCacheLayout } from "./paths";
import { publishStagedPackage, validOrMissing } from "./publication";
import type {
    ExpectedIntegrationPackageIdentity,
    FsIntegrationPackageCacheConfig,
    IntegrationPackageCacheEvent,
    MaterializedIntegrationPackage,
} from "./types";
import { IntegrationPackageCacheCorruptionError } from "./types";
import { prepareIntegrationPackage, writeStagedPackage } from "./writing";
import { verifyCachedPackage } from "./verification";

const DEFAULT_STAGING_SAFETY_AGE_MS = 5 * 60 * 1_000;
const DEFAULT_REPAIR_LOCK_WAIT_MS = 5_000;
const DEFAULT_REPAIR_LOCK_STALE_AGE_MS = 5 * 60 * 1_000;

export class FsIntegrationPackageCache {
    private layoutPromise?: Promise<IntegrationPackageCacheLayout>;
    private readonly materializations = new Map<string, Promise<MaterializedIntegrationPackage>>();

    constructor(private readonly config: FsIntegrationPackageCacheConfig) {
        assertDuration("staging safety age", config.stagingSafetyAgeMs, true);
        assertDuration("repair lock wait", config.repairLockWaitMs, true);
        assertDuration("repair lock stale age", config.repairLockStaleAgeMs, false);
    }

    async init(): Promise<void> {
        await this.layout();
    }

    async get(digest: string): Promise<MaterializedIntegrationPackage | null> {
        const startedAt = this.now();
        try {
            const result = await verifyCachedPackage(await this.layout(), digest, this.config.limits);
            this.observe({ type: result ? "hit" : "miss", digest, durationMs: this.now() - startedAt });
            return result;
        } catch (error) {
            if (error instanceof IntegrationPackageCacheCorruptionError) {
                this.observe({ type: "corruption", digest, durationMs: this.now() - startedAt });
            }
            throw error;
        }
    }

    async materialize(
        input: ResolvedIntegrationPackage,
        expected: ExpectedIntegrationPackageIdentity = {},
    ): Promise<MaterializedIntegrationPackage> {
        const prepared = await prepareIntegrationPackage(input, expected, this.config.limits);
        const existing = this.materializations.get(prepared.digest);
        if (existing) {
            return await existing;
        }
        const pending = this.materializePrepared(prepared);
        this.materializations.set(prepared.digest, pending);
        try {
            return await pending;
        } finally {
            if (this.materializations.get(prepared.digest) === pending) {
                this.materializations.delete(prepared.digest);
            }
        }
    }

    private async materializePrepared(input: ResolvedIntegrationPackage): Promise<MaterializedIntegrationPackage> {
        const startedAt = this.now();
        const layout = await this.layout();
        const current = await validOrMissing({ layout, digest: input.digest, limits: this.config.limits });
        if (current) {
            this.observe({ type: "hit", digest: input.digest, durationMs: this.now() - startedAt });
            return current;
        }
        const staging = await writeStagedPackage(layout, input, this.config.limits);
        try {
            const result = await publishStagedPackage({
                layout,
                staging,
                digest: input.digest,
                limits: this.config.limits,
                repairLockWaitMs: this.config.repairLockWaitMs ?? DEFAULT_REPAIR_LOCK_WAIT_MS,
                repairLockStaleAgeMs: this.config.repairLockStaleAgeMs ?? DEFAULT_REPAIR_LOCK_STALE_AGE_MS,
                now: () => this.now(),
            });
            this.observe({
                type: "materialized",
                digest: input.digest,
                kind: input.envelope.kind,
                version: input.envelope.version,
                bytes: input.canonicalBytes.byteLength,
                durationMs: this.now() - startedAt,
            });
            return result;
        } finally {
            await removeCacheTree(layout, staging);
        }
    }

    private async layout(): Promise<IntegrationPackageCacheLayout> {
        this.layoutPromise ??= this.initialize();
        return await this.layoutPromise;
    }

    private async initialize(): Promise<IntegrationPackageCacheLayout> {
        const layout = await initializeCacheLayout(this.config.root);
        await cleanupAbandonedStaging(
            layout,
            this.config.stagingSafetyAgeMs ?? DEFAULT_STAGING_SAFETY_AGE_MS,
            this.now(),
        );
        return layout;
    }

    private observe(event: IntegrationPackageCacheEvent): void {
        this.config.observe?.(event);
    }

    private now(): number {
        return (this.config.now ?? Date.now)();
    }
}

function assertDuration(name: string, value: number | undefined, allowZero: boolean): void {
    if (value === undefined) {
        return;
    }
    if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
        throw new TypeError(`Integration package cache ${name} must be ${allowZero ? "non-negative" : "positive"}`);
    }
}
