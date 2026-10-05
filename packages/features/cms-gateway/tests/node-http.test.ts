import { expect, test } from "bun:test";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { selectGatewayAddress } from "cms-gateway/invocation/node-http/addressPolicy";
import { toResponse } from "cms-gateway/invocation/node-http/nodeHttpRequest";
import { gatewayRoute } from "./fixtures";

test("node transport pins the target and injects trusted context", async () => {
    const sent: Array<{ url: string; address: string; headers: Readonly<Record<string, string>> }> = [];
    const fixture = await gatewayRoute();
    const transport = new HttpGatewayTransport({
        network: new NodeGatewayHttpNetwork({
            resolveAddresses: async () => [{ address: "127.0.0.1", family: 4 }],
            resolveToken: async () => "secret-token",
            sendPinned: async (request) => {
                sent.push({ url: request.url.href, address: request.address.address, headers: request.headers });
                return Response.json({ items: ["one"] });
            },
        }),
    });
    const result = await transport.send({
        requestId: "request-1",
        siteId: "site-a",
        installationId: "install-a",
        endpoint: "http://127.0.0.1:8080",
        providerTokenRef: "token-ref",
        release: fixture.release.admission.release,
        capability: fixture.release.admission.release.capabilities[0]!,
        binding: fixture.release.admission.bindings[0]!.binding,
        input: { term: "one" },
        invocationOrigin: "delivery",
        actorKind: "anonymous",
    });
    expect(result).toMatchObject({ status: 200, output: { items: ["one"] } });
    expect(sent).toEqual([
        {
            url: "http://127.0.0.1:8080/v1/items?term=%22one%22",
            address: "127.0.0.1",
            headers: {
                accept: "application/json",
                authorization: "Bearer secret-token",
                "x-ulvia-request-id": "request-1",
                "x-ulvia-origin": "delivery",
                "x-ulvia-actor-kind": "anonymous",
            },
        },
    ]);
});

test("provider credentials remain opaque while their secret value is forwarded byte-for-byte", async () => {
    const resolvedReferences: string[] = [];
    const sentAuthorizations: string[] = [];
    const opaqueReference = "provider-secret/account-a/installation-private-ref";
    const opaqueCredential = "account=a;cms-instance=private-42;route=provider-owned";
    const fixture = await gatewayRoute();
    const transport = new HttpGatewayTransport({
        network: new NodeGatewayHttpNetwork({
            resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }],
            resolveToken: async (reference) => {
                resolvedReferences.push(reference);
                return opaqueCredential;
            },
            sendPinned: async (request) => {
                sentAuthorizations.push(request.headers.authorization ?? "");
                return Response.json({ items: [] });
            },
        }),
    });

    await transport.send({
        requestId: "request-opaque",
        siteId: "site-a",
        installationId: "install-a",
        endpoint: "https://provider.example.com",
        providerTokenRef: opaqueReference,
        release: fixture.release.admission.release,
        capability: fixture.release.admission.release.capabilities[0]!,
        binding: fixture.release.admission.bindings[0]!.binding,
        input: { term: "opaque" },
        invocationOrigin: "control",
        actorKind: "user",
    });

    expect(resolvedReferences).toEqual([opaqueReference]);
    expect(sentAuthorizations).toEqual([`Bearer ${opaqueCredential}`]);
});

test("node transport rejects mixed public and private DNS answers before reading secrets", async () => {
    let secretsRead = 0;
    const network = new NodeGatewayHttpNetwork({
        resolveAddresses: async () => [
            { address: "8.8.8.8", family: 4 },
            { address: "127.0.0.1", family: 4 },
        ],
        resolveToken: async () => {
            secretsRead += 1;
            return "secret-token";
        },
    });
    await expect(
        network.exchange({
            origin: "https://provider.example.com",
            pathAndQuery: "/v1/items",
            method: "GET",
            headers: {},
            requestId: "request-1",
            installationId: "install-a",
            providerTokenRef: "token-ref",
            invocationOrigin: "delivery",
            actorKind: "anonymous",
            signal: new AbortController().signal,
        }),
    ).rejects.toThrow("non-public");
    expect(secretsRead).toBe(0);
});

