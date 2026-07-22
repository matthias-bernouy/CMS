import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

export async function assertDeadlineWorker(
    { deadlineWorker, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    let deadlineWorkerBody: unknown;
    const deadlineWorkerResponse = await executeFunction(
        deadlineWorker,
        new Request("https://cms.test/functions/processDueOrderDeadlines", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ runKey: "deadline-run-1", limit: 5 }),
        }),
        {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    deadlineWorkerBody = await request.json();
                    return Response.json({ runKey: "deadline-run-1", processed: 0, events: [] });
                },
            },
        },
    );
    expect(deadlineWorkerResponse.status).toBe(200);
    expect(deadlineWorkerBody).toEqual({ runKey: "deadline-run-1", limit: 5 });
}
