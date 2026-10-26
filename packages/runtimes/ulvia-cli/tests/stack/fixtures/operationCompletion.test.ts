import { expect, test } from "bun:test";
import { waitForSiteOperation, submitSiteUpgrade } from "./operationCompletion";

const operationId = "00000000-0000-4000-8000-000000000001";
function probe(statuses: readonly string[], result = "completed", statusCode = 200) {
    const requests: unknown[] = [];
    let time = 0;
    const page = {
        url: () => "http://localhost:15100/admin/providers",
        request: {
            fetch: async (url: string, options: unknown) => {
                requests.push({ url, options });
                return {
                    ok: () => statusCode === 200,
                    status: () => statusCode,
                    json: async () => ({
                        operationId,
                        status: statuses[Math.min(requests.length - 1, statuses.length - 1)],
                        result: { status: result },
                    }),
                    dispose: async () => undefined,
                };
            },
        },
        waitForTimeout: async () => {
            time += 250;
        },
    };
    return { page: page as never, requests, now: () => time };
}

test("site upgrade checks wait for queued and running work without resubmitting the command", async () => {
    const f = probe(["queued", "running", "succeeded"]);
    await waitForSiteOperation(f.page, { operationId }, f.now);
    expect(f.requests).toHaveLength(3);
    expect(f.requests).toEqual(
        Array(3).fill({
            url: "http://localhost:15100/.cms/query/ulvia.cms.installations/get-operation",
            options: { method: "QUERY", data: { operationId } },
        }),
    );
});

test("site upgrade checks reject failed or cancelled work and HTTP failures", async () => {
    for (const f of [probe(["failed"]), probe(["succeeded"], "cancelled"), probe(["queued"], "completed", 503)]) {
        await expect(waitForSiteOperation(f.page, { operationId }, f.now)).rejects.toThrow();
        expect(f.requests).toHaveLength(1);
    }
});

test("upgrade submission captures the durable response before redirect without replaying the command", async () => {
    const f = probe(["succeeded"]);
    let handler: (route: never) => Promise<void>;
    let writes = 0;
    let redirected = false;
    const page = {
        ...(f.page as unknown as Record<string, unknown>),
        route: async (_pattern: string, intercept: typeof handler) => {
            handler = intercept;
        },
        unroute: async () => undefined,
    };
    const apply = {
        click: async () =>
            handler({
                fetch: async () => {
                    writes++;
                    return { ok: () => true, json: async () => ({ operationId }), dispose: async () => undefined };
                },
                fulfill: async () => {
                    redirected = true;
                },
                abort: async () => undefined,
            } as never),
    };
    await submitSiteUpgrade(page as never, apply as never, "apply-contract-upgrade");
    expect(writes).toBe(1);
    expect(redirected).toBe(true);
    expect(f.requests).toHaveLength(1);
});
