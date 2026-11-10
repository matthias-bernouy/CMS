import { expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import type { ProviderInstanceLifecycle } from "@bernouy/hosting/instances";
import { ProviderOperatorApi } from "../../src/exports/index";
import { instanceRecord } from "./instanceFixture";

const OPERATOR_TOKEN = "operator-token-that-is-long-enough";

test("the operator API protects and exposes instance lifecycle operations", async () => {
    const instance = instanceRecord();
    const creates: unknown[] = [];
    const pages: unknown[] = [];
    const lifecycle = {
        page: async (after: string | null, limit: number) => {
            pages.push({ after, limit });
            return { items: [instance], nextCursor: null };
        },
        get: async (id: string) => (id === instance.id ? instance : null),
        create: async (key: string, input: unknown) => {
            creates.push({ key, input });
            return {
                instance,
                credentials: {
                    instanceAccessToken: "new-instance-token",
                },
            };
        },
        disable: async (id: string) => (id === instance.id ? { ...instance, status: "disabled" } : null),
    } as unknown as ProviderInstanceLifecycle;
    const runner = new BunRunner();
    new ProviderOperatorApi(runner, OPERATOR_TOKEN, lifecycle);
    const server = serveForTest(runner);
    const authorization = { Authorization: `Bearer ${OPERATOR_TOKEN}` };
    try {
        expect((await server.request("GET", "/ulvia/operator/instances")).status).toBe(401);
        expect((await server.request("GET", "/ulvia/operator/profiles", { headers: authorization })).status).toBe(404);
        const listing = await server.request("GET", "/ulvia/operator/instances", { headers: authorization });
        expect((await listing.json()).instances).toHaveLength(1);
        expect(pages).toEqual([{ after: null, limit: 50 }]);
        const next = await server.request("GET", "/ulvia/operator/instances?after=instance:one&limit=2", {
            headers: authorization,
        });
        expect(next.status).toBe(200);
        await next.body?.cancel();
        expect(pages.at(-1)).toEqual({ after: "instance:one", limit: 2 });
        for (const suffix of ["?limit=51", "?limit=0", "?limit=1&limit=2", "?after=unknown", "?unexpected=1"]) {
            const refused = await server.request("GET", `/ulvia/operator/instances${suffix}`, {
                headers: authorization,
            });
            expect(refused.status).toBe(400);
            await refused.body?.cancel();
        }
        expect(pages).toHaveLength(2);

        const created = await server.request("POST", "/ulvia/operator/instances", {
            headers: { ...authorization, "content-type": "application/json", "idempotency-key": "create-one" },
            body: JSON.stringify({
                label: "One",
                cmsUrl: "http://127.0.0.1:5100",
                gatewayUrl: "http://edge.internal:3000",
                administrator: { email: "admin@example.test", password: "long-enough-password" },
            }),
        });
        expect(created.status).toBe(201);
        expect((await created.json()).credentials.instanceAccessToken).toBe("new-instance-token");
        expect(creates).toHaveLength(1);

        const disabled = await server.request(
            "POST",
            `/ulvia/operator/instances/${encodeURIComponent(instance.id)}/disable`,
            { headers: authorization },
        );
        expect((await disabled.json()).status).toBe("disabled");
        expect((await server.request("GET", "/ulvia/operator/instances", { headers: authorization })).status).toBe(200);
    } finally {
        server.stop();
    }
});
