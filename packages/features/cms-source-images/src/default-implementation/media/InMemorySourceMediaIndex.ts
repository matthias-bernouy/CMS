import { sourceMediaAssetKey } from "../../core/jobs/media/identity";
import type {
    SourceMediaAsset,
    SourceMediaAssetInput,
    SourceMediaCompletedVariant,
    SourceMediaIndex,
} from "../../interfaces/media";

export class InMemorySourceMediaIndex implements SourceMediaIndex {
    private readonly assets = new Map<string, SourceMediaAsset>();

    async upsert(input: SourceMediaAssetInput, now: number): Promise<SourceMediaAsset> {
        const key = await sourceMediaAssetKey(input);
        const previous = this.assets.get(key);
        if (previous?.generation === input.generation) {
            return clone(previous);
        }
        const obsolete = new Set(previous?.obsoleteDerivativeKeys ?? []);
        for (const variant of previous?.completedVariants ?? []) {
            obsolete.add(variant.derivativeKey);
        }
        const asset: SourceMediaAsset = {
            ...clone(input),
            key,
            completedVariants: [],
            obsoleteDerivativeKeys: [...obsolete],
            status: "queued",
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
        };
        this.assets.set(key, asset);
        return clone(asset);
    }

    async get(key: string): Promise<SourceMediaAsset | null> {
        const asset = this.assets.get(key);
        return asset ? clone(asset) : null;
    }

    async remove(key: string): Promise<SourceMediaAsset | null> {
        const asset = this.assets.get(key);
        this.assets.delete(key);
        return asset ? clone(asset) : null;
    }

    markQueued(key: string, generation: string, now: number): Promise<boolean> {
        return this.update(key, generation, { status: "queued", updatedAt: now });
    }

    markProcessing(key: string, generation: string, now: number): Promise<boolean> {
        return this.update(key, generation, { status: "processing", updatedAt: now });
    }

    markReady(
        key: string,
        generation: string,
        variants: readonly SourceMediaCompletedVariant[],
        now: number,
    ): Promise<boolean> {
        return this.update(key, generation, {
            status: "ready",
            completedVariants: clone(variants),
            updatedAt: now,
            error: undefined,
        });
    }

    markFailed(key: string, generation: string, error: string, now: number): Promise<boolean> {
        return this.update(key, generation, { status: "failed", error, updatedAt: now });
    }

    async isCurrent(key: string, generation: string): Promise<boolean> {
        return this.assets.get(key)?.generation === generation;
    }

    async takeObsoleteDerivativeKeys(key: string, generation: string): Promise<readonly string[]> {
        const current = this.assets.get(key);
        if (!current || current.generation !== generation) {
            return [];
        }
        const keys = [...current.obsoleteDerivativeKeys];
        this.assets.set(key, { ...current, obsoleteDerivativeKeys: [] });
        return keys;
    }

    private async update(key: string, generation: string, patch: Partial<SourceMediaAsset>): Promise<boolean> {
        const current = this.assets.get(key);
        if (!current || current.generation !== generation) {
            return false;
        }
        this.assets.set(key, { ...current, ...patch } as SourceMediaAsset);
        return true;
    }
}

function clone<T>(value: T): T {
    return structuredClone(value);
}
