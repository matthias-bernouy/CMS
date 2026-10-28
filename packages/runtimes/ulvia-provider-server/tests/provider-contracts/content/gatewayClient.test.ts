import { expect, test } from "bun:test";
import { ProviderConnections } from "@bernouy/cms-gateway/provider/node";
import { contentGatewayClient } from "../../../src/runtime/content/gatewayClient";
import { gatewayRoute } from "../../../../../features/cms-gateway/tests/fixtures";

async function fixture() {
    const requests: { url: string; headers: Headers }[] = [];
    let status = 200;
    const edge = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
            requests.push({ url: request.url, headers: new Headers(request.headers) });
            return status === 200 ? Response.json({ items: ["through-edge"] }) : new Response(null, { status });
        },
    });
    try {
        const storage = new Map<string, string>();
        const connections = new ProviderConnections({
            get: async (key) => storage.get(key),
            compareAndSet: async (key, previous, value) => {
                if ((storage.get(key) ?? null) !== previous) {
                    return false;
                }
                storage.set(key, value);
                return true;
            },
        });
        const token = "a".repeat(40);
        await connections.configure({ connectionId: "content", cmsUrl: edge.url.origin, token, generation: 1 });
        const context = { connectionId: "content", siteId: "default" };
        const client = contentGatewayClient({ connections, context, siteId: "default" });
        const release = (await gatewayRoute()).requestedRelease.admission.release;
        return {
            edge,
            requests,
            connections,
            context,
            client,
            release,
            token,
            deny: (value: number) => {
                status = value;
            },
        };
    } catch (error) {
        edge.stop(true);
        throw error;
    }
}

test("Content calls the CMS HTTP binding and reloads rotated credentials without sharing instance connections", async () => {
    const a = await fixture();
    const b = await fixture();
    try {
        const invoke = (f: Awaited<ReturnType<typeof fixture>>) =>
            f.client.invoke(f.release, "item.list", { term: "navigation" }, { authority: "provider" });
        expect((await invoke(a)).output).toEqual({ items: ["through-edge"] });
        expect(new URL(a.requests[0]!.url).pathname).toBe("/.cms/call/catalog/v1/items");
        expect(new URL(a.requests[0]!.url).searchParams.get("term")).toBe("navigation");
        expect(a.requests[0]!.headers.get("authorization")).toBe(`Bearer ${a.token}`);
        expect(a.requests[0]!.headers.get("x-ulvia-provider-authority")).toBe("provider");
        expect(b.requests).toHaveLength(0);
        const rotated = "b".repeat(40);
        await a.connections.configure({
            connectionId: "content",
            cmsUrl: a.edge.url.origin,
            token: rotated,
            generation: 2,
        });
        await invoke(a);
        expect(a.requests.at(-1)!.headers.get("authorization")).toBe(`Bearer ${rotated}`);
        await invoke(b);
        expect(b.requests[0]!.headers.get("authorization")).toBe(`Bearer ${b.token}`);
        expect(await b.connections.get("another-instance")).toBeNull();
        for (const status of [401, 403]) {
            a.deny(status);
            await expect(invoke(a)).rejects.toMatchObject({ code: "FORBIDDEN", status });
        }
        expect(a.requests).toHaveLength(4);
    } finally {
        a.edge.stop(true);
        b.edge.stop(true);
    }
});

test("Content sends delegation through Edge and rejects expired authority before an HTTP call", async () => {
    const f = await fixture();
    try {
        const ticket = "t".repeat(43);
        await f.client.invoke(
            f.release,
            "item.list",
            {},
            {
                authority: "delegated",
                delegation: { ticket, expiresAt: Date.now() + 10_000 },
            },
        );
        expect(f.requests[0]!.headers.get("x-ulvia-provider-authority")).toBe("delegated");
        expect(f.requests[0]!.headers.get("x-ulvia-delegation")).toBe(ticket);
        await expect(
            f.client.invoke(
                f.release,
                "item.list",
                {},
                {
                    authority: "delegated",
                    delegation: { ticket, expiresAt: Date.now() - 1 },
                },
            ),
        ).rejects.toThrow("expired");
        expect(f.requests).toHaveLength(1);
    } finally {
        f.edge.stop(true);
    }
});

test("Content rejects another site or a missing connection before obtaining a CMS client", async () => {
    const f = await fixture();
    try {
        expect(() =>
            contentGatewayClient({
                connections: f.connections,
                siteId: "another-site",
                context: f.context,
            }),
        ).toThrow("instance scope");
        expect(() =>
            contentGatewayClient({
                connections: f.connections,
                siteId: "default",
                context: { siteId: "default" },
            }),
        ).toThrow("connection is unavailable");
        const missing = contentGatewayClient({
            connections: f.connections,
            siteId: "default",
            context: { siteId: "default", connectionId: "missing" },
        });
        await expect(missing.invoke(f.release, "item.list", {}, { authority: "provider" })).rejects.toThrow(
            "not configured",
        );
        expect(f.requests).toHaveLength(0);
    } finally {
        f.edge.stop(true);
    }
});
