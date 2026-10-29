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

test("upgrade submission observes the acknowledgement and fresh durable operation without replay or response-body reads", async () => {
    const f = probe(["succeeded"]);
    let writes = 0;
    let lists = 0;
    let accept!: (response: unknown) => void;
    const underlying = f.page as unknown as { request: { fetch: (url: string, options: unknown) => Promise<unknown> } };
    const page = {
        ...(f.page as unknown as Record<string, unknown>),
        request: {
            fetch: async (url: string, options: unknown) => {
                if (!url.endsWith("/list-operations")) {
                    return underlying.request.fetch(url, options);
                }
                lists++;
                return {
                    ok: () => true,
                    json: async () => ({
                        items: lists === 1 ? [] : [{ operationId, capabilityId: "apply-contract-upgrade" }],
                    }),
                    dispose: async () => undefined,
                };
            },
        },
        waitForResponse: async (predicate: (response: unknown) => boolean) => {
            const response = await new Promise<unknown>((resolve) => {
                accept = resolve;
            });
            expect(predicate(response)).toBe(true);
            return response;
        },
    };
    const apply = {
        click: async (options: { noWaitAfter: boolean }) => {
            expect(options.noWaitAfter).toBe(true);
            writes++;
            accept({
                request: () => ({ method: () => "POST" }),
                url: () => "http://localhost/.cms/mutation/ulvia.cms.installations/apply-contract-upgrade",
                status: () => 202,
                json: () => {
                    throw new Error("Response navigated away");
                },
            });
        },
    };
    await submitSiteUpgrade(page as never, apply as never, "apply-contract-upgrade");
    expect(writes).toBe(1);
    expect(lists).toBe(2);
    expect(f.requests).toHaveLength(1);
});

test.each(["old", "ambiguous"])("upgrade submission rejects an %s operation inventory", async (mode) => {
    let lists = 0;
    const item = { operationId, capabilityId: "apply-collection-upgrade" };
    const other = { ...item, operationId: "00000000-0000-4000-8000-000000000002" };
    const f = probe(["succeeded"]);
    const page = {
        ...(f.page as unknown as Record<string, unknown>),
        request: {
            fetch: async () => {
                lists++;
                const items = lists === 1 ? (mode === "old" ? [item] : []) : mode === "old" ? [item] : [item, other];
                return { ok: () => true, json: async () => ({ items }), dispose: async () => undefined };
            },
        },
        waitForResponse: async () => ({ status: () => 202 }),
    };
    await expect(
        submitSiteUpgrade(page as never, { click: async () => undefined } as never, "apply-collection-upgrade"),
    ).rejects.toThrow("unambiguous new operation");
    expect(lists).toBe(2);
    expect(f.requests).toHaveLength(0);
});
