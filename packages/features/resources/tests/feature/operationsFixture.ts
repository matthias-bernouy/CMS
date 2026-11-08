import type {
    ProviderOperationAdapter,
    ProviderOperationInvocation,
    ProviderOperationRegistration,
} from "@bernouy/ulvia-sdk/provider";
import type { ResourceOperationState } from "../../src/application/feature";

/** Explicit nonpersistent test adapter; production must inject its durable operation executor. */
export class TestResourceOperations implements ProviderOperationAdapter {
    private readonly registrations = new Map<string, ProviderOperationRegistration>();
    private readonly jobs = new Map<
        string,
        {
            invocation: ProviderOperationInvocation;
            handle: { operationId: string };
            state: ResourceOperationState;
            result?: unknown;
        }
    >();
    receiptLookups = 0;
    register(operation: ProviderOperationRegistration) {
        this.registrations.set(operation.capabilityId, operation);
    }
    async enqueue(invocation: ProviderOperationInvocation) {
        this.receiptLookups++;
        const key = JSON.stringify([
            invocation.instanceId,
            invocation.siteId,
            invocation.release.contractId,
            invocation.release.version,
            invocation.capabilityId,
            invocation.key,
        ]);
        const existing = this.jobs.get(key);
        if (existing) {
            return existing.handle;
        }
        const handle = { operationId: crypto.randomUUID() };
        this.jobs.set(key, {
            invocation,
            handle,
            state: { operationId: handle.operationId, operationStatus: "queued", errorMessage: "" },
        });
        return handle;
    }
    async latest(siteId: string): Promise<ResourceOperationState> {
        return (
            [...this.jobs.values()].filter(({ invocation }) => invocation.siteId === siteId).at(-1)?.state ?? {
                operationId: "",
                operationStatus: "none",
                errorMessage: "",
            }
        );
    }
    async run(id: string) {
        const job = [...this.jobs.values()].find(({ handle }) => handle.operationId === id)!;
        const registration = this.registrations.get(job.invocation.capabilityId)!;
        const { http: _http, ...stored } = job.invocation.context;
        job.state.operationStatus = "running";
        try {
            job.result = await registration.execute(job.invocation.input, {
                ...stored,
                signal: new AbortController().signal,
            });
            job.state.operationStatus = "succeeded";
            return job.result;
        } catch (error) {
            job.state.operationStatus = "failed";
            job.state.errorMessage = "Initialization refused";
            throw error;
        }
    }
}
