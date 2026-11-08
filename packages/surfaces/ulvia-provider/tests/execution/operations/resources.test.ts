import { expect, test } from "bun:test";
import { MemoryProviderOperationStore, ProviderOperationExecutor } from "@bernouy/ulvia-provider";
import type { ProviderOperationSummary } from "@bernouy/ulvia-provider";
import { createResourceOperationQuery } from "../../../src/capabilities/features/services/resources";

class SummaryStore extends MemoryProviderOperationStore {
    calls: unknown[] = [];
    override async latest(siteId: string, contractId: string, capabilityId: string): Promise<ProviderOperationSummary> {
        this.calls.push({ siteId, contractId, capabilityId });
        return {
            id: "operation-a",
            siteId,
            contractId,
            capabilityId,
            status: "failed",
            revision: 1,
            createdAt: "2026-11-08T00:00:00.000Z",
            updatedAt: "2026-11-08T00:00:00.000Z",
            errorCode: "CORE_UNAVAILABLE",
            errorOutput: { message: "PRIVATE persisted storage failure" },
        };
    }
    override async get(): Promise<never> {
        throw new Error("Private operation payload must not be read");
    }
}
test("Resources progress performs one scoped metadata lookup and never exposes persisted private failures", async () => {
    const store = new SummaryStore();
    const query = createResourceOperationQuery(new ProviderOperationExecutor(store));
    expect(await query("site-a", "example/specialized-resources")).toEqual({
        operationId: "operation-a",
        operationStatus: "failed",
        errorMessage: "Setup stopped. Refresh its status and resume.",
    });
    expect(store.calls).toEqual([
        {
            siteId: "site-a",
            contractId: "example/specialized-resources",
            capabilityId: "initialization.apply",
        },
    ]);
});
