import { expect, test } from "bun:test";
import { GatewayProviderClient, ProviderConnections } from "@bernouy/cms-gateway/provider/node";
import { ProviderClientError } from "@bernouy/cms-gateway/provider";
import { CapabilityGateway, GatewayError, GatewayDispatchRejected } from "@bernouy/cms-gateway";
import { createCapabilityHttpHandler } from "@bernouy/cms-gateway/http/handlers";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { gatewayRoute, NOW } from "../fixtures";

const token = "return-credential-" + "a".repeat(32);
const secret = "upstream-credential-" + "b".repeat(32);

test("the generic SDK calls canonical CMS bindings and forwards only signed machine provenance", async () => {
    const received: unknown[] = [];
    const backend = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
            const signed = request.headers.get("authorization")!.slice(7);
            expect(signed).not.toBe(token);
            received.push(verifyProviderInvocationToken(signed, secret));
            return Response.json({ items: ["from-provider"] });
        },
    });
    const route = structuredClone(await gatewayRoute({ access: "admin" }));
    route.installation.installation.endpoint = backend.url.origin;
    route.manifest.admission.manifest.endpoint.allowedOrigins = [backend.url.origin];
    const invoker = new CapabilityGateway({
        now: () => NOW,
        routes: { resolve: async () => route, isCurrent: async () => true },
        transport: new HttpGatewayTransport({
            network: new NodeGatewayHttpNetwork({ resolveToken: async () => secret, allowPrivateAddresses: true }),
        }),
        authorize: async (actor) => actor.kind === "provider" && actor.installationId === "source-a",
    });
    const handler = createCapabilityHttpHandler({
        siteId: "site-a",
        basePath: "/",
        invoker,
        authenticateProvider: async (value) => (value === token ? "source-a" : null),
        resolveActor: async () => {
            throw new GatewayError("not_authorized", "No user session");
        },
    });
    const cms = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
    try {
        const client = new GatewayProviderClient({ cmsUrl: cms.url.origin, token, allowPrivateAddresses: true });
        expect((await client.invoke(route.release.admission.release, "item.list", { term: "test" })).output).toEqual({
            items: ["from-provider"],
        });
        expect(received).toEqual([
            expect.objectContaining({
                sourceInstallationId: "source-a",
                connectionId: "install-a",
                instanceId: "instance:account-a",
            }),
        ]);
        expect(received[0]).not.toHaveProperty("subjectId");
        const forged = await fetch(new URL("/.cms/call/catalog/v1/items", cms.url), {
            headers: { "x-ulvia-source-installation-id": "source-a" },
        });
        expect(forged.status).toBe(403);
        expect(received).toHaveLength(1);
    } finally {
        cms.stop(true);
        backend.stop(true);
    }
});

test("connections reload rotated credentials and SDK auth failures are permanent without leaking tokens", async () => {
    const credentials: string[] = [];
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
            credentials.push(request.headers.get("authorization")!);
            return new Response("denied", { status: 403 });
        },
    });
    const values = new Map<string, string>();
    const connections = new ProviderConnections({
        get: async (key) => values.get(key),
        compareAndSet: async (key, expected, value) => {
            if ((values.get(key) ?? null) !== expected) {
                return false;
            }
            values.set(key, value);
            return true;
        },
    });
    const release = (await gatewayRoute()).release.admission.release;
    try {
        await connections.configure({ connectionId: "connection-a", cmsUrl: server.url.origin, token, generation: 1 });
        const client = connections.client("connection-a", true);
        await expect(client.invoke(release, "item.list", {})).rejects.toMatchObject({
            code: "FORBIDDEN",
            retryable: false,
            status: 403,
        });
        const rotated = "rotated-" + "c".repeat(48);
        await connections.configure({
            connectionId: "connection-a",
            cmsUrl: server.url.origin,
            token: rotated,
            generation: 2,
        });
        await expect(client.invoke(release, "item.list", {})).rejects.toBeInstanceOf(ProviderClientError);
        expect(credentials).toEqual([`Bearer ${token}`, `Bearer ${rotated}`]);
        expect(await connections.get("connection-b")).toBeNull();
        await expect(
            connections.configure({
                connectionId: "connection-b",
                cmsUrl: "https://cms.example/path",
                token,
                generation: 1,
            }),
        ).rejects.toThrow("CMS URL");
    } finally {
        server.stop(true);
    }
});

test("a pre-dispatch quota rejection remains retryable instead of becoming an unknown command outcome", async () => {
    const route = await gatewayRoute({ behavior: { effect: "command", idempotency: "natural", execution: "sync" } });
    const stages: string[] = [];
    const invoker = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        now: () => NOW,
        commandAudit: {
            append: async (event) => {
                stages.push(event.stage);
            },
        },
        transport: {
            send: async () => {
                throw new GatewayDispatchRejected("rate_limited");
            },
        },
    });
    const handler = createCapabilityHttpHandler({
        siteId: "site-a",
        basePath: "/",
        invoker,
        resolveActor: async () => ({ kind: "anonymous" }),
        authenticateProvider: async () => "source-a",
    });
    const response = await handler(
        new Request("http://cms/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: "{}",
        }),
    );
    expect(response.status).toBe(429);
    expect(stages).toEqual(["started", "rejected"]);
    expect(await response.json()).toMatchObject({ failure: { code: "rate_limited", retryable: true } });
});

test("SDK preserves permanent Gateway failures instead of retrying them as malformed Provider output", async () => {
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () => Response.json({ failure: { code: "invalid_input", retryable: false } }, { status: 400 }),
    });
    try {
        const client = new GatewayProviderClient({ cmsUrl: server.url.origin, token, allowPrivateAddresses: true });
        await expect(
            client.invoke((await gatewayRoute()).release.admission.release, "item.list", {}),
        ).rejects.toMatchObject({ code: "invalid_input", retryable: false, status: 400 });
    } finally {
        server.stop(true);
    }
});

test("late or conflicting connection configurations cannot restore a retired credential", async () => {
    const values = new Map<string, string>();
    const connections = new ProviderConnections({
        get: async (key) => values.get(key),
        compareAndSet: async (key, expected, value) => {
            if ((values.get(key) ?? null) !== expected) {
                return false;
            }
            values.set(key, value);
            return true;
        },
    });
    const first = { connectionId: "site-a", cmsUrl: "https://cms.example", token, generation: 1 };
    await Promise.all(Array.from({ length: 8 }, () => connections.configure(first)));
    await connections.configure({ ...first, generation: 2, token: "b".repeat(64) });
    await expect(connections.configure(first)).rejects.toThrow("revision conflict");
    await expect(connections.configure({ ...first, generation: 2 })).rejects.toThrow("revision conflict");
    expect(await connections.get("site-a")).toMatchObject({ generation: 2, token: "b".repeat(64) });
});