test("node transport rejects a forged literal address and reserved headers", async () => {
    let sent = 0;
    const network = new NodeGatewayHttpNetwork({
        resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }],
        resolveToken: async () => "secret-token",
        sendPinned: async () => {
            sent += 1;
            return Response.json({});
        },
    });
    const request = {
        origin: "https://127.0.0.1",
        pathAndQuery: "/v1/items",
        method: "GET",
        headers: {},
        requestId: "request-1",
        installationId: "install-a",
        providerTokenRef: "token-ref",
        invocationOrigin: "delivery" as const,
        actorKind: "anonymous" as const,
        signal: new AbortController().signal,
    };
    await expect(network.exchange(request)).rejects.toThrow("literal provider origin");
    await expect(
        network.exchange({ ...request, origin: "https://provider.example.com", headers: { authorization: "forged" } }),
    ).rejects.toThrow("forbidden header");
    expect(sent).toBe(0);
});

test("node transport aborts DNS and secret lookups that outlast the request deadline", async () => {
    for (const phase of ["dns", "secret"] as const) {
        let sent = 0;
        const network = new NodeGatewayHttpNetwork({
            resolveAddresses: async () =>
                phase === "dns" ? new Promise<never>(() => undefined) : [{ address: "8.8.8.8", family: 4 }],
            resolveToken: async () => (phase === "secret" ? new Promise<never>(() => undefined) : "token"),
            sendPinned: async () => {
                sent += 1;
                return Response.json({});
            },
        });
        const result = await Promise.race([
            network
                .exchange({
                    origin: "https://provider.example.com",
                    pathAndQuery: "/v1/items",
                    method: "GET",
                    headers: {},
                    requestId: "request-1",
                    installationId: "install-a",
                    providerTokenRef: "token-ref",
                    invocationOrigin: "delivery",
                    actorKind: "anonymous",
                    signal: AbortSignal.timeout(5),
                })
                .then(
                    () => "sent",
                    (error: Error) => error.name,
                ),
            Bun.sleep(100).then(() => "stalled"),
        ]);
        expect(result).toBe("TimeoutError");
        expect(sent).toBe(0);
    }
});

test("node response bridge pauses the source until the web body is consumed", async () => {
    const incoming = Readable.from(Array.from({ length: 32 }, () => Buffer.alloc(1024)));
    Object.assign(incoming, { statusCode: 200, headers: {} });
    let emitted = 0;
    const response = toResponse(incoming as IncomingMessage, "GET");
    incoming.on("data", () => {
        emitted += 1;
    });
    await Bun.sleep(10);
    expect(emitted).toBe(1);
    expect((await response.arrayBuffer()).byteLength).toBe(32 * 1024);
    expect(emitted).toBe(32);
});

test("address policy refuses private, mapped, and documentation ranges", () => {
    const origin = new URL("https://provider.example.com");
    for (const address of [
        "10.0.0.1",
        "100.64.0.1",
        "127.0.0.1",
        "169.254.1.1",
        "172.16.0.1",
        "192.168.1.1",
        "192.0.2.1",
        "192.88.99.1",
        "198.18.0.1",
        "198.51.100.1",
        "203.0.113.1",
    ]) {
        expect(() => selectGatewayAddress(origin, [{ address, family: 4 }])).toThrow("non-public");
    }
    for (const address of [
        "::1",
        "fc00::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "2001::1",
        "2001:2::1",
        "2001:db8::1",
        "2001:0db8::1",
        "2002:c0a8:101::1",
        "3fff::1",
    ]) {
        expect(() => selectGatewayAddress(origin, [{ address, family: 6 }])).toThrow("non-public");
    }
    expect(selectGatewayAddress(origin, [{ address: "8.8.8.8", family: 4 }]).address).toBe("8.8.8.8");
    expect(selectGatewayAddress(origin, [{ address: "2606:4700::1111", family: 6 }]).address).toBe("2606:4700::1111");
});
