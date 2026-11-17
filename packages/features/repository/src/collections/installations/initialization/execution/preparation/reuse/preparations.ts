import type { CollectionRepositorySource } from "repository/collections/sources/interfaces";
import type { CollectionInitializationPlan } from "repository/collections/installations/initialization/interfaces";
import { InitializationArtifacts } from "./artifacts";

/** Cached plans contain no actor, review or authorization decision; fresh state forms their key. */
export class InitializationPreparationCache {
    readonly artifacts = new InitializationArtifacts();
    private readonly plans = new Map<string, { plan: CollectionInitializationPlan; bytes: number }>();
    private bytes = 0;

    stats() {
        return { entries: this.plans.size, bytes: this.bytes };
    }

    source(source: CollectionRepositorySource): CollectionRepositorySource {
        return {
            id: source.id,
            list: (signal) => source.list(signal),
            ...(source.page
                ? {
                      page: (...args: Parameters<NonNullable<CollectionRepositorySource["page"]>>) =>
                          source.page!(...args),
                  }
                : {}),
            getMetadata: async (reference, signal) => {
                signal?.throwIfAborted();
                return this.artifacts.get(reference)?.metadata.release ?? source.getMetadata(reference, signal);
            },
            get: (reference, options) => source.get(reference, options),
        };
    }

    get(key: string | undefined) {
        const entry = key ? this.plans.get(key) : undefined;
        if (!entry || entry.plan.collections.some((pin) => !this.artifacts.get(pin)?.artifact)) {
            return undefined;
        }
        this.plans.delete(key!);
        this.plans.set(key!, entry);
        return entry.plan;
    }

    remember(key: string | undefined, plan: CollectionInitializationPlan) {
        if (!key) {
            return;
        }
        const bytes = new TextEncoder().encode(JSON.stringify(plan)).byteLength;
        if (bytes > 256 * 1024) {
            return;
        }
        const previous = this.plans.get(key);
        if (previous) {
            this.bytes -= previous.bytes;
            this.plans.delete(key);
        }
        while (this.plans.size && (this.plans.size >= 2 || this.bytes + bytes > 512 * 1024)) {
            const oldest = this.plans.keys().next().value!;
            this.bytes -= this.plans.get(oldest)!.bytes;
            this.plans.delete(oldest);
        }
        this.plans.set(key, { plan, bytes });
        this.bytes += bytes;
    }
}
