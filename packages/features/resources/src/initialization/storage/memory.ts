import type { ResourceInitializationStateStore } from "../interfaces";
import type { ResourceInitializationState } from "../schemas";
import { pendingResourceInitialization, parseResourceInitializationState, resourceInitializationError } from "../state";
import { assertInitializationTransition } from "./transition";

/** Explicit disposable preview/test adapter, never an implicit durable fallback. */
export class MemoryResourceInitializationStateStore implements ResourceInitializationStateStore {
    private state: ResourceInitializationState | null = null;
    constructor(
        private readonly instanceId: string,
        private readonly siteId: string,
    ) {
        parseResourceInitializationState(pendingResourceInitialization(instanceId, siteId));
    }
    async initialize(): Promise<void> {
        this.state ??= parseResourceInitializationState(pendingResourceInitialization(this.instanceId, this.siteId));
    }
    async read() {
        return this.state ? parseResourceInitializationState(this.state) : null;
    }
    async replace(input: ResourceInitializationState, expectedRevision: number): Promise<void> {
        if (!this.state) {
            throw resourceInitializationError("Resource initialization is not configured", 409);
        }
        this.state = assertInitializationTransition(this.state, input, expectedRevision);
    }
}
