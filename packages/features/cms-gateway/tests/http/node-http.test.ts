import { expect, test } from "bun:test";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { selectGatewayAddress } from "cms-gateway/invocation/node-http/addressPolicy";

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
            pathAndQuery: "/ulvia/report",
            method: "GET",
            headers: {},
            requestId: "request-1",
            providerTokenRef: "token-ref",
            authentication: { kind: "provider-control" },
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
        pathAndQuery: "/ulvia/report",
        method: "GET",
        headers: {},
        requestId: "request-1",
        providerTokenRef: "token-ref",
        authentication: { kind: "provider-control" as const },
        signal: new AbortController().signal,
    };
    await expect(network.exchange(request)).rejects.toThrow("literal provider origin");
    await expect(
        network.exchange({ ...request, origin: "https://provider.example.com", headers: { authorization: "forged" } }),
    ).rejects.toThrow("forbidden header");
    expect(sent).toBe(0);
});

test("provider control credentials are limited to the public runtime report", async () => {
    const sent: string[] = [];
    const network = new NodeGatewayHttpNetwork({
        resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }],
        resolveToken: async () => "instance-access-token-that-is-long-enough",
        sendPinned: async ({ url }) => {
            sent.push(url.pathname);
            return Response.json({});
        },
    });
    const request = {
        origin: "https://provider.example.com",
        method: "GET" as const,
        headers: {},
        requestId: "request-1",
        providerTokenRef: "token-ref",
        authentication: { kind: "provider-control" as const },
        signal: new AbortController().signal,
    };
    await network.exchange({ ...request, pathAndQuery: "/ulvia/report" });
    await expect(
        network.exchange({ ...request, pathAndQuery: "/delivery/sitemap?path=%2Fsitemap.xml" }),
    ).rejects.toThrow("metadata endpoints");
    expect(sent).toEqual(["/ulvia/report"]);
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
                    pathAndQuery: "/ulvia/report",
                    method: "GET",
                    headers: {},
                    requestId: "request-1",
                    providerTokenRef: "token-ref",
                    authentication: { kind: "provider-control" },
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

test("a composition root can explicitly admit its controlled private Provider network", async () => {
    const origin = new URL("http://provider.internal:5103");
    expect(selectGatewayAddress(origin, [{ address: "172.20.0.8", family: 4 }], true).address).toBe("172.20.0.8");
    const network = new NodeGatewayHttpNetwork({
        allowPrivateAddresses: true,
        resolveAddresses: async () => [{ address: "172.20.0.8", family: 4 }],
        resolveToken: async () => "instance-access-token-that-is-long-enough",
        sendPinned: async () => Response.json({}),
    });
    await expect(
        network.exchange({
            origin: origin.origin,
            pathAndQuery: "/ulvia/report",
            method: "GET",
            headers: {},
            requestId: "request-private-network",
            providerTokenRef: "token-ref",
            authentication: { kind: "provider-control" },
            signal: new AbortController().signal,
        }),
    ).resolves.toBeInstanceOf(Response);
    expect(() =>
        selectGatewayAddress(new URL("http://metadata.internal"), [{ address: "169.254.169.254", family: 4 }], true),
    ).toThrow("non-public");
    expect(() =>
        selectGatewayAddress(new URL("http://public.example"), [{ address: "8.8.8.8", family: 4 }], true),
    ).toThrow("require HTTPS");
});
