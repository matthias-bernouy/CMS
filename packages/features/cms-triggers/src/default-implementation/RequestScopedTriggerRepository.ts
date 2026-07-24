import type { TriggerLastRun, TriggerRecord } from "../interfaces/TriggerDefinition";
import type {
    ScheduledTriggerClaim,
    ScheduledTriggerClaimRequest,
    ScheduledTriggerCompletion,
} from "../interfaces/ScheduledTrigger";
import type { TriggerRepository } from "../interfaces/TriggerRepository";

/**
 * Shares trigger definition reads inside one request. Scheduled workers should
 * continue to use their long-lived repository directly.
 */
export class RequestScopedTriggerRepository implements TriggerRepository {
    private readonly triggers = new Map<string, Promise<TriggerRecord | null>>();
    private readonly endpointTriggers = new Map<string, Promise<TriggerRecord[]>>();
    private allTriggers: Promise<TriggerRecord[]> | undefined;
    readonly findEndpointTriggers?: (source: string, endpoint: string) => Promise<TriggerRecord[]>;

    constructor(private readonly inner: TriggerRepository) {
        if (inner.findEndpointTriggers) {
            this.findEndpointTriggers = (source, endpoint) => this.findForEndpoint(source, endpoint);
        }
    }

    async createTrigger(trigger: TriggerRecord): Promise<TriggerRecord> {
        try {
            return structuredClone(await this.inner.createTrigger(trigger));
        } finally {
            this.clear();
        }
    }

    async updateTrigger(trigger: TriggerRecord): Promise<TriggerRecord | null> {
        try {
            return cloneNullable(await this.inner.updateTrigger(trigger));
        } finally {
            this.clear();
        }
    }

    async deleteTrigger(id: string): Promise<boolean> {
        try {
            return await this.inner.deleteTrigger(id);
        } finally {
            this.clear();
        }
    }

    async getTrigger(id: string): Promise<TriggerRecord | null> {
        const trigger = await memoize(this.triggers, id, async () => cloneNullable(await this.inner.getTrigger(id)));
        return cloneNullable(trigger);
    }

    async getAllTriggers(): Promise<TriggerRecord[]> {
        if (!this.allTriggers) {
            const pending = Promise.resolve()
                .then(() => this.inner.getAllTriggers())
                .then((triggers) => structuredClone(triggers));
            this.allTriggers = pending;
            void pending.catch(() => {
                if (this.allTriggers === pending) {
                    this.allTriggers = undefined;
                }
            });
        }
        return structuredClone(await this.allTriggers);
    }

    claimDueScheduledTriggers(request: ScheduledTriggerClaimRequest): Promise<ScheduledTriggerClaim[]> {
        return this.mutate(() => this.inner.claimDueScheduledTriggers(request));
    }

    claimScheduledTriggerNow(id: string, request: ScheduledTriggerClaimRequest): Promise<ScheduledTriggerClaim | null> {
        return this.mutate(() => this.inner.claimScheduledTriggerNow(id, request));
    }

    completeScheduledTrigger(completion: ScheduledTriggerCompletion): Promise<TriggerRecord | null> {
        return this.mutate(() => this.inner.completeScheduledTrigger(completion));
    }

    setEnabled(id: string, enabled: boolean): Promise<TriggerRecord | null> {
        return this.mutate(() => this.inner.setEnabled(id, enabled));
    }

    recordRun(id: string, lastRun: TriggerLastRun): Promise<TriggerRecord | null> {
        return this.mutate(() => this.inner.recordRun(id, lastRun));
    }

    private async findForEndpoint(source: string, endpoint: string): Promise<TriggerRecord[]> {
        const key = JSON.stringify([source, endpoint]);
        const triggers = await memoize(this.endpointTriggers, key, async () =>
            structuredClone(await this.inner.findEndpointTriggers!(source, endpoint)),
        );
        return structuredClone(triggers);
    }

    private async mutate<Value>(operation: () => Promise<Value>): Promise<Value> {
        this.clear();
        try {
            return structuredClone(await operation());
        } finally {
            this.clear();
        }
    }

    private clear(): void {
        this.triggers.clear();
        this.endpointTriggers.clear();
        this.allTriggers = undefined;
    }
}

function memoize<Key, Value>(
    cache: Map<Key, Promise<Value>>,
    key: Key,
    load: () => Value | Promise<Value>,
): Promise<Value> {
    const cached = cache.get(key);
    if (cached) {
        return cached;
    }
    const pending = Promise.resolve().then(load);
    cache.set(key, pending);
    void pending.catch(() => {
        if (cache.get(key) === pending) {
            cache.delete(key);
        }
    });
    return pending;
}

function cloneNullable<Value>(value: Value | null): Value | null {
    return value === null ? null : structuredClone(value);
}
